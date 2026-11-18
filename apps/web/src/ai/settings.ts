import {
  LocalizedError,
  errorText,
  type ErrorTranslation,
} from "@/i18n/errors";
import { t } from "@/i18n";
import { useSyncExternalStore } from "react";
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
export interface Connection {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  provider: "openai" | "tavily" | "brave";
  transcriptionFormat?: "json" | "verbose_json";
}
export interface ModelSettings {
  version: 1;
  connections: Record<Capability, Connection>;
}
export type ConnectionEdits = Partial<Record<Capability, Partial<Connection>>>;
export const MODEL_STORAGE_KEY = "huayu:model-settings:v1";
const MODEL_SETUP_DISMISSED_KEY = "huayu:model-setup-dismissed";
export const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
export const TAVILY_API_ORIGIN = "https://api.tavily.com";
export const CAPABILITY_MESSAGE_KEYS = {
  text: "models.textGeneration",
  vision: "models.imageUnderstanding",
  image: "models.imageGeneration",
  speech: "models.textToSpeech",
  transcription: "api.transcription",
  search: "models.webSearch",
} as const;
export const CAPABILITY_LABELS: Record<Capability, string> = {
  get text() {
    return t(CAPABILITY_MESSAGE_KEYS.text);
  },
  get vision() {
    return t(CAPABILITY_MESSAGE_KEYS.vision);
  },
  get image() {
    return t(CAPABILITY_MESSAGE_KEYS.image);
  },
  get speech() {
    return t(CAPABILITY_MESSAGE_KEYS.speech);
  },
  get transcription() {
    return t(CAPABILITY_MESSAGE_KEYS.transcription);
  },
  get search() {
    return t(CAPABILITY_MESSAGE_KEYS.search);
  },
};

export function defaultSettings(): ModelSettings {
  const models = {
    text: "gpt-6-luna",
    vision: "gpt-6-luna",
    image: "gpt-image-2.6-flare",
    speech: "tts-1",
    transcription: "whisper-1",
    search: "",
  };
  return {
    version: 1,
    connections: Object.fromEntries(
      CAPABILITIES.map((capability) => [
        capability,
        {
          baseUrl:
            capability === "search" ? TAVILY_API_ORIGIN : OPENAI_API_BASE_URL,
          apiKey: "",
          model: models[capability],
          voice: "alloy",
          transcriptionFormat: "verbose_json",
          provider: capability === "search" ? "tavily" : "openai",
        },
      ]),
    ) as Record<Capability, Connection>,
  };
}

export function parseSettings(raw: string | null): ModelSettings {
  const defaults = defaultSettings();
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !value.connections) return defaults;
    for (const capability of CAPABILITIES) {
      const connection = value.connections[capability];
      if (!connection || typeof connection !== "object") continue;
      for (const key of ["baseUrl", "apiKey", "model", "voice"] as const) {
        if (typeof connection[key] === "string")
          defaults.connections[capability][key] = connection[key];
      }
      if (["openai", "tavily", "brave"].includes(connection.provider))
        defaults.connections[capability].provider = connection.provider;
      if (["json", "verbose_json"].includes(connection.transcriptionFormat))
        defaults.connections[capability].transcriptionFormat =
          connection.transcriptionFormat;
    }
  } catch {
    /* An invalid local value does not trigger any network request. */
  }
  return defaults;
}

const listeners = new Set<() => void>();
let cached: ModelSettings | undefined;

export function getSettings(): ModelSettings {
  if (!cached) {
    try {
      cached = parseSettings(localStorage.getItem(MODEL_STORAGE_KEY));
    } catch {
      cached = defaultSettings();
    }
  }
  return cached;
}

export function saveSettings(value: ModelSettings) {
  const normalized = parseSettings(JSON.stringify(value));
  localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(normalized));
  cached = normalized;
  listeners.forEach((listener) => listener());
}

export function changedConnectionFields(
  saved: Connection,
  next: Connection,
): Partial<Connection> {
  const fields: Partial<Connection> = Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => saved[key as keyof Connection] !== value,
    ),
  );
  // A credential belongs to the provider and address the user was editing.
  if ("provider" in fields || "baseUrl" in fields || "apiKey" in fields) {
    fields.provider = next.provider;
    fields.baseUrl = next.baseUrl;
    fields.apiKey = next.apiKey;
  }
  return fields;
}

export function saveConnectionEdits(edits: ConnectionEdits) {
  const latest = parseSettings(localStorage.getItem(MODEL_STORAGE_KEY));
  for (const capability of CAPABILITIES)
    Object.assign(latest.connections[capability], edits[capability]);
  saveSettings(latest);
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === MODEL_STORAGE_KEY || event.key === null) {
      cached = undefined;
      listeners.forEach((listener) => listener());
    }
  });

export function useModelSettings() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, getSettings);
}

export function shouldOfferModelSetup() {
  try {
    if (localStorage.getItem(MODEL_SETUP_DISMISSED_KEY) === "true")
      return false;
  } catch {
    // Offer setup when the browser cannot read the preference.
  }
  const { connections } = getSettings();
  return !CAPABILITIES.some(
    (capability) =>
      capability !== "search" &&
      !connectionIssue(capability, connections[capability]),
  );
}

export function dismissModelSetup() {
  try {
    localStorage.setItem(MODEL_SETUP_DISMISSED_KEY, "true");
  } catch {
    // The user can continue in this session without saving the preference.
  }
}

export function connectionFor(capability: Capability): Connection {
  const settings = getSettings();
  return settings.connections[capability];
}

export function connectionIssue(
  capability: Capability,
  connection = connectionFor(capability),
) {
  const values = { capability: { key: CAPABILITY_MESSAGE_KEYS[capability] } };
  function issue(
    field: "baseUrl" | "model" | "apiKey",
    message: string | ErrorTranslation,
  ) {
    const error = new ModelConnectionError(
      capability,
      message,
      "configuration",
    );
    return {
      field,
      error,
      get message() {
        return errorText(error);
      },
    };
  }
  if (!connection.baseUrl.trim())
    return issue("baseUrl", { key: "models.connection.missingUrl", values });
  let endpoint: URL;
  try {
    endpoint = new URL(modelEndpoint(connection, ""));
  } catch (error) {
    return issue(
      "baseUrl",
      error instanceof LocalizedError
        ? error.translation || error.message
        : { key: "models.invalidModelServiceUrl" },
    );
  }
  if (capability !== "search" && !connection.model.trim())
    return issue("model", { key: "models.connection.missingModel", values });
  if (
    !connection.apiKey.trim() &&
    (capability === "search" || endpoint.hostname === "api.openai.com")
  )
    return issue("apiKey", { key: "models.connection.missingKey", values });
}

export function requireConnection(
  capability: Capability,
  connection = connectionFor(capability),
) {
  const issue = connectionIssue(capability, connection);
  if (issue) throw issue.error;
  return connection;
}

export function modelEndpoint(connection: Connection, path: string): string {
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
    [window.location.origin, __HUAYU_DEV_API_ORIGIN__].includes(url.origin) &&
    /^\/api(?:\/|$)/.test(url.pathname)
  ) {
    throw new LocalizedError({ key: "models.enterTheUrlOfYourModelService" });
  }
  return url.toString();
}
