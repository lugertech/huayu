import { getLocale, type Locale } from "@/i18n";
import { LocalizedError } from "@/i18n/errors";
import {
  requestSpeech,
  requestTranscription,
  type Transcription,
} from "./aliyun-speech";
import { ModelConnectionError } from "./errors";
import {
  blobDataUrl,
  decodeBase64,
  IMAGE_TIMEOUT,
  invalidModelResponse,
  isEventStream,
  isRecord,
  modelEvents,
  modelRequest,
  PROBE_TIMEOUT,
  UnsupportedVisionError,
} from "./model-request";
import {
  recordSuccessfulCheck,
  requireConnection,
  type CheckResult,
  type Connection,
  type ImageConnection,
  type LanguageConnection,
  type ModelCheck,
  type SearchConnection,
  type SpeechConnection,
  type TranscriptionConnection,
} from "./settings";

export type { SpeechSegment, Transcription } from "./aliyun-speech";

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
  connection?: LanguageConnection;
  json?: boolean;
}

function firstChoice(body: unknown) {
  const choice: unknown =
    isRecord(body) && Array.isArray(body.choices) ? body.choices[0] : undefined;
  return isRecord(choice) ? choice : undefined;
}

export async function readChatStream(
  response: Response,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body)
    throw new LocalizedError({
      key: "models.theModelServiceReturnedNoContent",
    });
  let result = "";
  for await (const { body } of modelEvents(response, signal)) {
    const delta = firstChoice(body)?.delta;
    if (isRecord(delta) && typeof delta.content === "string") {
      result += delta.content;
      onDelta?.(delta.content);
    }
  }
  if (!result.trim())
    throw new LocalizedError({
      key: "models.theModelServiceReturnedEmptyContent",
    });
  return result;
}

function responsesText(body: unknown): string {
  if (!isRecord(body)) return "";
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return "";
  const output: unknown[] = body.output;
  return output
    .filter(isRecord)
    .flatMap((item): unknown[] =>
      item.type === "message" && Array.isArray(item.content)
        ? item.content
        : [],
    )
    .filter(isRecord)
    .map((part) =>
      part.type === "output_text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("");
}

function requestChat(
  messages: ChatMessage[],
  connection: LanguageConnection,
  {
    capability = "text",
    signal,
    onDelta,
    json,
  }: Omit<ChatOptions, "connection">,
  timeout?: number,
): Promise<string> {
  return modelRequest(
    capability,
    connection,
    signal,
    async (request, requestSignal) => {
      const model = connection.model.trim();
      const stream = Boolean(onDelta);
      const responses = connection.protocol === "responses";
      const response = responses
        ? await request("responses", {
            model,
            input: messages.map(({ role, content }) => ({
              role,
              content:
                typeof content === "string"
                  ? content
                  : content.map((part) =>
                      part.type === "text"
                        ? { type: "input_text", text: part.text }
                        : {
                            type: "input_image",
                            image_url: part.image_url.url,
                          },
                    ),
            })),
            stream,
            store: false,
            ...(json && { text: { format: { type: "json_object" } } }),
          })
        : await request("chat/completions", {
            model,
            messages,
            stream,
            ...(json && { response_format: { type: "json_object" } }),
          });
      if (isEventStream(response)) {
        if (!responses) return readChatStream(response, onDelta, requestSignal);
        let result = "";
        for await (const { name, body } of modelEvents(
          response,
          requestSignal,
        )) {
          const type = typeof body.type === "string" ? body.type : name;
          if (
            type === "response.output_text.delta" &&
            typeof body.delta === "string"
          ) {
            result += body.delta;
            onDelta?.(body.delta);
          }
          if (type === "response.completed") {
            const output = responsesText(body.response) || result;
            if (!output.trim()) break;
            if (!result) onDelta?.(output);
            return output;
          }
          if (
            type === "error" ||
            type === "response.failed" ||
            type === "response.incomplete"
          )
            break;
        }
        throw invalidModelResponse(capability);
      }
      const body: unknown = await response.json();
      let text = "";
      if (responses) {
        if (
          !isRecord(body) ||
          (body.status !== undefined && body.status !== "completed")
        )
          throw invalidModelResponse(capability);
        text = responsesText(body);
      } else {
        const message = firstChoice(body)?.message;
        const content = isRecord(message) ? message.content : undefined;
        if (typeof content === "string") text = content;
        if (Array.isArray(content)) {
          const parts: unknown[] = content;
          text = parts
            .filter(isRecord)
            .map((part) => (typeof part.text === "string" ? part.text : ""))
            .join("");
        }
      }
      if (!text.trim())
        throw new ModelConnectionError(capability, {
          key: "models.theModelServiceReturnedEmptyContent",
        });
      onDelta?.(text);
      return text;
    },
    timeout,
  );
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const capability = options.capability ?? "text";
  const connection = options.connection ?? requireConnection(capability);
  const text = await requestChat(messages, connection, options);
  if (capability === "text") recordSuccessfulCheck("text", connection);
  return text;
}

export function parseModelJSON<T = Record<string, unknown>>(text: string): T {
  const value = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(value);
  } catch {
    throw new LocalizedError({ key: "models.theModelReturnedAnInvalidFormat" });
  }
}

