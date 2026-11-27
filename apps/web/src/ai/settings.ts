import { useSyncExternalStore } from "react";
import { ModelConnectionError } from "./errors";
import {
  CAPABILITIES,
  CAPABILITY_MESSAGE_KEYS,
  IMAGE_PROVIDERS,
  configurationIssue,
  connectionBaseUrl,
  connectionRequestKey,
  defaultSettings,
  modelChecks,
  parseSettings,
  type Capability,
  type CapabilityConnections,
  type ConfigurationIssue,
  type Connection,
  type ImageConnection,
  type ModelCheck,
  type ModelSettings,
} from "./model-config";

export const MODEL_STORAGE_KEY = "huayu:model-settings:v2";
export const LEGACY_MODEL_STORAGE_KEY = "huayu:model-settings:v1";
const MODEL_SETUP_DISMISSED_KEY = "huayu:model-setup-dismissed";

const listeners = new Set<() => void>();
let cached: ModelSettings | undefined;

function readSavedSettings(): ModelSettings {
  return parseSettings(
    localStorage.getItem(MODEL_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_MODEL_STORAGE_KEY),
  );
}

export function getSettings(): ModelSettings {
  if (!cached) {
    try {
      cached = readSavedSettings();
    } catch {
      cached = defaultSettings();
    }
  }
  return cached;
}

export function saveSettings(value: ModelSettings) {
  localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(value));
  cached = value;
  listeners.forEach((listener) => listener());
}

function mergeConnection<C extends Connection>(
  latest: C,
  original: C,
  draft: C,
): C {
  const merged = { ...latest };
  const credentialsChanged =
    original.apiKey !== draft.apiKey ||
    connectionBaseUrl(original) !== connectionBaseUrl(draft);
  const fields = Object.keys(draft) as Array<keyof C>;
  for (const key of fields) {
    if (key === "checks") continue;
    const credentialField =
      key === "apiKey" ||
      key === "baseUrl" ||
      key === "workspaceId" ||
      key === "region";
    if (original[key] !== draft[key] || (credentialsChanged && credentialField))
      merged[key] = draft[key];
  }

  const target = connectionRequestKey(merged);
  merged.checks =
    connectionRequestKey(latest) === target ? { ...latest.checks } : {};
  if (connectionRequestKey(draft) === target) {
    const originalTarget = connectionRequestKey(original) === target;
    for (const operation of modelChecks) {
      const result = draft.checks[operation];
      if (
        originalTarget
          ? JSON.stringify(result) ===
            JSON.stringify(original.checks[operation])
          : !result
      )
        continue;
      if (result) merged.checks[operation] = result;
      else delete merged.checks[operation];
    }
  }
  const matchesDraft = fields.every((key) =>
    key === "checks"
      ? modelChecks.every(
          (operation) =>
            JSON.stringify(merged.checks[operation]) ===
            JSON.stringify(draft.checks[operation]),
        )
      : merged[key] === draft[key],
  );
  return matchesDraft ? draft : merged;
}

export function saveSettingsEdits(
  original: ModelSettings,
  draft: ModelSettings,
) {
  const latest = readSavedSettings();
  const previous = new Map(original.language.map((entry) => [entry.id, entry]));
  const edited = new Map(draft.language.map((entry) => [entry.id, entry]));
  latest.language = latest.language.flatMap((entry) => {
    const before = previous.get(entry.id);
    const after = edited.get(entry.id);
    if (!before) return [entry];
    return after ? [mergeConnection(entry, before, after)] : [];
  });
  latest.language.push(
    ...draft.language.filter(
      (entry) =>
        !previous.has(entry.id) &&
        !latest.language.some((saved) => saved.id === entry.id),
    ),
  );
  for (const provider of IMAGE_PROVIDERS)
    latest.images[provider] = mergeConnection(
      latest.images[provider],
      original.images[provider],
      draft.images[provider],
    );
  latest.speech = mergeConnection(latest.speech, original.speech, draft.speech);
  latest.transcription = mergeConnection(
    latest.transcription,
    original.transcription,
    draft.transcription,
  );
  latest.search = mergeConnection(latest.search, original.search, draft.search);
  for (const key of ["image", "defaultImage"] as const)
    if (original.selection[key] !== draft.selection[key])
      latest.selection[key] = draft.selection[key];
  for (const key of ["text", "vision"] as const) {
    if (original.selection[key] !== draft.selection[key])
      latest.selection[key] = draft.selection[key];
    if (!latest.language.some((model) => model.id === latest.selection[key]))
      latest.selection[key] = null;
  }
  saveSettings(latest);
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (
      event.key === MODEL_STORAGE_KEY ||
      event.key === LEGACY_MODEL_STORAGE_KEY ||
      event.key === null
    ) {
      cached = undefined;
      listeners.forEach((listener) => listener());
    }
  });

