import { errorText } from "@/i18n/errors";
import { useTranslations } from "@/i18n";
import { useEditor } from "@/features/canvas/editor";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DrawShape } from "@/types/components";
import { runWorkflow, useNodeBusy } from "@/workflow/execute";
import { useToast } from "../../../../../components/common/ToastProvider";
import { modelSettingsAction } from "@/lib/settings-event";

export function DrawComponent({ shape }: { shape: DrawShape }) {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const running = useNodeBusy(editor, shape.id);
  const { showToast } = useToast();
  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full rounded-sm border border-dashed border-muted-foreground/60 bg-muted/5" />
      <form
        data-node-controls
        className="absolute z-10 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
        style={{
          top: shape.props.h + 64,
          left: "50%",
          transform: "translateX(-50%)",
          width: Math.max(320, shape.props.w * 0.8),
          pointerEvents: "auto",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!running && !shape.props.query.trim()) return;
          void runWorkflow(editor, shape.id).catch((error) => {
            if (error.name !== "AbortError")
              showToast({
                title: t("canvas.drawing.drawingFailed"),
                description: errorText(error, locale),
                variant: "destructive",
                action: modelSettingsAction(error, t),
              });
          });
        }}
      >
        <div className="flex gap-2">
          <Input
            className="min-w-0 flex-1"
            aria-label={t("canvas.drawing.aiDrawingInstructions")}
            placeholder={t(
              "canvas.drawing.describeWhatToDrawOrChangeOnTheCanvas",
            )}
            value={shape.props.query}
            disabled={running}
            onChange={(event) =>
              editor.updateShape({
                id: shape.id,
                type: "ai-draw",
                props: { query: event.target.value },
              })
            }
          />
          <Button
            type="submit"
            size="icon"
            aria-label={t(
              running ? "canvas.node.stopRun" : "canvas.drawing.generate",
            )}
            disabled={!running && !shape.props.query.trim()}
          >
            {running ? <Square /> : <Send />}
          </Button>
        </div>
      </form>
    </div>
  );
}
