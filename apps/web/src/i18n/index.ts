import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import { messages, type MessageKey } from "./messages";
import {
  LANGUAGE_STORAGE_KEY,
  readLanguagePreference,
  resolveLocale,
  translate,
  type LanguagePreference,
  type Locale,
  type Values,
} from "./locale";
export * from "./locale";
export type { MessageKey } from "./messages";

const listeners = new Set<() => void>();
export const LocaleContext = createContext<Locale | undefined>(undefined);
let preference: LanguagePreference | undefined;
function browserLanguages() {
  return typeof navigator === "undefined"
    ? ["zh-CN"]
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
}
export function getLanguagePreference(): LanguagePreference {
  if (preference === undefined) {
    try {
      preference = readLanguagePreference(
        localStorage.getItem(LANGUAGE_STORAGE_KEY),
      );
    } catch {
      preference = "system";
    }
  }
  return preference;
}
export function getLocale(): Locale {
  return resolveLocale(getLanguagePreference(), browserLanguages());
}
function changed() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = getLocale();
    document.title = getLocale() === "en" ? "Huayu" : "Huayu 画语";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("app.description"));
  }
  listeners.forEach((listener) => listener());
}
export function setLanguage(value: LanguagePreference) {
  preference = readLanguagePreference(value);
  try {
    if (preference === "system") localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    else localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // A language choice also works when browser storage is unavailable.
  }
  changed();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => "zh-CN" as Locale);
}
export function useTranslations() {
  const appLocale = useLocale();
  const locale = useContext(LocaleContext) ?? appLocale;
  const localized = useCallback(
    (key: MessageKey, values?: Values) => t(key, values, locale),
    [locale],
  );
  return { locale, t: localized };
}
export function useLanguagePreference() {
  return useSyncExternalStore(
    subscribe,
    getLanguagePreference,
    () => "system" as LanguagePreference,
  );
}
export function t(key: MessageKey, values?: Values, locale = getLocale()) {
  return translate(messages, locale, key, values);
}
export function getTranslator(locale?: Locale) {
  return (key: MessageKey, values?: Values) =>
    translate(messages, locale ?? getLocale(), key, values);
}
export function formatDate(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(value));
}
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale = getLocale(),
) {
  return new Intl.NumberFormat(locale, options).format(value);
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
      preference = undefined;
      changed();
    }
  });
  window.addEventListener("languagechange", changed);
  changed();
}
