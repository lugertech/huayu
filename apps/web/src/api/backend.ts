import { LocalizedError } from "@/i18n/errors";
import { modelPrompts } from "@/ai/prompts";
import { getLocale, t } from "@/i18n";
import { requireConnection } from "@/ai/settings";
import { api, uploadAsset, type Asset } from "./client";
import { canvasRequestHeaders } from "@/lib/canvas-access";
import {
  chat,
  generateImage,
  parseModelJSON,
  searchWeb,
  synthesizeSpeech,
  transcribe,
  type ChatMessage,
  type ChatPart,
} from "../ai/provider";
import { createDocumentBlob, FILE_EXTENSIONS } from "../ai/documents";

export interface AIAPIInput {
  type: "text" | "image" | "speech" | "website" | "file";
  text?: string;
  src?: string;
  name?: string;
  description?: string;
}
export interface AIAPIValue {
  type: string;
  name: string;
  description: string;
  text: string;
  src?: string;
}
export interface AIAPIResponse {
  status: "success" | "fail";
  code: number;
  message: string;
  data: { ok: boolean; value: AIAPIValue | AIAPIValue[] };
  error: Record<string, unknown>;
}
export interface FileUploadResponse {
  status: string;
  code: number;
  message: string;
  data: {
    original_file_name: string;
    save_file_name: string;
    file_extension: string;
    file_size: number;
    file_path: string;
  };
  error: Record<string, unknown>;
}
export interface AudioRecognizeResponse {
  status: string;
  code: number;
  message: string;
  data: AIAPIValue;
  error: Record<string, unknown>;
}

function success(value: AIAPIValue | AIAPIValue[]): AIAPIResponse {
  return {
    status: "success",
    code: 200,
    message: "",
    data: { ok: true, value },
    error: {},
  };
}

export async function blobForSource(
  src: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const url = new URL(src, window.location.origin);
  if (!["http:", "https:", "data:", "blob:"].includes(url.protocol))
    throw new LocalizedError({ key: "api.invalidResourceUrl" });
  const response = await fetch(url, {
    credentials: url.origin === window.location.origin ? "same-origin" : "omit",
    headers:
      url.origin === window.location.origin && url.pathname.startsWith("/api/")
        ? { ...canvasRequestHeaders(), "Accept-Language": getLocale() }
        : undefined,
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok)
    throw new LocalizedError({ key: "api.cannotReadInputResource" });
  return response.blob();
}

export function blobAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new LocalizedError({ key: "api.cannotReadImage" }));
    reader.readAsDataURL(blob);
  });
}

export async function messagesForInputs(
  system: string,
  query: string,
  inputs: AIAPIInput[],
  signal?: AbortSignal,
): Promise<{ messages: ChatMessage[]; hasImages: boolean }> {
  const parts: ChatPart[] = [{ type: "text", text: query }];
  let hasImages = false;
  for (const input of inputs) {
    if (input.type === "image" && input.src) {
      const data = input.src.startsWith("data:")
        ? input.src
        : await blobAsDataURL(await blobForSource(input.src, signal));
      parts.push({ type: "image_url", image_url: { url: data } });
      hasImages = true;
      if (input.text || input.description)
        parts.push({ type: "text", text: input.text || input.description });
    } else if (input.type === "speech" && input.src && !input.text) {
      const audio = await blobForSource(input.src, signal);
      parts.push({
        type: "text",
        text: t("api.audioTranscript", {
          arg0: await transcribe(audio, input.name || "audio.webm", signal),
        }),
      });
    } else if (input.text || input.description) {
      parts.push({
        type: "text",
        text: `[${input.type} ${input.name || ""}]\n${input.text || input.description}`,
      });
    }
  }
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: parts },
    ],
    hasImages,
  };
}

function generatedValue(value: unknown, type = "text"): AIAPIValue {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as AIAPIValue).text !== "string"
  )
    throw new LocalizedError({
      key: "api.theModelResponseIsMissingTheContentField",
    });
  const item = value as AIAPIValue;
  return {
    type,
    name: typeof item.name === "string" ? item.name : t("api.generatedContent"),
    description: typeof item.description === "string" ? item.description : "",
    text: item.text,
  };
}

export async function instructionAPI(
  query: string,
  inputs: AIAPIInput[],
  useWebSearch = false,
  signal?: AbortSignal,
): Promise<AIAPIResponse> {
  requireConnection("text");
  if (inputs.some((input) => input.type === "image"))
    requireConnection("vision");
  if (useWebSearch) requireConnection("search");
  const prompts = modelPrompts();
  const plan = parseModelJSON(
    await chat(
      [
        { role: "system", content: prompts.procedure },
        { role: "user", content: query },
      ],
      { signal },
    ),
  );
  const research = useWebSearch
    ? t("api.webSearchSourcesPreserveCitationsWhenUsingThem", {
        arg0: await searchWeb(query, signal),
      })
    : "";
  const { messages, hasImages } = await messagesForInputs(
    prompts.execute,
    `procedure: ${JSON.stringify(plan)}\n${research}`,
    inputs,
    signal,
  );
  const result = parseModelJSON(
    await chat(messages, { capability: hasImages ? "vision" : "text", signal }),
  );
  return success([generatedValue(result)]);
}

