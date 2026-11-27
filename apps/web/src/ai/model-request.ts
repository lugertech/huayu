import { APIError } from "openai/core/error";
import { ModelConnectionError } from "./errors";
import {
  CAPABILITY_MESSAGE_KEYS,
  configurationIssue,
  connectionBaseUrl,
  modelEndpoint,
  type Capability,
  type Connection,
} from "./settings";
import { LocalizedError, type ErrorTranslation } from "@/i18n/errors";

const MODEL_TIMEOUT = 180_000;
export const IMAGE_TIMEOUT = 300_000;
export const PROBE_TIMEOUT = 15_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function invalidModelResponse(capability: Capability) {
  return new ModelConnectionError(capability, {
    key: "models.connection.invalidResponse",
    values: { capability: { key: CAPABILITY_MESSAGE_KEYS[capability] } },
  });
}

export class UnsupportedVisionError extends ModelConnectionError {}

function providerError(
  capability: Capability,
  status: number | undefined,
  body: unknown,
) {
  const error = isRecord(body) && isRecord(body.error) ? body.error : body;
  const code =
    isRecord(error) && typeof error.code === "string" ? error.code : "";
  const message =
    isRecord(error) && typeof error.message === "string" ? error.message : "";
  const values = { capability: { key: CAPABILITY_MESSAGE_KEYS[capability] } };
  let translation: ErrorTranslation;
  if (
    capability === "vision" &&
    (status === 400 || status === 415 || status === 422) &&
    (/^(?:unsupported_image_input|unsupported_modality|model_not_multimodal)$/i.test(
      code,
    ) ||
      /\b(?:does not support|doesn't support|cannot accept|unsupported)\s+(?:(?:the|this)\s+)?(?:vision|image inputs?|images|['"]?(?:input_image|image_url))\b(?!\s+(?:formats?|sizes?|resolution|detail)\b)/i.test(
        message,
      ) ||
      /\bonly supports? text\b|\bonly text (?:inputs? )?(?:(?:is|are) )?supported\b|\b(?:input_image|image_url)\b.{0,40}\bonly supported by certain models\b/i.test(
        message,
      ))
  )
    return new UnsupportedVisionError(capability, {
      key: "models.connection.rejected",
      values: { ...values, status },
    });
  if (status === 401 || code === "invalid_api_key")
    translation = { key: "models.connection.unauthorized", values };
  else if (status === 403)
    translation = { key: "models.connection.forbidden", values };
  else if (status === 404 || code === "model_not_found")
    translation = { key: "models.connection.notFound", values };
  else if (
    code === "insufficient_quota" ||
    (capability === "search" && status === 432)
  )
    translation = { key: "models.connection.quota", values };
  else if (status === 429 || code === "rate_limit_exceeded")
    translation = { key: "models.connection.rateLimit", values };
  else if (status === 408 || status === 504)
    translation = { key: "models.connection.timeout", values };
  else if (status >= 500 || (capability === "search" && status === 434))
    translation = { key: "models.connection.unavailable", values };
  else if (status === undefined) return invalidModelResponse(capability);
  else
    translation = {
      key: "models.connection.rejected",
      values: { ...values, status },
    };
  return new ModelConnectionError(capability, translation);
}

type ModelFetch = (
  path: string,
  body?: Record<string, unknown> | FormData,
  headers?: HeadersInit,
) => Promise<Response>;

/** Applies one request deadline through the last response byte. */
export async function modelRequest<T>(
  capability: Capability,
  connection: Connection,
  signal: AbortSignal | undefined,
  run: (request: ModelFetch, signal: AbortSignal) => Promise<T>,
  timeoutMs = MODEL_TIMEOUT,
): Promise<T> {
  signal?.throwIfAborted();
  const issue = configurationIssue(capability, connection);
  if (issue) throw issue.error;
  const baseUrl = connectionBaseUrl(connection);
  const apiKey = connection.apiKey.trim();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;
  try {
    const result = await run(async (path, body, requestHeaders) => {
      requestSignal.throwIfAborted();
      const headers = new Headers(requestHeaders);
      if (apiKey) headers.set("Authorization", "Bearer " + apiKey);
      const form = body instanceof FormData;
      if (body && !form) headers.set("Content-Type", "application/json");
      const response = await fetch(modelEndpoint({ baseUrl }, path), {
        method: body ? "POST" : "GET",
        headers,
        body: form ? body : body && JSON.stringify(body),
        signal: requestSignal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (!response.ok) {
        const error: unknown = await response.json().catch(() => undefined);
        throw providerError(capability, response.status, error);
      }
      return response;
    }, requestSignal);
    requestSignal.throwIfAborted();
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    const values = { capability: { key: CAPABILITY_MESSAGE_KEYS[capability] } };
    if (timeout.signal.aborted)
      throw new ModelConnectionError(capability, {
        key: "models.connection.timeout",
        values,
      });
    if (error instanceof LocalizedError) throw error;
    if (error instanceof APIError)
      throw providerError(capability, error.status, error.error);
    if (error instanceof TypeError)
      throw new ModelConnectionError(capability, {
        key: "models.connection.network",
        values,
      });
    throw invalidModelResponse(capability);
  } finally {
    clearTimeout(timer);
  }
}

export function isEventStream(response: Response) {
  return response.headers.get("content-type")?.includes("text/event-stream");
}

export async function* modelEvents(response: Response, signal?: AbortSignal) {
  const { Stream } = await import("openai/streaming");
  signal?.throwIfAborted();
  const decoder = new AbortController();
  const abort = () => decoder.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const stream = Stream.fromSSEResponse<unknown>(
      response,
      decoder,
      undefined,
      true,
    );
    for await (const event of stream) {
      signal?.throwIfAborted();
      if (!isRecord(event) || !isRecord(event.data)) throw new SyntaxError();
      yield {
        name: typeof event.event === "string" ? event.event : "",
        body: event.data,
      };
    }
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function blobDataUrl(blob: Blob, contentType = blob.type) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize)
    chunks.push(
      String.fromCharCode(...bytes.subarray(start, start + chunkSize)),
    );
  return "data:" + contentType + ";base64," + btoa(chunks.join(""));
}
