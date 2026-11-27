import { v4 as uuid } from "uuid";
import {
  LocalizedError,
  readErrorTranslation,
  type ErrorTranslation,
} from "@/i18n/errors";
import { ModelConnectionError } from "./errors";

declare const __HUAYU_DEV_API_ORIGIN__: string;

export const CAPABILITIES = [
  "text",
  "vision",
  "image",
  "speech",
  "transcription",
  "search",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const CAPABILITY_MESSAGE_KEYS = {
  text: "models.textGeneration",
  vision: "models.imageUnderstanding",
  image: "models.imageGeneration",
  speech: "models.textToSpeech",
  transcription: "api.transcription",
  search: "models.webSearch",
} as const;

export const IMAGE_PROVIDERS = ["gpt-image", "seedream"] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];
export type ModelProtocol = "chat-completions" | "responses";
export type AliyunRegion = "cn-beijing" | "ap-southeast-1";
export type ModelCheck = Capability | "image-edit";
export const modelChecks = [...CAPABILITIES, "image-edit"] as const;
export type CheckResult =
  | { status: "verified" | "unsupported" }
  | { status: "failed"; error: ErrorTranslation };
type Checks = Partial<Record<ModelCheck, CheckResult>>;

interface BaseConnection {
  apiKey: string;
  enabled: boolean;
  checks: Checks;
}

export interface LanguageConnection extends BaseConnection {
  provider: "language";
  id: string;
  name: string;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
}

export interface ImageConnection extends BaseConnection {
  provider: ImageProvider;
  model: string;
}

interface AliyunConnection extends BaseConnection {
  region: AliyunRegion;
  workspaceId: string;
}

export interface SpeechConnection extends AliyunConnection {
  provider: "aliyun-tts";
  voice: string;
}

export interface TranscriptionConnection extends AliyunConnection {
  provider: "aliyun-asr";
}

export interface SearchConnection extends BaseConnection {
  provider: "tavily";
}

export interface CapabilityConnections {
  text: LanguageConnection;
  vision: LanguageConnection;
  image: ImageConnection;
  speech: SpeechConnection;
  transcription: TranscriptionConnection;
  search: SearchConnection;
}

export type Connection = CapabilityConnections[Capability];

export interface ModelSettings {
  version: 2;
  language: LanguageConnection[];
  images: Record<ImageProvider, ImageConnection>;
  speech: SpeechConnection;
  transcription: TranscriptionConnection;
  search: SearchConnection;
  selection: {
    text: string | null;
    vision: string | null;
    image: ImageProvider | null;
    defaultImage: ImageProvider | null;
  };
}

export const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const SEEDREAM_API_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const TAVILY_API_ORIGIN = "https://api.tavily.com";
export const ALIYUN_TTS_MODEL = "qwen-audio-3.1-tts-flash";
export const ALIYUN_ASR_MODEL = "qwen-audio-3.1-asr-flash";

const legacyLanguagePlaceholder = "gpt-6-luna";

export function newLanguageConnection(): LanguageConnection {
  return {
    provider: "language",
    id: uuid(),
    name: "",
    protocol: "chat-completions",
    baseUrl: "",
    model: "",
    apiKey: "",
    enabled: true,
    checks: {},
  };
}

