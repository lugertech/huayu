import { t } from "@/i18n";
import OpenAI from "openai";
import { Stream } from "openai/streaming";
import {
  CAPABILITY_LABELS,
  connectionFor,
  modelEndpoint,
  requireConnection,
  type Capability,
  type Connection,
} from "./settings";
import { ModelConnectionError } from "./errors";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
}
export interface ChatOptions {
  capability?: "text" | "vision";
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  connection?: Connection;
  json?: boolean;
}

/** Credentials come from this browser; requests go directly to the chosen service. */
async function modelRequest<T>(
  capability: Capability,
  connection: Connection,
  signal: AbortSignal | undefined,
  request: (client: OpenAI, signal: AbortSignal) => Promise<T>,
  timeoutMs = 180_000,
): Promise<T> {
  requireConnection(capability, connection);
  signal?.throwIfAborted();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const combined = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;
  const client = new OpenAI({
    baseURL: modelEndpoint(connection, "").replace(/\/$/, ""),
    // The SDK requires a value; the fetch boundary removes it for keyless services.
    apiKey: connection.apiKey.trim() || "local-no-key",
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    timeout: timeoutMs,
    fetch: (url, options) => {
      const headers = new Headers(options?.headers);
      for (const name of [...headers.keys()])
        if (name.startsWith("x-stainless-") || name === "user-agent")
          headers.delete(name);
      if (!connection.apiKey.trim() || capability === "search")
        headers.delete("Authorization");
      return fetch(url, {
        ...options,
        headers,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
    },
  });
  try {
    return await request(client, combined);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ModelConnectionError) throw error;
    const values = { capability: CAPABILITY_LABELS[capability] };
    let message: string;
    if (
      timeout.signal.aborted ||
      error instanceof OpenAI.APIConnectionTimeoutError
    )
      message = t("models.connection.timeout", values);
    else if (error instanceof OpenAI.APIError) {
      if (error.status === 401)
        message = t("models.connection.unauthorized", values);
      else if (error.status === 403)
        message = t("models.connection.forbidden", values);
      else if (error.status === 404)
        message = t("models.connection.notFound", values);
      else if (error.status === 429)
        message = t(
          error.code === "insufficient_quota"
            ? "models.connection.quota"
            : "models.connection.rateLimit",
          values,
        );
      else if (error.status === 408 || error.status === 504)
        message = t("models.connection.timeout", values);
      else if (error.status && error.status >= 500)
        message = t("models.connection.unavailable", values);
      else
        message = t("models.connection.rejected", {
          ...values,
          status: error.status || "",
        });
    } else if (
      error instanceof OpenAI.APIConnectionError ||
      error instanceof TypeError
    )
      message = t("models.connection.network", values);
    else message = t("models.connection.invalidResponse", values);
    throw new ModelConnectionError(capability, message);
  } finally {
    clearTimeout(timer);
  }
}

/** Use the SDK's SSE decoder, including UTF-8 split across network chunks. */
export async function readChatStream(
  response: Response,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body)
    throw new Error(t("models.theModelServiceReturnedNoContent"));
  const controller = new AbortController();
  const stream =
    Stream.fromSSEResponse<OpenAI.Chat.Completions.ChatCompletionChunk>(
      response,
      controller,
    );
  let result = "";
  for await (const chunk of stream) {
    signal?.throwIfAborted();
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string") {
      result += delta;
      onDelta?.(delta);
    }
  }
  signal?.throwIfAborted();
  if (!result.trim())
    throw new Error(t("models.theModelServiceReturnedEmptyContent"));
  return result;
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const capability = options.capability || "text";
  const connection = options.connection || connectionFor(capability);
  return modelRequest(
    capability,
    connection,
    options.signal,
    async (client, signal) => {
      const response = await client.chat.completions
        .create(
          {
            model: connection.model.trim(),
            messages:
              messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            stream: !!options.onDelta,
            ...(options.json
              ? { response_format: { type: "json_object" } }
              : {}),
          },
          { signal },
        )
        .asResponse();
      if (
        (response.headers.get("content-type") || "").includes(
          "text/event-stream",
        )
      )
        return readChatStream(response, options.onDelta, signal);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((part) => part.text || "").join("")
            : "";
      if (!text.trim())
        throw new ModelConnectionError(
          capability,
          t("models.theModelServiceReturnedEmptyContent"),
        );
      options.onDelta?.(text);
      return text;
    },
  );
}

export function parseModelJSON<T = Record<string, unknown>>(text: string): T {
  const value = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(t("models.theModelReturnedAnInvalidFormat"));
  }
}

