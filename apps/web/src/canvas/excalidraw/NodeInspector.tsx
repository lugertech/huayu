import { t, useLocale } from "@/i18n";
import { useEffect, useRef, useState } from "react";
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
  COMPOSE_EVENT,
  INSPECT_EVENT,
  materialLabel,
  focusShapes,
} from "@/workflow/context";
import { OPEN_SETTINGS_EVENT } from "@/lib/settings-event";
import type { AIComponentShape } from "@/types/components";
import { resultKind } from "@/workflow/results";
import { ResultWorkbench } from "@/Components/results/ResultWorkbench";

export function NodeInspector({
  initialId,
  projectId,
}: {
  initialId?: string;
  projectId: string;
}) {
  useLocale();
  const editor = useEditor();
  const [id, setId] = useState<string | null>(initialId || null);
  const [refine, setRefine] = useState(false);
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
      const detail = (
        event as CustomEvent<string | { id: string; refine?: boolean }>
      ).detail;
      const value = typeof detail === "string" ? detail : detail?.id;
      const shape = editor.getShape(value);
      if (shape && canInspect(shape)) {
        settingsHandoff.current = false;
        returnFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setRefine(typeof detail === "object" && !!detail.refine);
        setId(value);
        editor.select(value);
        focusShapes(editor, [value]);
      }
    }
    const close = () => setId(null);
    const closeForSettings = () => {
      settingsHandoff.current = true;
      setId(null);
    };
    container?.addEventListener(INSPECT_EVENT, open);
    container?.addEventListener(COMPOSE_EVENT, close);
    window.addEventListener(OPEN_SETTINGS_EVENT, closeForSettings);
    return () => {
      container?.removeEventListener(INSPECT_EVENT, open);
      container?.removeEventListener(COMPOSE_EVENT, close);
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
              : [
                  ...(editor.container?.querySelectorAll<HTMLElement>(
                    "[data-component-id]",
                  ) || []),
                ]
                  .find(
                    (element) =>
                      element.dataset.componentId ===
                      editor.getSelectedShapeIds()[0],
                  )
                  ?.querySelector<HTMLElement>("[data-inspect-work]") ||
                editor.container
                  ?.closest(".huayu-board")
                  ?.querySelector<HTMLElement>("[data-composer-input]") ||
                editor.container?.querySelector<HTMLElement>(".excalidraw") ||
                false
        }
      >
        <DialogTitle className="sr-only">
          {visible ? materialLabel(visible) : t("canvas.node.openEditor")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("canvas.inspector.readEditOrCreateSomethingNewFromThisContent")}
        </DialogDescription>
        {visible && resultKind(visible) ? (
          <ResultWorkbench
            key={visible.id}
            shape={visible}
            projectId={projectId}
            initialRefining={refine}
            onInspect={(id) => {
              returnFocus.current = null;
              editor.select(id);
              focusShapes(editor, [id]);
              setRefine(false);
              setId(id);
            }}
            onClose={() => setId(null)}
          />
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
