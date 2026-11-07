import { t, type Locale } from "@/i18n";
import type { Capability } from "@/ai/settings";
import { ModelConnectionError } from "@/ai/errors";

export const OPEN_SETTINGS_EVENT = "huayu:open-settings";
export function openModelSettings(capability: Capability = "text") {
  window.dispatchEvent(
    new CustomEvent(OPEN_SETTINGS_EVENT, { detail: capability }),
  );
}
export function modelSettingsAction(error: unknown, locale: Locale) {
  if (error instanceof ModelConnectionError)
    return {
      label: t("models.connection.openSettings", undefined, locale),
      onClick: () => openModelSettings(error.capability),
    };
}
