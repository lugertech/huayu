import { t } from "@/i18n";
import { useSyncExternalStore } from "react";
import { ModelConnectionError } from "./errors";

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
export const MODEL_STORAGE_KEY = "huayu:model-settings:v1";
export const CAPABILITY_LABELS: Record<Capability, string> = {
  get text() {
    return t("models.textGeneration");
  },
  get vision() {
    return t("models.imageUnderstanding");
  },
  get image() {
    return t("models.imageGeneration");
  },
  get speech() {
    return t("models.textToSpeech");
  },
  get transcription() {
    return t("api.transcription");
  },
  get search() {
    return t("models.webSearch");
  },
};

export function defaultSettings(): ModelSettings {
  const models = {
    text: "gpt-4o-mini",
    vision: "gpt-4o-mini",
    image: "gpt-image-1",
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
            capability === "search"
              ? "https://api.tavily.com"
              : "https://api.openai.com/v1",
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

export function clearSettings() {
  localStorage.removeItem(MODEL_STORAGE_KEY);
  cached = defaultSettings();
  listeners.forEach((listener) => listener());
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

export function connectionFor(capability: Capability): Connection {
  const settings = getSettings();
  return settings.connections[capability];
}

export function connectionIssue(
  capability: Capability,
  connection = connectionFor(capability),
): { field: "baseUrl" | "model" | "apiKey"; message: string } | undefined {
  const values = { capability: CAPABILITY_LABELS[capability] };
  if (!connection.baseUrl.trim())
    return {
      field: "baseUrl",
      message: t("models.connection.missingUrl", values),
    };
  let endpoint: URL;
  try {
    endpoint = new URL(modelEndpoint(connection, ""));
  } catch (error) {
    return {
      field: "baseUrl",
      message:
        error instanceof Error
          ? error.message
          : t("models.invalidModelServiceUrl"),
    };
  }
  if (capability !== "search" && !connection.model.trim())
    return {
      field: "model",
      message: t("models.connection.missingModel", values),
    };
  if (
    !connection.apiKey.trim() &&
    (capability === "search" || endpoint.hostname === "api.openai.com")
  )
    return {
      field: "apiKey",
      message: t("models.connection.missingKey", values),
    };
}

export function requireConnection(
  capability: Capability,
  connection = connectionFor(capability),
) {
  const issue = connectionIssue(capability, connection);
  if (issue)
    throw new ModelConnectionError(capability, issue.message, "configuration");
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
    throw new Error(t("models.invalidModelServiceUrl"));
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(t("models.serviceUrl.invalid"));
  }
  if (
    (url.origin === window.location.origin ||
      ["5858", "5173"].includes(url.port)) &&
    /^\/api(?:\/|$)/.test(url.pathname)
  ) {
    throw new Error(t("models.enterTheUrlOfYourModelService"));
  }
  return url.toString();
}
