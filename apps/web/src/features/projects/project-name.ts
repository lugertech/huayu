import { getLocale, getTranslator, type Locale } from "@/i18n";

export function projectCopyName(name: string, locale: Locale = getLocale()) {
  const t = getTranslator(locale);
  const suffix = t("projects.copy", { arg0: "" });
  return t("projects.copy", {
    arg0: Array.from(name)
      .slice(0, 120 - Array.from(suffix).length)
      .join(""),
  });
}
