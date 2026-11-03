export type Locale = "zh-CN" | "en";
export type LanguagePreference = Locale | "system";
export const LANGUAGE_STORAGE_KEY = "huayu:language";

export function resolveLocale(
  preference: unknown,
  languages: readonly string[] = [],
): Locale {
  if (preference === "zh-CN" || preference === "en") return preference;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}

export function readLanguagePreference(value: unknown): LanguagePreference {
  return value === "zh-CN" || value === "en" ? value : "system";
}

export type Message = string | { one: string; other: string };
export type MessageCatalog = Readonly<Record<string, Message>>;
export type MessageCatalogs = Readonly<Record<Locale, MessageCatalog>>;
export type Values = Record<string, string | number>;
export function interpolate(message: string, values: Values = {}) {
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export function translate(
  messages: MessageCatalogs,
  locale: Locale,
  key: string,
  values: Values = {},
): string {
  const selected = messages[locale] ?? messages["zh-CN"];
  const fallback = messages["zh-CN"];
  const message =
    (Object.hasOwn(selected, key) ? selected[key] : undefined) ??
    (Object.hasOwn(fallback, key) ? fallback[key] : undefined);
  const text =
    typeof message === "object"
      ? message[Number(values.count) === 1 ? "one" : "other"]
      : message || "";
  return interpolate(text, values);
}
