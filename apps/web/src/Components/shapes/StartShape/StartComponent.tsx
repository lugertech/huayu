import { t, useLocale } from "@/i18n";
import { useEditor } from "@/canvas/editor";
import { Play, Square } from "lucide-react";
import type { StartShape } from "@/types/components";
import { ComponentConnectionDots } from "../../common/ComponentConnectionDots";
import { Button } from "@/ui/button";
import { runWorkflow, useNodeRunning } from "@/workflow/execute";
import { useToast } from "../../common/ToastProvider";
import { modelSettingsAction } from "@/lib/settings-event";

export function StartComponent({ shape }: { shape: StartShape }) {
  useLocale();
  const editor = useEditor();
  const running = useNodeRunning(editor, shape.id);
  const { showToast } = useToast();
  return (
    <div className="relative h-full w-full">
      <ComponentConnectionDots shape={shape} />
      <Button
        variant="outline"
        className="board-start-surface h-full w-full rounded-full bg-card shadow-xs"
        aria-label={
          running ? t("workflow.stopWorkflow") : t("workflow.runWorkflow")
        }
        onPointerDown={(event) => {
          if (editor.getCurrentToolId() !== "arrow") event.stopPropagation();
        }}
        onClick={() =>
          runWorkflow(editor, shape.id).catch((error) => {
            if (error.name !== "AbortError")
              showToast({
                title: t("workflow.status.failed"),
                description: error.message,
                variant: "destructive",
                action: modelSettingsAction(error),
              });
          })
        }
      >
        {running ? <Square className="size-6" /> : <Play className="size-6" />}
      </Button>
    </div>
  );
}
