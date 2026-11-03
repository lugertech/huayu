import { t, useLocale } from "@/i18n";
import type { PointerEvent } from "react";
import { Plus } from "lucide-react";
import { useEditor } from "@/canvas/editor";
import type { AIComponentShape } from "@/types/components";
import {
  CONNECT_EVENT,
  type ConnectionSide,
  type ConnectionStart,
} from "@/workflow/connections";

export function ComponentConnectionDots({
  shape,
}: {
  shape: AIComponentShape;
}) {
  useLocale();
  const editor = useEditor();
  const selected = editor.getSelectedShapeIds();
  if (selected.length !== 1 || selected[0] !== shape.id) return null;
  function begin(side: ConnectionSide, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    editor.container?.dispatchEvent(
      new CustomEvent<ConnectionStart>(CONNECT_EVENT, {
        detail: {
          id: shape.id,
          side,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        },
      }),
    );
  }
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          className="connection-button board-connection-port absolute top-1/2 z-10 flex size-9 -translate-y-1/2 touch-none items-center justify-center"
          style={{ [side]: -18 }}
          data-connection-id={shape.id}
          data-connection-side={side}
          aria-label={
            side === "left"
              ? t("common.addInputMaterial")
              : t("common.addNextStep")
          }
          title={
            side === "left"
              ? t("common.dragToConnectInputMaterialOrClickToAdd")
              : t("common.dragToConnectTheNextStepOrClickToAdd")
          }
          onPointerDown={(event) => begin(side, event)}
          onClick={(event) => {
            if (event.detail) return;
            const rect = event.currentTarget.getBoundingClientRect();
            editor.container?.dispatchEvent(
              new CustomEvent<ConnectionStart>(CONNECT_EVENT, {
                detail: {
                  id: shape.id,
                  side,
                  pointerId: -1,
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
              }),
            );
          }}
        >
          <span className="flex size-4 items-center justify-center rounded-full border border-primary/70 bg-background text-primary shadow-xs">
            <Plus className="size-3" />
          </span>
        </button>
      ))}
    </>
  );
}
