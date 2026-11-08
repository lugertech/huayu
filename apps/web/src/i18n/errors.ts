import { getLocale, t, type Locale, type MessageKey } from "./index";
import { messages } from "./messages";

export interface ErrorTranslation {
  key: MessageKey;
  values?: Record<string, string | number | ErrorTranslation>;
}

export function translatedErrorMessage(
  translation: ErrorTranslation,
  locale: Locale = getLocale(),
): string {
  const values = Object.fromEntries(
    Object.entries(translation.values || {}).map(([key, value]) => [
      key,
      typeof value === "object" ? translatedErrorMessage(value, locale) : value,
    ]),
  );
  return t(translation.key, values, locale);
}

/** Keeps application errors translatable without interpreting third-party details as keys. */
export class LocalizedError extends Error {
  readonly translation?: ErrorTranslation;

  constructor(message: string | ErrorTranslation, options?: ErrorOptions) {
    super(
      typeof message === "string" ? message : translatedErrorMessage(message),
      options,
    );
    this.name = "LocalizedError";
    if (typeof message !== "string") this.translation = message;
  }
}

export function errorText(error: unknown, locale: Locale = getLocale()) {
  if (error instanceof LocalizedError && error.translation)
    return translatedErrorMessage(error.translation, locale);
  return error instanceof Error
    ? error.message
    : t("common.tryAgain", undefined, locale);
}

/** Reads persisted error translations at the checkpoint boundary. */
export function readErrorTranslation(
  value: unknown,
): ErrorTranslation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (
    typeof input.key !== "string" ||
    !Object.hasOwn(messages["zh-CN"], input.key)
  )
    return;
  const key = input.key as MessageKey;
  if (input.values === undefined) return { key };
  if (
    !input.values ||
    typeof input.values !== "object" ||
    Array.isArray(input.values)
  )
    return;
  const values: NonNullable<ErrorTranslation["values"]> = {};
  for (const [name, value] of Object.entries(input.values)) {
    if (typeof value === "string" || typeof value === "number")
      values[name] = value;
    else {
      const nested = readErrorTranslation(value);
      if (!nested) return;
      values[name] = nested;
    }
  }
  return { key, values };
}

// Older checkpoints and the local API contain literal, human-readable system messages.
const knownMessages = new Map<string, MessageKey>();
for (const catalog of Object.values(messages))
  for (const [key, message] of Object.entries(catalog))
    if (typeof message === "string" && !/\{\w+\}/.test(message))
      knownMessages.set(message, key as MessageKey);

export function knownErrorTranslation(message: string) {
  const key = knownMessages.get(message);
  return key ? { key } : undefined;
}
