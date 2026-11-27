import { LocalizedError } from "@/i18n/errors";
import { modelPrompts } from "@/ai/prompts";
import { t } from "@/i18n";
import type { ModelSettings } from "@/ai/model-config";
import { getSettings, requireConnection } from "@/ai/settings";
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
interface GeneratedContent {
  name: string;
  description: string;
  text: string;
  src?: string;
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

function generatedValue(value: unknown): GeneratedContent {
  if (
    !value ||
    typeof value !== "object" ||
    !("text" in value) ||
    typeof value.text !== "string"
  )
    throw new LocalizedError({
      key: "api.theModelResponseIsMissingTheContentField",
    });
  return {
    name:
      "name" in value && typeof value.name === "string"
        ? value.name
        : t("api.generatedContent"),
    description:
      "description" in value && typeof value.description === "string"
        ? value.description
        : "",
    text: value.text,
  };
}

export async function instructionAPI(
  query: string,
  inputs: AIAPIInput[],
  useWebSearch = false,
  signal?: AbortSignal,
  settings = getSettings(),
): Promise<GeneratedContent> {
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
  return generatedValue(result);
}

export async function imageAPI(
  inputs: AIAPIInput[],
  options: {
    size?: string;
    signal?: AbortSignal;
    settings?: ModelSettings;
  } = {},
): Promise<GeneratedContent> {
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
  return {
    name: t("api.generatedImage"),
    description: prompt,
    text: prompt,
    src: asset.url,
  };
}

export async function websiteAPI(
  inputs: AIAPIInput[],
  signal?: AbortSignal,
  settings = getSettings(),
): Promise<GeneratedContent> {
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
  return generatedValue(
    parseModelJSON(
      await chat(messages, {
        capability,
        connection,
        signal,
      }),
    ),
  );
}

export async function audioGenerateAPI(
  inputs: AIAPIInput[],
  signal?: AbortSignal,
  settings = getSettings(),
): Promise<GeneratedContent> {
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
  return {
    name: t("api.generatedSpeech"),
    description: text.slice(0, 120),
    text,
    src: asset.url,
  };
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
): Promise<GeneratedContent> {
  const settings = getSettings();
  const text = await transcribeInput(await blobForSource(audioUrl), settings);
  return {
    name: t("api.transcription"),
    description: "",
    text,
    src: audioUrl,
  };
}

export async function documentUploadAPI(file: File): Promise<GeneratedContent> {
  const body = new FormData();
  body.append("file", file);
  const data = await api<{ asset: Asset; text: string }>(
    "/api/documents/parse",
    { method: "POST", body },
  );
  return {
    name: file.name,
    description: t("api.documentContent"),
    text: data.text,
    src: data.asset.url,
  };
}

export async function documentGenerateAPI(
  inputs: AIAPIInput[],
  signal?: AbortSignal,
  settings = getSettings(),
): Promise<GeneratedContent> {
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
  return {
    name: fileName,
    description: t("api.generatedDocument"),
    text,
    src: asset.url,
  };
}