export function useModelSettings() {
  return useSyncExternalStore(subscribe, getSettings);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function shouldOfferModelSetup() {
  try {
    if (localStorage.getItem(MODEL_SETUP_DISMISSED_KEY) === "true")
      return false;
  } catch {
    // Offer setup when the browser cannot read the preference.
  }
  const settings = getSettings();
  return !CAPABILITIES.some(
    (capability) =>
      capability !== "search" && connectionFor(capability, settings),
  );
}

export function dismissModelSetup() {
  try {
    localStorage.setItem(MODEL_SETUP_DISMISSED_KEY, "true");
  } catch {
    // Browser storage can be unavailable.
  }
}

function enabledConnection<C extends Connection>(
  capability: Capability,
  connection: C,
): C | undefined {
  return connection.enabled && !configurationIssue(capability, connection)
    ? connection
    : undefined;
}

export function defaultImageConnection(
  settings: ModelSettings,
): ImageConnection | undefined {
  const preferred = settings.selection.defaultImage;
  if (preferred) {
    const connection = enabledConnection("image", settings.images[preferred]);
    if (connection) return connection;
  }
  return IMAGE_PROVIDERS.map((provider) => settings.images[provider]).find(
    (connection) => enabledConnection("image", connection),
  );
}

export function connectionFor<C extends Capability>(
  capability: C,
  settings = getSettings(),
): CapabilityConnections[C] | undefined {
  function language(id: string | null) {
    return settings.language.find(
      (entry) => entry.id === id && enabledConnection("text", entry),
    );
  }
  function textConnection() {
    return (
      language(settings.selection.text) ??
      settings.language.find((entry) => enabledConnection("text", entry))
    );
  }
  const candidates: {
    [K in Capability]: () => CapabilityConnections[K] | undefined;
  } = {
    text: textConnection,
    vision: () => language(settings.selection.vision) ?? textConnection(),
    image: () => {
      const selected = settings.selection.image;
      return (
        (selected
          ? enabledConnection("image", settings.images[selected])
          : undefined) ?? defaultImageConnection(settings)
      );
    },
    speech: () => enabledConnection("speech", settings.speech),
    transcription: () =>
      enabledConnection("transcription", settings.transcription),
    search: () => enabledConnection("search", settings.search),
  };
  return candidates[capability]();
}

function resolveConnection<C extends Capability>(
  capability: C,
  settings: ModelSettings,
):
  | { connection: CapabilityConnections[C]; issue?: never }
  | { issue: ConfigurationIssue; connection?: never } {
  const connection = connectionFor(capability, settings);
  if (!connection) {
    return {
      issue: {
        field: "apiKey",
        error: new ModelConnectionError(
          capability,
          {
            key: "models.connection.configureCapability",
            values: {
              capability: { key: CAPABILITY_MESSAGE_KEYS[capability] },
            },
          },
          "configuration",
        ),
      },
    };
  }
  if (
    capability === "vision" &&
    connection.checks.vision?.status !== "verified"
  ) {
    return {
      issue: {
        field: "model",
        error: new ModelConnectionError(
          capability,
          { key: "models.connection.visionRequired" },
          "configuration",
        ),
      },
    };
  }
  return { connection };
}

export function connectionIssue(
  capability: Capability,
  settings = getSettings(),
) {
  return resolveConnection(capability, settings).issue;
}

export function requireConnection<C extends Capability>(
  capability: C,
  settings = getSettings(),
): CapabilityConnections[C] {
  const result = resolveConnection(capability, settings);
  if (result.issue) throw result.issue.error;
  return result.connection;
}

export function recordSuccessfulCheck(operation: ModelCheck, used: Connection) {
  try {
    const settings = readSavedSettings();
    let saved: Connection | undefined;
    switch (used.provider) {
      case "language":
        saved = settings.language.find((entry) => entry.id === used.id);
        break;
      case "gpt-image":
      case "seedream":
        saved = settings.images[used.provider];
        break;
      case "aliyun-tts":
        saved = settings.speech;
        break;
      case "aliyun-asr":
        saved = settings.transcription;
        break;
      case "tavily":
        saved = settings.search;
    }
    if (
      !saved ||
      !saved.enabled ||
      connectionRequestKey(saved) !== connectionRequestKey(used) ||
      saved.checks[operation]?.status === "verified"
    )
      return;
    saved.checks = { ...saved.checks, [operation]: { status: "verified" } };
    saveSettings(settings);
  } catch {
    // An unavailable local store does not invalidate a completed request.
  }
}
