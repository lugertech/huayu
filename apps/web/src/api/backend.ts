import { LocalizedError } from "@/i18n/errors";
import { modelPrompts } from "@/ai/prompts";
import { t } from "@/i18n";
import {
  getSettings,
  requireConnection,
  type ModelSettings,
} from "@/ai/settings";
import { extractRecordingAudio } from "@/features/recording/audio";
import { api, uploadAsset, type Asset } from "./client";
import { blobAsDataURL, blobForSource } from "./resources";
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

export async function messagesForInputs(
  system: string,
  query: string,
  inputs: AIAPIInput[],
  signal?: AbortSignal,
  settings = getSettings(),
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
          arg0: await transcribeInput(audio, settings, signal),
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
  settings = getSettings(),
): Promise<AIAPIResponse> {
  const language = requireConnection("text", settings);
  const vision = inputs.some((input) => input.type === "image" && input.src)
    ? requireConnection("vision", settings)
    : undefined;
  const search = useWebSearch
    ? requireConnection("search", settings)
    : undefined;
  const prompts = modelPrompts();
  const plan = parseModelJSON(
    await chat(
      [
        { role: "system", content: prompts.procedure },
        { role: "user", content: query },
      ],
      { signal, connection: language },
    ),
  );
  const research = search
    ? t("api.webSearchSourcesPreserveCitationsWhenUsingThem", {
        arg0: await searchWeb(query, signal, search),
      })
    : "";
  const { messages, hasImages } = await messagesForInputs(
    prompts.execute,
    `procedure: ${JSON.stringify(plan)}\n${research}`,
    inputs,
    signal,
    settings,
  );
  const result = parseModelJSON(
    await chat(messages, {
      capability: hasImages ? "vision" : "text",
      connection: vision ?? language,
      signal,
    }),
  );
  return success([generatedValue(result)]);
}

export async function imageAPI(
  inputs: AIAPIInput[],
  options: {
    size?: string;
    signal?: AbortSignal;
    settings?: ModelSettings;
  } = {},
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
  const imageConnection = requireConnection("image", options.settings);
  const references = await Promise.all(
    inputs
      .filter((input) => input.type === "image" && input.src)
      .map((input) => blobForSource(input.src, options.signal)),
  );
  const image = await generateImage(
    prompt,
    options.size || "1024x1024",
    references,
    options.signal,
    imageConnection,
  );
  const extension =
    image.type === "image/jpeg"
      ? "jpg"
      : image.type === "image/webp"
        ? "webp"
        : "png";
  const asset = await uploadAsset(image, "image." + extension, options.signal);
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
  settings = getSettings(),
): Promise<AIAPIResponse> {
  const capability = inputs.some((input) => input.type === "image" && input.src)
    ? "vision"
    : "text";
  const connection = requireConnection(capability, settings);
  const { messages } = await messagesForInputs(
    modelPrompts().website + t("api.thePageMustBeEntirelySelfContained"),
    t("api.generateACompleteWebPageFromTheInput"),
    inputs,
    signal,
    settings,
  );
  const value = generatedValue(
    parseModelJSON(
      await chat(messages, {
        capability,
        connection,
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
  settings = getSettings(),
): Promise<AIAPIResponse> {
  const text = inputs
    .map((input) => input.text || input.description || "")
    .filter(Boolean)
    .join("\n");
  if (!text.trim())
    throw new LocalizedError({ key: "api.enterTheTextToReadAloud" });
  const asset = await uploadAsset(
    await synthesizeSpeech(text, signal, requireConnection("speech", settings)),
    "speech.mp3",
    signal,
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

async function transcribeInput(
  blob: Blob,
  settings: ModelSettings,
  signal?: AbortSignal,
): Promise<string> {
  const connection = requireConnection("transcription", settings);
  const chunks = await extractRecordingAudio(blob, signal);
  const text: string[] = [];
  for (const chunk of chunks) {
    signal?.throwIfAborted();
    text.push(await transcribe(chunk.blob, "audio.wav", signal, connection));
  }
  return text.filter(Boolean).join("\n");
}

export async function audioRecognizeAPI(
  audioUrl: string,
): Promise<AudioRecognizeResponse> {
  const settings = getSettings();
  const text = await transcribeInput(await blobForSource(audioUrl), settings);
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
  settings = getSettings(),
): Promise<AIAPIResponse> {
  const { messages, hasImages } = await messagesForInputs(
    t("api.generateTheCompleteFileBodyFromTheInputAndRequirements"),
    t("api.generateTheRequestedFileContent"),
    inputs,
    signal,
    settings,
  );
  const capability = hasImages ? "vision" : "text";
  const text = await chat(messages, {
    capability,
    connection: requireConnection(capability, settings),
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
      { signal, connection: requireConnection("text", settings) },
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
  signal?.throwIfAborted();
  const asset = await uploadAsset(
    await createDocumentBlob(text, extension),
    fileName,
    signal,
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
