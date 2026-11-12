import { createContext, useCallback, useContext } from "react";
import {
  resolveLocale,
  readLanguagePreference,
  LANGUAGE_STORAGE_KEY,
  translate,
  type Locale,
  type LanguagePreference,
} from "../../web/src/i18n/locale";
import { sitePath } from "./config";
import { messages, type MessageKey } from "./messages";
export { LANGUAGE_STORAGE_KEY, readLanguagePreference, resolveLocale };
export type { Locale, LanguagePreference };

export const LocaleContext = createContext<Locale>("zh-CN");
export function localeForPath(path: string): Locale {
  return /^\/en(?:\/|$)/.test(path) ? "en" : "zh-CN";
}
export function withoutLocale(path: string) {
  return path.replace(/^\/en(?=\/|$)/, "") || "/";
}
export function localizedPath(path = "", locale: Locale = "zh-CN") {
  return sitePath(`${locale === "en" ? "en/" : ""}${path.replace(/^\//, "")}`);
}
export function homeTitle(locale: Locale) {
  return `${translate(messages, locale, "app.name")} · ${translate(messages, locale, "home.hero.eyebrow")}`;
}
export function useSiteI18n() {
  const locale = useContext(LocaleContext);
  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) =>
      translate(messages, locale, key, values),
    [locale],
  );
  const path = useCallback(
    (path = "") => localizedPath(path, locale),
    [locale],
  );
  return {
    locale,
    t,
    path,
  };
}