export async function imageAPI(
  inputs: AIAPIInput[],
  options: { size?: string; signal?: AbortSignal; [key: string]: unknown } = {},
): Promise<AIAPIResponse> {
  let prompt = inputs
    .filter((input) => input.type !== "image")
    .map((input) => input.text || input.description || "")
    .filter(Boolean)
    .join("\n");
  if (
    !prompt.trim() &&
    inputs.some((input) => input.type === "image" && input.src)
  )
    prompt = t("models.image.referenceInstructions");
  if (!prompt.trim())
    throw new LocalizedError({
      key: "api.describeAnImageOrConnectAReferenceImage",
    });
  requireConnection("image");
  const references = await Promise.all(
    inputs
      .filter((input) => input.type === "image" && input.src)
      .map((input) => blobForSource(input.src, options.signal)),
  );
  const asset = await uploadAsset(
    await generateImage(
      prompt,
      options.size || "1024x1024",
      references,
      options.signal,
    ),
    "image.png",
  );
  return success([
    {
      type: "image",
      name: t("api.generatedImage"),
      description: prompt,
      text: prompt,
      src: asset.url,
    },
  ]);
}

export async function websiteAPI(
  inputs: AIAPIInput[],
  signal?: AbortSignal,
): Promise<AIAPIResponse> {
  requireConnection(
    inputs.some((input) => input.type === "image" && input.src)
      ? "vision"
      : "text",
  );
  const { messages, hasImages } = await messagesForInputs(
    modelPrompts().website + t("api.thePageMustBeEntirelySelfContained"),
    t("api.generateACompleteWebPageFromTheInput"),
    inputs,
    signal,
  );
  const value = generatedValue(
    parseModelJSON(
      await chat(messages, {
        capability: hasImages ? "vision" : "text",
        signal,
      }),
    ),
    "website",
  );
  return success([value]);
}

export async function audioGenerateAPI(
  inputs: AIAPIInput[],
  signal?: AbortSignal,
): Promise<AIAPIResponse> {
  const text = inputs
    .map((input) => input.text || input.description || "")
    .filter(Boolean)
    .join("\n");
  if (!text.trim())
    throw new LocalizedError({ key: "api.enterTheTextToReadAloud" });
  const asset = await uploadAsset(
    await synthesizeSpeech(text, signal),
    "speech.mp3",
  );
  return success([
    {
      type: "speech",
      name: t("api.generatedSpeech"),
      description: text.slice(0, 120),
      text,
      src: asset.url,
    },
  ]);
}

export async function audioRecognizeAPI(
  audioUrl: string,
): Promise<AudioRecognizeResponse> {
  const blob = await blobForSource(audioUrl);
  const extension = blob.type.includes("mpeg")
    ? "mp3"
    : blob.type.includes("wav")
      ? "wav"
      : blob.type.includes("mp4")
        ? "m4a"
        : "webm";
  const text = await transcribe(blob, `audio.${extension}`);
  return {
    status: "success",
    code: 200,
    message: "",
    data: {
      type: "speech",
      name: t("api.transcription"),
      description: "",
      text,
      src: audioUrl,
    },
    error: {},
  };
}

export async function documentUploadAPI(file: File): Promise<AIAPIResponse> {
  const body = new FormData();
  body.append("file", file);
  const data = await api<{ asset: Asset; text: string }>(
    "/api/documents/parse",
    { method: "POST", body },
  );
  return success({
    type: "file",
    name: file.name,
    description: t("api.documentContent"),
    text: data.text,
    src: data.asset.url,
  });
}

export async function documentGenerateAPI(
  inputs: AIAPIInput[],
  signal?: AbortSignal,
): Promise<AIAPIResponse> {
  const { messages, hasImages } = await messagesForInputs(
    t("api.generateTheCompleteFileBodyFromTheInputAndRequirements"),
    t("api.generateTheRequestedFileContent"),
    inputs,
    signal,
  );
  const text = await chat(messages, {
    capability: hasImages ? "vision" : "text",
    signal,
  });
  const nameData = parseModelJSON<{
    filename?: string;
    name?: string;
    extension?: string;
  }>(
    await chat(
      [
        { role: "system", content: modelPrompts().filename },
        {
          role: "user",
          content: inputs
            .map((input) => input.text || input.description || "")
            .join("\n")
            .slice(0, 6000),
        },
      ],
      { signal },
    ),
  );
  const rawName =
    nameData.filename ||
    `${nameData.name || t("api.generatedFile")}.${nameData.extension || "txt"}`;
  const fileName = Array.from(rawName as string, (character) =>
    character.charCodeAt(0) < 32 || character === "/" || character === "\\"
      ? "_"
      : character,
  )
    .join("")
    .slice(0, 160);
  const extension = fileName.split(".").pop()?.toLowerCase() || "txt";
  if (!(FILE_EXTENSIONS as readonly string[]).includes(extension))
    throw new LocalizedError({ key: "api.theModelChoseAnUnsupportedFormat" });
  const asset = await uploadAsset(
    await createDocumentBlob(text, extension),
    fileName,
  );
  return success({
    type: "file",
    name: fileName,
    description: t("api.generatedDocument"),
    text,
    src: asset.url,
  });
}

export async function uploadFileAPI(
  file: File,
  _path?: string,
): Promise<FileUploadResponse> {
  const asset = await uploadAsset(file);
  return {
    status: "success",
    code: 200,
    message: "",
    error: {},
    data: {
      original_file_name: file.name,
      save_file_name: asset.id,
      file_extension: file.name.split(".").pop() || "",
      file_size: asset.size,
      file_path: asset.url,
    },
  };
}
export const isAPISuccess = (response: { status: string; code: number }) =>
  response.status === "success" && response.code === 200;
export function extractAPIData(response: AIAPIResponse): AIAPIValue {
  if (!isAPISuccess(response) || !response.data.ok)
    throw new LocalizedError(
      response.message || { key: "api.generationFailed" },
    );
  const value = Array.isArray(response.data.value)
    ? response.data.value[0]
    : response.data.value;
  if (!value)
    throw new LocalizedError({ key: "api.noGeneratedContentWasReturned" });
  return value;
}
