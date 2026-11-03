import { t, useLocale } from "@/i18n";
import { useEditor } from "@/canvas/editor";
import { Brush, Send, Square } from "lucide-react";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import type { DrawShape } from "@/types/components";
import {
  runWorkflow,
  useNodeRunning,
  useNodeExecution,
} from "@/workflow/execute";
import { useToast } from "../../common/ToastProvider";
import { modelSettingsAction } from "@/lib/settings-event";

export function DrawComponent({ shape }: { shape: DrawShape }) {
  useLocale();
  const editor = useEditor();
  const running = useNodeRunning(editor, shape.id);
  const execution = useNodeExecution(editor, shape.id);
  const { showToast } = useToast();
  const statusMessage =
    execution.status === "error"
      ? ""
      : execution.message ||
        (shape.props.isCompleted ? t("canvas.drawing.drawingComplete") : "");
  return (
    <div className="board-node-surface flex h-full flex-col overflow-hidden bg-card text-card-foreground">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-sm font-medium">
        <Brush className="size-4" />
        {t("canvas.components.aiDrawing")}
      </div>
      <Textarea
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        aria-label={t("canvas.drawing.aiDrawingInstructions")}
        placeholder={t("canvas.drawing.describeWhatToDrawOrChangeOnTheCanvas")}
        value={shape.props.query}
        disabled={running}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) =>
          editor.updateShape({
            id: shape.id,
            type: "ai-draw",
            props: { query: event.target.value },
          })
        }
      />
      <div className="flex items-center gap-2 border-t p-2">
        <p
          role="status"
          className="min-w-0 flex-1 truncate pl-1 text-xs text-muted-foreground"
          title={statusMessage || undefined}
        >
          {statusMessage}
        </p>
        <Button
          size="sm"
          variant={running ? "outline" : "default"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() =>
            runWorkflow(editor, shape.id).catch((error) => {
              if (error.name !== "AbortError")
                showToast({
                  title: t("canvas.drawing.drawingFailed"),
                  description: error.message,
                  variant: "destructive",
                  action: modelSettingsAction(error),
                });
            })
          }
        >
          {running ? (
            <>
              <Square />
              {t("workflow.stop")}
            </>
          ) : (
            <>
              <Send />
              {t("canvas.drawing.generate")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
