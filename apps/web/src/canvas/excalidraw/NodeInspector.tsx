import { useTranslations } from "@/i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useEditor } from "@/canvas/editor";
import { CanvasNode } from "@/Components/canvas/CanvasNode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/dialog";
import {
  canInspect,
  INSPECT_EVENT,
  materialLabel,
  focusShapes,
} from "@/workflow/context";
import { OPEN_SETTINGS_EVENT } from "@/lib/settings-event";
import type { AIComponentShape } from "@/types/components";
import { resultKind } from "@/workflow/results";
const ResultWorkbench = lazy(() =>
  import("@/Components/results/ResultWorkbench").then((module) => ({
    default: module.ResultWorkbench,
  })),
);

export function NodeInspector({
  initialId,
  projectId,
}: {
  initialId?: string;
  projectId: string;
}) {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const [id, setId] = useState<string | null>(initialId || null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const settingsHandoff = useRef(false);
  const shape = id ? editor.getShape(id) : undefined;
  const visible =
    shape &&
    canInspect(shape) &&
    editor.pageOf(shape.id) === editor.getCurrentPageId()
      ? shape
      : undefined;
  const isVisible = !!visible;
  useEffect(() => {
    const container = editor.container;
    function open(event: Event) {
      const value = (event as CustomEvent<string>).detail;
      const shape = editor.getShape(value);
      if (shape && canInspect(shape)) {
        settingsHandoff.current = false;
        returnFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setId(value);
        editor.select(value);
        focusShapes(editor, [value]);
      }
    }
    const closeForSettings = () => {
      settingsHandoff.current = true;
      setId(null);
    };
    container?.addEventListener(INSPECT_EVENT, open);
    window.addEventListener(OPEN_SETTINGS_EVENT, closeForSettings);
    return () => {
      container?.removeEventListener(INSPECT_EVENT, open);
      window.removeEventListener(OPEN_SETTINGS_EVENT, closeForSettings);
    };
  }, [editor]);
  useEffect(() => {
    if (id && !isVisible) setId(null);
  }, [id, isVisible]);
  return (
    <Dialog
      open={isVisible}
      onOpenChange={(open) => {
        if (!open) setId(null);
      }}
    >
      <DialogContent
        data-canvas-ui
        ref={panel}
        showCloseButton={false}
        className={`flex flex-col gap-0 overflow-hidden rounded-xl p-0 ${visible && resultKind(visible) ? "h-[min(52rem,calc(100dvh-2rem))] sm:max-w-[min(78rem,calc(100vw-3rem))]" : "h-[min(42rem,calc(100dvh-2rem))] sm:max-w-3xl"}`}
        initialFocus={(interaction) =>
          interaction === "touch"
            ? false
            : panel.current?.querySelector<HTMLElement>(
                "[data-result-focus]",
              ) ||
              panel.current?.querySelector<HTMLElement>(
                "textarea:not([readonly]):not([disabled])",
              ) ||
              panel.current?.querySelector<HTMLElement>(
                "[data-content-reading]",
              ) ||
              undefined
        }
        finalFocus={() =>
          settingsHandoff.current
            ? false
            : returnFocus.current?.isConnected
              ? returnFocus.current
              : editor.container?.querySelector<HTMLElement>(".excalidraw") ||
                false
        }
      >
        <DialogTitle className="sr-only">
          {visible
            ? materialLabel(visible, locale)
            : t("canvas.node.openEditor")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("canvas.inspector.readOrEditContent")}
        </DialogDescription>
        {visible && resultKind(visible) ? (
          <Suspense
            fallback={
              <div role="status" className="p-6 text-sm text-muted-foreground">
                {t("common.loading")}
              </div>
            }
          >
            <ResultWorkbench
              key={visible.id}
              shape={visible}
              projectId={projectId}
              onInspect={(id) => {
                returnFocus.current = null;
                editor.select(id);
                focusShapes(editor, [id]);
                setId(id);
              }}
              onClose={() => setId(null)}
            />
          </Suspense>
        ) : (
          visible && (
            <CanvasNode
              key={visible.id}
              shape={visible as AIComponentShape}
              expanded
              onClose={() => setId(null)}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