export function defaultSettings(): ModelSettings {
  const idle = (): BaseConnection => ({
    apiKey: "",
    enabled: false,
    checks: {},
  });
  const aliyun = (): AliyunConnection => ({
    ...idle(),
    region: "cn-beijing",
    workspaceId: "",
  });
  return {
    version: 2,
    language: [],
    images: {
      "gpt-image": {
        ...idle(),
        provider: "gpt-image",
        model: "gpt-image-2.6-flare",
      },
      seedream: {
        ...idle(),
        provider: "seedream",
        model: "doubao-seedream-5-5-261028",
      },
    },
    speech: { ...aliyun(), provider: "aliyun-tts", voice: "longanhuan_v3.1" },
    transcription: { ...aliyun(), provider: "aliyun-asr" },
    search: { ...idle(), provider: "tavily" },
    selection: { text: null, vision: null, image: null, defaultImage: null },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function imageProvider(value: unknown): ImageProvider | null {
  return value === "gpt-image" || value === "seedream" ? value : null;
}

function readBase(
  value: Record<string, unknown>,
  allowed: ModelCheck[],
): BaseConnection {
  const stored = record(value.checks);
  const results: Checks = {};
  for (const key of allowed) {
    const result = record(stored[key]);
    if (
      result.status === "verified" ||
      (key === "vision" && result.status === "unsupported")
    )
      results[key] = { status: result.status };
    else if (result.status === "failed") {
      const error = readErrorTranslation(result.error);
      if (error) results[key] = { status: "failed", error };
    }
  }
  return {
    apiKey: string(value.apiKey),
    enabled: value.enabled === true,
    checks: results,
  };
}

function readAliyun(
  value: Record<string, unknown>,
  operation: "speech" | "transcription",
): AliyunConnection {
  return {
    ...readBase(value, [operation]),
    region: value.region === "ap-southeast-1" ? value.region : "cn-beijing",
    workspaceId: string(value.workspaceId),
  };
}

function migrateV1(value: Record<string, unknown>): ModelSettings {
  const settings = defaultSettings();
  const connections = record(value.connections);
  for (const capability of ["text", "vision"] as const) {
    const old = record(connections[capability]);
    const baseUrl = string(old.baseUrl).trim() || OPENAI_API_BASE_URL;
    const model = string(old.model);
    const apiKey = string(old.apiKey);
    if (
      !apiKey.trim() &&
      baseUrl.trim().replace(/\/+$/, "") === OPENAI_API_BASE_URL &&
      (!model.trim() || model === legacyLanguagePlaceholder)
    )
      continue;
    const entry: LanguageConnection = {
      provider: "language",
      id: "legacy-" + capability,
      name: "",
      protocol: "chat-completions",
      baseUrl,
      model,
      apiKey,
      enabled: true,
      checks: {},
    };
    const match = settings.language.find(
      (existing) =>
        connectionRequestKey(existing) === connectionRequestKey(entry),
    );
    if (!match) settings.language.push(entry);
    settings.selection[capability] = (match ?? entry).id;
  }
  const image = record(connections.image);
  if (
    string(image.baseUrl, OPENAI_API_BASE_URL).trim().replace(/\/+$/, "") ===
      OPENAI_API_BASE_URL &&
    string(image.apiKey).trim() &&
    /^(?:gpt-image-|chatgpt-image-latest$)/.test(
      string(image.model, settings.images["gpt-image"].model),
    )
  ) {
    settings.images["gpt-image"] = {
      ...settings.images["gpt-image"],
      ...readBase({ ...image, enabled: true }, []),
      model: string(image.model, settings.images["gpt-image"].model),
    };
  }
  const search = record(connections.search);
  if (
    (search.provider === "tavily" || search.provider === undefined) &&
    string(search.baseUrl, TAVILY_API_ORIGIN).trim().replace(/\/+$/, "") ===
      TAVILY_API_ORIGIN &&
    string(search.apiKey).trim()
  ) {
    settings.search = {
      provider: "tavily",
      ...readBase({ ...search, enabled: true }, []),
    };
  }
  return settings;
}

export function parseSettings(raw: string | null): ModelSettings {
  if (!raw) return defaultSettings();
  let value: Record<string, unknown>;
  try {
    value = record(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
  if (value.version === 1) return migrateV1(value);
  const settings = defaultSettings();
  if (value.version !== 2) return settings;

  const ids = new Set<string>();
  if (Array.isArray(value.language)) {
    for (const item of value.language) {
      const entry = record(item);
      if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id))
        continue;
      const connection: LanguageConnection = {
        ...readBase(entry, ["text", "vision"]),
        provider: "language",
        id: entry.id,
        name: string(entry.name),
        protocol:
          entry.protocol === "responses" ? entry.protocol : "chat-completions",
        baseUrl: string(entry.baseUrl),
        model: string(entry.model),
      };
      if (
        !connection.baseUrl.trim() &&
        !connection.apiKey.trim() &&
        !connection.name.trim() &&
        Object.keys(connection.checks).length === 0 &&
        (!connection.model.trim() ||
          (connection.protocol === "chat-completions" &&
            connection.model === legacyLanguagePlaceholder))
      )
        continue;
      if (
        !connection.baseUrl.trim() &&
        connection.apiKey.trim() &&
        connection.model.trim()
      )
        connection.baseUrl = OPENAI_API_BASE_URL;
      ids.add(entry.id);
      settings.language.push(connection);
    }
  }
  const images = record(value.images);
  for (const provider of IMAGE_PROVIDERS) {
    const image = record(images[provider]);
    settings.images[provider] = {
      ...readBase(image, ["image", "image-edit"]),
      provider,
      model: string(image.model, settings.images[provider].model),
    };
  }
  const speech = record(value.speech);
  settings.speech = {
    ...readAliyun(speech, "speech"),
    provider: "aliyun-tts",
    voice: string(speech.voice, settings.speech.voice),
  };
  settings.transcription = {
    ...readAliyun(record(value.transcription), "transcription"),
    provider: "aliyun-asr",
  };
  settings.search = {
    ...readBase(record(value.search), ["search"]),
    provider: "tavily",
  };
  const selection = record(value.selection);
  settings.selection = {
    text:
      typeof selection.text === "string" && ids.has(selection.text)
        ? selection.text
        : null,
    vision:
      typeof selection.vision === "string" && ids.has(selection.vision)
        ? selection.vision
        : null,
    image: imageProvider(selection.image),
    defaultImage: imageProvider(selection.defaultImage),
  };
  return settings;
}

export function connectionRequestKey(connection: Connection): string {
  return JSON.stringify([
    connection.provider,
    connectionBaseUrl(connection).replace(/\/+$/, ""),
    connection.apiKey.trim(),
    connection.provider === "language" ? connection.protocol : "",
    "model" in connection ? connection.model.trim() : "",
    "voice" in connection ? connection.voice.trim() : "",
  ]);
}

export function updateConnection<C extends Connection>(
  previous: C,
  patch: Partial<C>,
): C {
  const next = { ...previous, ...patch };
  if (connectionRequestKey(previous) !== connectionRequestKey(next))
    next.checks = {};
  return next;
}

export function connectionBaseUrl(connection: Connection): string {
  switch (connection.provider) {
    case "language":
      return connection.baseUrl.trim();
    case "gpt-image":
      return OPENAI_API_BASE_URL;
    case "seedream":
      return SEEDREAM_API_BASE_URL;
    case "aliyun-tts":
    case "aliyun-asr":
      return (
        "https://" +
        connection.workspaceId.trim().toLowerCase() +
        "." +
        connection.region +
        ".maas.aliyuncs.com"
      );
    case "tavily":
      return TAVILY_API_ORIGIN;
  }
}

export type ConfigurationIssue = {
  field: "baseUrl" | "model" | "apiKey" | "workspaceId" | "voice";
  error: ModelConnectionError;
};

export function configurationIssue(
  capability: Capability,
  connection: Connection | undefined,
): ConfigurationIssue | undefined {
  const values = { capability: { key: CAPABILITY_MESSAGE_KEYS[capability] } };
  function issue(
    field: ConfigurationIssue["field"],
    message: ErrorTranslation,
  ): ConfigurationIssue {
    return {
      field,
      error: new ModelConnectionError(capability, message, "configuration"),
    };
  }
  if (!connection)
    return issue("apiKey", {
      key: "models.connection.configureCapability",
      values,
    });
  if (
    "workspaceId" in connection &&
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      connection.workspaceId.trim(),
    )
  )
    return issue("workspaceId", { key: "models.connection.workspaceRequired" });
  if ("voice" in connection && !connection.voice.trim())
    return issue("voice", { key: "models.connection.voiceRequired" });
  if (connection.provider === "language" && !connection.baseUrl.trim())
    return issue("baseUrl", { key: "models.connection.missingBaseUrl" });
  if ("model" in connection && !connection.model.trim())
    return issue("model", { key: "models.connection.missingModel", values });
  let hostname: string;
  try {
    hostname = new URL(
      modelEndpoint({ baseUrl: connectionBaseUrl(connection) }, ""),
    ).hostname;
  } catch (error) {
    return issue(
      "baseUrl",
      error instanceof LocalizedError && error.translation
        ? error.translation
        : { key: "models.invalidModelServiceUrl" },
    );
  }
  if (
    !connection.apiKey.trim() &&
    (connection.provider !== "language" || hostname === "api.openai.com")
  )
    return issue("apiKey", { key: "models.connection.missingKey", values });
}

export function modelCheckStatus(
  operation: ModelCheck,
  connection: Connection | undefined,
) {
  if (
    !connection ||
    configurationIssue(
      operation === "image-edit" ? "image" : operation,
      connection,
    )
  )
    return "unconfigured";
  if (!connection.enabled) return "disabled";
  return connection.checks[operation]?.status ?? "pending";
}

export function modelEndpoint(
  connection: { baseUrl: string },
  path: string,
): string {
  let url: URL;
  try {
    url = new URL(
      connection.baseUrl.trim().replace(/\/+$/, "") +
        "/" +
        path.replace(/^\/+/, ""),
    );
  } catch {
    throw new LocalizedError({ key: "models.invalidModelServiceUrl" });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new LocalizedError({ key: "models.serviceUrl.invalid" });
  }
  if (
    [globalThis.window?.location?.origin, __HUAYU_DEV_API_ORIGIN__].includes(
      url.origin,
    ) &&
    /^\/api(?:\/|$)/.test(url.pathname)
  ) {
    throw new LocalizedError({ key: "models.enterTheUrlOfYourModelService" });
  }
  return url.toString();
}
