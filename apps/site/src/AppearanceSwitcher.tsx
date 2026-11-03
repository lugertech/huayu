import { useEffect, useState } from "react";
import { CircleHalf } from "@phosphor-icons/react";
import { useSiteI18n } from "./i18n";

type Appearance = "system" | "light" | "dark";

function applyAppearance(choice: Appearance) {
  document.documentElement.classList.toggle(
    "dark",
    choice === "dark" ||
      (choice === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches),
  );
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("huayu:site-theme");
    } catch {
      /* System appearance also works without storage. */
    }
    setAppearance(saved === "light" || saved === "dark" ? saved : "system");
  }, []);
  useEffect(() => {
    if (appearance === null) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyAppearance(appearance);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [appearance]);
  return {
    appearance: appearance ?? "system",
    onChange(choice: Appearance) {
      try {
        if (choice === "system") localStorage.removeItem("huayu:site-theme");
        else localStorage.setItem("huayu:site-theme", choice);
      } catch {
        /* Apply the choice for this visit. */
      }
      applyAppearance(choice);
      setAppearance(choice);
    },
  };
}

export function AppearanceSwitcher({
  appearance,
  onChange,
}: ReturnType<typeof useAppearance>) {
  const { t } = useSiteI18n();
  return (
    <label className="appearance-switcher" title={t("appearance.label")}>
      <CircleHalf size={16} aria-hidden="true" />
      <select
        aria-label={t("appearance.label")}
        value={appearance}
        onChange={(event) => onChange(event.target.value as Appearance)}
      >
        <option value="system">{t("appearance.system")}</option>
        <option value="light">{t("appearance.light")}</option>
        <option value="dark">{t("appearance.dark")}</option>
      </select>
    </label>
  );
}
