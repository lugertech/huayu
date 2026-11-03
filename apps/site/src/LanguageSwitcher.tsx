import { useEffect, useState } from "react";
import { Translate as Languages } from "@phosphor-icons/react";
import { base } from "./config";
import {
  useSiteI18n,
  withoutLocale,
  localizedPath,
  readLanguagePreference,
  resolveLocale,
  LANGUAGE_STORAGE_KEY,
  type LanguagePreference,
} from "./i18n";

export function LanguageSwitcher() {
  const { t, locale } = useSiteI18n();
  const [preference, setPreference] = useState<LanguagePreference>(locale);
  useEffect(() => {
    try {
      setPreference(
        readLanguagePreference(localStorage.getItem(LANGUAGE_STORAGE_KEY)),
      );
    } catch {
      setPreference("system");
    }
  }, []);
  return (
    <label className="language-switcher">
      <Languages size={16} aria-hidden="true" />
      <select
        aria-label={t("language.label")}
        value={preference}
        onChange={(event) => {
          const choice = readLanguagePreference(event.target.value);
          const next = resolveLocale(
            choice,
            navigator.languages?.length
              ? navigator.languages
              : [navigator.language],
          );
          setPreference(choice);
          try {
            if (choice === "system")
              localStorage.removeItem(LANGUAGE_STORAGE_KEY);
            else localStorage.setItem(LANGUAGE_STORAGE_KEY, choice);
          } catch {
            /* The selected route still works without storage. */
          }
          if (next !== locale) {
            const path = `/${window.location.pathname.slice(base.length)}`;
            window.location.assign(
              localizedPath(withoutLocale(path), next) + window.location.search,
            );
          }
        }}
      >
        <option value="system">{t("language.system")}</option>
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
