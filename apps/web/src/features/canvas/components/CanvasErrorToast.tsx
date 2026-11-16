import { useSyncExternalStore } from "react";
import type { ToastOptions } from "@/components/common/ToastProvider";
import { t, useLocale, type Locale, type MessageKey } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { modelSettingsAction } from "@/lib/settings-event";
import type { Editor } from "../engine/editor";

function CanvasToastText({
  editor,
  children,
}: {
  editor: Editor;
  children: (locale: Locale) => string;
}) {
  const appLocale = useLocale();
  const getSnapshot = () => editor.locale;
  const locale = useSyncExternalStore(
    editor.subscribeLocale,
    getSnapshot,
    getSnapshot,
  );
  return children(locale ?? appLocale);
}

export function canvasErrorToast(
  editor: Editor,
  error: unknown,
  retry?: () => void,
): ToastOptions {
  // Notifications render outside the canvas locale context.
  const label = (key: MessageKey) => (
    <CanvasToastText editor={editor}>
      {(locale) => t(key, undefined, locale)}
    </CanvasToastText>
  );
  return {
    title: label("common.operationFailed"),
    description: (
      <CanvasToastText editor={editor}>
        {(locale) => errorText(error, locale)}
      </CanvasToastText>
    ),
    variant: "destructive",
    action:
      modelSettingsAction(error, label) ??
      (retry && { label: label("common.retry"), onClick: retry }),
  };
}
