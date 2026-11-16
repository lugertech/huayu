import type { MessageKey } from "@/i18n";
import type { Capability } from "@/ai/settings";
import { ModelConnectionError } from "@/ai/errors";

export const OPEN_SETTINGS_EVENT = "huayu:open-settings";
export function openModelSettings(capability: Capability = "text") {
  window.dispatchEvent(
    new CustomEvent(OPEN_SETTINGS_EVENT, { detail: capability }),
  );
}
export function modelSettingsAction<Label>(
  error: unknown,
  labelFor: (key: MessageKey) => Label,
) {
  if (error instanceof ModelConnectionError)
    return {
      label: labelFor("models.connection.openSettings"),
      onClick: () => openModelSettings(error.capability),
    };
}