export async function generateImage(
  prompt: string,
  size: string,
  images: Blob[] = [],
  signal?: AbortSignal,
): Promise<Blob> {
  const connection = connectionFor("image");
  return modelRequest(
    "image",
    connection,
    signal,
    async (client, requestSignal) => {
      const files = images.map(
        (image, index) =>
          new File([image], `image-${index}.png`, {
            type: image.type || "image/png",
          }),
      );
      const params = {
        model: connection.model.trim(),
        prompt,
        n: 1,
        size: size as OpenAI.Images.ImageGenerateParams["size"],
      };
      const data = images.length
        ? await client.images.edit(
            {
              ...params,
              image: files.length === 1 ? files[0] : files,
            },
            { signal: requestSignal },
          )
        : await client.images.generate(params, { signal: requestSignal });
      const value = data?.data?.[0];
      if (value?.b64_json)
        return (await fetch(`data:image/png;base64,${value.b64_json}`)).blob();
      if (value?.url) {
        const url = new URL(value.url);
        if (!["http:", "https:"].includes(url.protocol))
          throw new ModelConnectionError(
            "image",
            t("models.theModelReturnedAnInvalidImageUrl"),
          );
        const image = await fetch(url, {
          signal: requestSignal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!image.ok)
          throw new ModelConnectionError(
            "image",
            t("models.cannotLoadTheGeneratedImage"),
          );
        return image.blob();
      }
      throw new ModelConnectionError(
        "image",
        t("models.theModelReturnedNoImage"),
      );
    },
    300_000,
  );
}

export async function synthesizeSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const connection = connectionFor("speech");
  return modelRequest(
    "speech",
    connection,
    signal,
    async (client, requestSignal) => {
      const response = await client.audio.speech.create(
        {
          model: connection.model.trim(),
          input: text,
          voice: connection.voice || "alloy",
          response_format: "mp3",
        },
        { signal: requestSignal },
      );
      if ((response.headers.get("content-type") || "").includes("json"))
        throw new ModelConnectionError(
          "speech",
          t("models.connection.invalidResponse", {
            capability: CAPABILITY_LABELS.speech,
          }),
        );
      return response.blob();
    },
  );
}

export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}
export interface Transcription {
  text: string;
  segments: SpeechSegment[];
}

export async function transcribeDetailed(
  file: Blob,
  name = "audio.webm",
  signal?: AbortSignal,
): Promise<Transcription> {
  const connection = connectionFor("transcription");
  return modelRequest(
    "transcription",
    connection,
    signal,
    async (client, requestSignal) => {
      const data = await client.audio.transcriptions.create(
        {
          file: new File([file], name, { type: file.type || "audio/webm" }),
          model: connection.model.trim(),
          response_format: connection.transcriptionFormat || "verbose_json",
        },
        { signal: requestSignal },
      );
      if (typeof data?.text !== "string")
        throw new ModelConnectionError(
          "transcription",
          t("models.theModelReturnedNoTranscript"),
        );
      const segments =
        "segments" in data && Array.isArray(data.segments)
          ? data.segments
              .filter(
                (segment) =>
                  Number.isFinite(segment.start) &&
                  Number.isFinite(segment.end) &&
                  typeof segment.text === "string",
              )
              .map((segment) => ({
                start: Math.max(0, segment.start),
                end: Math.max(segment.start, segment.end),
                text: segment.text,
                ...(typeof segment.speaker === "string"
                  ? { speaker: segment.speaker }
                  : {}),
              }))
          : [];
      return { text: data.text, segments };
    },
  );
}

export async function transcribe(
  file: Blob,
  name = "audio.webm",
  signal?: AbortSignal,
): Promise<string> {
  return (await transcribeDetailed(file, name, signal)).text;
}

export async function searchWeb(
  query: string,
  signal?: AbortSignal,
  connection = connectionFor("search"),
): Promise<string> {
  return modelRequest(
    "search",
    connection,
    signal,
    async (client, requestSignal) => {
      if (connection.provider === "brave") {
        const data = await client.get<{
          web?: {
            results?: { title: string; url: string; description: string }[];
          };
        }>("/res/v1/web/search", {
          query: { q: query },
          headers: { "X-Subscription-Token": connection.apiKey.trim() },
          signal: requestSignal,
        });
        return (data.web?.results || [])
          .slice(0, 6)
          .map((value) => `${value.title}\n${value.url}\n${value.description}`)
          .join("\n\n");
      }
      const data = await client.post<{
        results?: { title: string; url: string; content: string }[];
      }>("/search", {
        body: { api_key: connection.apiKey.trim(), query, max_results: 6 },
        signal: requestSignal,
      });
      return (data.results || [])
        .map((value) => `${value.title}\n${value.url}\n${value.content}`)
        .join("\n\n");
    },
    30_000,
  );
}

export async function testConnection(
  capability: Capability,
  connection: Connection,
  signal?: AbortSignal,
): Promise<{ status: "success" | "warning"; message: string }> {
  return modelRequest(
    capability,
    connection,
    signal,
    async (client, requestSignal) => {
      if (capability === "search") {
        await searchWeb("Huayu", requestSignal, connection);
        return {
          status: "success",
          message: t("models.connection.searchTestPassed"),
        };
      }
      if (capability === "text" || capability === "vision") {
        await chat([{ role: "user", content: "Reply with OK." }], {
          connection,
          signal: requestSignal,
          capability,
        });
        return capability === "text"
          ? { status: "success", message: t("models.connected") }
          : {
              status: "warning",
              message: t("models.connection.visionTestLimited"),
            };
      }
      let data: OpenAI.Models.ModelsPage;
      try {
        data = await client.models.list({ signal: requestSignal });
      } catch (error) {
        if (
          error instanceof OpenAI.APIError &&
          [404, 405, 501].includes(error.status || 0)
        )
          return {
            status: "warning",
            message: t("models.connection.modelListUnsupported"),
          };
        throw error;
      }
      if (!Array.isArray(data.data))
        throw new ModelConnectionError(
          capability,
          t("models.theServiceReturnedNoModelList"),
        );
      if (!data.data.some((model) => model.id === connection.model.trim()))
        return {
          status: "warning",
          message: t("models.serviceConnectedButThisModelWasntInTheList"),
        };
      return {
        status: "warning",
        message: t("models.connection.capabilityTestLimited", {
          capability: CAPABILITY_LABELS[capability],
        }),
      };
    },
    15_000,
  );
}