function requestImage(
  prompt: string,
  size: string,
  images: Blob[],
  connection: ImageConnection,
  signal?: AbortSignal,
) {
  return modelRequest(
    "image",
    connection,
    signal,
    async (request, requestSignal) => {
      const model = connection.model.trim();
      let response: Response;
      if (connection.provider === "seedream") {
        const references = await Promise.all(
          images.map((image) => blobDataUrl(image, image.type || "image/png")),
        );
        response = await request("images/generations", {
          model,
          prompt,
          ...(size !== "auto" && { size }),
          ...(references.length && {
            image: references.length === 1 ? references[0] : references,
          }),
          response_format: "b64_json",
        });
      } else {
        let requestSize = size;
        const dimensions = /^(\d+)x(\d+)$/.exec(size);
        if (
          /^gpt-image-(?:1|1-mini|1\.5)(?:-\d{4}-\d{2}-\d{2})?$/.test(model) &&
          dimensions
        ) {
          const width = Number(dimensions[1]);
          const height = Number(dimensions[2]);
          requestSize =
            width === height
              ? "1024x1024"
              : width > height
                ? "1536x1024"
                : "1024x1536";
        }
        if (images.length) {
          const form = new FormData();
          form.set("model", model);
          form.set("prompt", prompt);
          form.set("n", "1");
          form.set("size", requestSize);
          images.forEach((image, index) => {
            const extension =
              image.type === "image/jpeg"
                ? "jpg"
                : image.type === "image/webp"
                  ? "webp"
                  : "png";
            form.append(
              images.length === 1 ? "image" : "image[]",
              image,
              "image-" + index + "." + extension,
            );
          });
          response = await request("images/edits", form);
        } else {
          response = await request("images/generations", {
            model,
            prompt,
            n: 1,
            size: requestSize,
          });
        }
      }
      const body: unknown = await response.json();
      const image: unknown =
        isRecord(body) && Array.isArray(body.data) ? body.data[0] : undefined;
      const { b64_json: base64, url: imageUrl } = isRecord(image) ? image : {};
      let bytes: Uint8Array<ArrayBuffer>;
      if (typeof base64 === "string" && base64) {
        bytes = decodeBase64(base64);
      } else if (typeof imageUrl === "string" && imageUrl) {
        const url = URL.canParse(imageUrl) ? new URL(imageUrl) : undefined;
        if (!url || !["http:", "https:"].includes(url.protocol))
          throw new ModelConnectionError("image", {
            key: "models.theModelReturnedAnInvalidImageUrl",
          });
        const imageResponse = await fetch(url, {
          signal: requestSignal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!imageResponse.ok)
          throw new ModelConnectionError("image", {
            key: "models.cannotLoadTheGeneratedImage",
          });
        bytes = new Uint8Array(await imageResponse.arrayBuffer());
      } else {
        throw new ModelConnectionError("image", {
          key: "models.theModelReturnedNoImage",
        });
      }
      const type = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )
        ? "image/png"
        : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          ? "image/jpeg"
          : String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
              String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
            ? "image/webp"
            : undefined;
      if (!type) throw invalidModelResponse("image");
      const blob = new Blob([bytes], { type });
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob).catch(() => {
          throw invalidModelResponse("image");
        });
        bitmap.close();
      }
      return blob;
    },
    IMAGE_TIMEOUT,
  );
}

