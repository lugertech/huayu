import { defaultLang, languages } from "@excalidraw/excalidraw";
import { useEffect, useState } from "react";
import { useLanguagePreference, type Locale } from "@/i18n";

export const boardLanguages = languages.filter(
  ({ code }) => !code.startsWith("__test__"),
);
const storageKey = "huayu:board-language";

function readBoardLanguage(value: string | null) {
  return boardLanguages.find(({ code }) => code === value)?.code || "system";
}

export interface BoardLanguage {
  preference: string;
  langCode: string;
  uiLocale: Locale;
  setPreference: (value: string) => void;
}

export function useBoardLanguage(): BoardLanguage {
  const appLanguage = useLanguagePreference();
  const [preference, setLanguage] = useState(() => {
    try {
      return readBoardLanguage(localStorage.getItem(storageKey));
    } catch {
      return "system";
    }
  });
  const [systemLanguages, setSystemLanguages] = useState(() =>
    navigator.languages.length
      ? [...navigator.languages]
      : [navigator.language],
  );
  useEffect(() => {
    const followSystem = () =>
      setSystemLanguages(
        navigator.languages.length
          ? [...navigator.languages]
          : [navigator.language],
      );
    const followStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null)
        setLanguage(readBoardLanguage(event.newValue));
    };
    window.addEventListener("languagechange", followSystem);
    window.addEventListener("storage", followStorage);
    return () => {
      window.removeEventListener("languagechange", followSystem);
      window.removeEventListener("storage", followStorage);
    };
  }, []);

  let langCode = preference;
  if (preference === "system") {
    langCode = defaultLang.code;
    const preferred =
      appLanguage === "system" ? systemLanguages : [appLanguage];
    for (const value of preferred) {
      const requested = new Intl.Locale(value).maximize();
      const exact = boardLanguages.find(
        ({ code }) => code.toLowerCase() === value.toLowerCase(),
      );
      const match =
        exact ||
        boardLanguages.find(({ code }) =>
          requested.language === "zh"
            ? code === (requested.script === "Hant" ? "zh-TW" : "zh-CN")
            : code.split("-")[0] === requested.language,
        );
      if (match) {
        langCode = match.code;
        break;
      }
    }
  }
  return {
    preference,
    langCode,
    uiLocale: langCode.startsWith("zh") ? "zh-CN" : "en",
    setPreference(value) {
      setLanguage(value);
      try {
        if (value === "system") localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, value);
      } catch {
        // Keep the choice for this session when storage is unavailable.
      }
    },
  };
}