export async function generateImage(
  prompt: string,
  size: string,
  images: Blob[] = [],
  signal?: AbortSignal,
  connection = requireConnection("image"),
): Promise<Blob> {
  const output = await requestImage(prompt, size, images, connection, signal);
  recordSuccessfulCheck(images.length ? "image-edit" : "image", connection);
  return output;
}

export async function synthesizeSpeech(
  text: string,
  signal?: AbortSignal,
  connection: SpeechConnection = requireConnection("speech"),
): Promise<Blob> {
  const output = await requestSpeech(text, connection, signal);
  recordSuccessfulCheck("speech", connection);
  return output;
}

export async function transcribeDetailed(
  file: Blob,
  name = "audio.webm",
  signal?: AbortSignal,
  connection: TranscriptionConnection = requireConnection("transcription"),
): Promise<Transcription> {
  const output = await requestTranscription(file, name, connection, signal);
  if (output.text.trim() && output.segments.length)
    recordSuccessfulCheck("transcription", connection);
  return output;
}

export async function transcribe(
  file: Blob,
  name = "audio.webm",
  signal?: AbortSignal,
  connection?: TranscriptionConnection,
): Promise<string> {
  return (await transcribeDetailed(file, name, signal, connection)).text;
}

function requestSearch(
  query: string,
  connection: SearchConnection,
  signal?: AbortSignal,
  timeout = 30_000,
) {
  return modelRequest(
    "search",
    connection,
    signal,
    async (request) => {
      const maxResults = 6;
      const response = await request("search", {
        query,
        max_results: maxResults,
        search_depth: "basic",
      });
      const body: unknown = await response.json();
      if (!isRecord(body) || !Array.isArray(body.results))
        throw invalidModelResponse("search");
      const results: unknown[] = body.results.slice(0, maxResults);
      return results
        .map((item) => {
          if (
            !isRecord(item) ||
            typeof item.title !== "string" ||
            typeof item.url !== "string" ||
            !/^https?:\/\//.test(item.url) ||
            typeof item.content !== "string"
          )
            throw invalidModelResponse("search");
          return [item.title, item.url, item.content].join("\n");
        })
        .join("\n\n");
    },
    timeout,
  );
}

export async function searchWeb(
  query: string,
  signal?: AbortSignal,
  connection: SearchConnection = requireConnection("search"),
): Promise<string> {
  const results = await requestSearch(query, connection, signal);
  recordSuccessfulCheck("search", connection);
  return results;
}

export function listLanguageModels(
  connection: LanguageConnection,
  signal?: AbortSignal,
): Promise<string[]> {
  return modelRequest(
    "text",
    { ...connection, model: connection.model.trim() || "models" },
    signal,
    async (request) => {
      const response = await request("models");
      const body: unknown = await response.json();
      if (!isRecord(body) || !Array.isArray(body.data))
        throw new ModelConnectionError("text", {
          key: "models.theServiceReturnedNoModelList",
        });
      const data: unknown[] = body.data;
      return [
        ...new Set(
          data
            .filter(isRecord)
            .map((item) => (typeof item.id === "string" ? item.id.trim() : ""))
            .filter(Boolean),
        ),
      ].sort();
    },
    PROBE_TIMEOUT,
  );
}

function sampleImage(digits: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw invalidModelResponse("vision");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111";
  context.font = "bold 84px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(digits, canvas.width / 2, canvas.height / 2);
  return canvas;
}

export async function testModelOperation(
  operation: ModelCheck,
  connection: Connection,
  signal?: AbortSignal,
  locale: Locale = getLocale(),
): Promise<CheckResult & { preview?: Blob }> {
  signal?.throwIfAborted();
  const capability = operation === "image-edit" ? "image" : operation;
  const verified = { status: "verified" } as const;
  function unexpectedOutput() {
    return new ModelConnectionError(capability, {
      key: "models.connection.unexpectedTestOutput",
    });
  }
  switch (operation) {
    case "text": {
      if (connection.provider !== "language") break;
      const reply = await requestChat(
        [{ role: "user", content: "Reply with OK." }],
        connection,
        { signal },
        PROBE_TIMEOUT,
      );
      if (!/^ok[.!。]?$/i.test(reply.trim())) throw unexpectedOutput();
      return verified;
    }
    case "vision": {
      if (connection.provider !== "language") break;
      const digits = String(
        1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000),
      );
      const testImage = sampleImage(digits).toDataURL("image/png");
      const reply = await requestChat(
        [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Reply with only the four digits shown in the image.",
              },
              { type: "image_url", image_url: { url: testImage } },
            ],
          },
        ],
        connection,
        { capability: "vision", signal },
        PROBE_TIMEOUT,
      ).catch((error: unknown) => {
        if (error instanceof UnsupportedVisionError) return null;
        throw error;
      });
      if (reply === null) return { status: "unsupported" };
      if (reply.trim() !== digits) throw unexpectedOutput();
      return verified;
    }
    case "image":
    case "image-edit": {
      if (
        connection.provider !== "gpt-image" &&
        connection.provider !== "seedream"
      )
        break;
      const images: Blob[] = [];
      if (operation === "image-edit") {
        const image = await new Promise<Blob>((resolve, reject) => {
          sampleImage("1234").toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(invalidModelResponse("image"));
          }, "image/png");
        });
        images.push(image);
      }
      await requestImage(
        operation === "image"
          ? "A simple blue circle on a white background."
          : "Replace the black digits with a blue circle on the same white background.",
        connection.provider === "seedream" ? "2048x2048" : "1024x1024",
        images,
        connection,
        signal,
      );
      return verified;
    }
    case "speech": {
      if (connection.provider !== "aliyun-tts") break;
      const preview = await requestSpeech(
        locale === "zh-CN"
          ? "你好，欢迎使用画语。"
          : "Hello, welcome to Huayu.",
        connection,
        signal,
        30_000,
      );
      if (typeof OfflineAudioContext === "function") {
        const context = new OfflineAudioContext(1, 1, 16_000);
        await context.decodeAudioData(await preview.arrayBuffer()).catch(() => {
          throw unexpectedOutput();
        });
      }
      signal?.throwIfAborted();
      return { ...verified, preview };
    }
    case "transcription": {
      if (connection.provider !== "aliyun-asr") break;
      const { default: sampleUrl } = await import("./model-check.wav?url");
      const sample = await fetch(sampleUrl, { signal });
      if (!sample.ok) throw unexpectedOutput();
      const result = await requestTranscription(
        await sample.blob(),
        "model-check.wav",
        connection,
        signal,
        30_000,
      );
      const text = result.text
        .toLowerCase()
        .replace(/[^a-z]+/g, " ")
        .trim();
      if (
        !text.includes("this is a test") ||
        !text.includes("the sky is blue") ||
        !result.segments.length
      )
        throw unexpectedOutput();
      return verified;
    }
    case "search": {
      if (connection.provider !== "tavily") break;
      await requestSearch("Huayu", connection, signal, PROBE_TIMEOUT);
      return verified;
    }
  }
  throw invalidModelResponse(capability);
}
