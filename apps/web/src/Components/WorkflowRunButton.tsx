import { t, useLocale } from "@/i18n";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Play,
  Square,
  Activity,
  Check,
  CircleAlert,
  Clock3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { Editor } from "@/canvas/editor";
import {
  nodeExecution,
  runProjectWorkflow,
  runStaleWorkflow,
  useWorkflowState,
} from "@/workflow/execute";
import {
  formatElapsed,
  generationInfo,
  resultIsStale,
} from "@/workflow/freshness";
import { focusShapes, materialLabel } from "@/workflow/context";
import { Button } from "@/ui/button";
import { useToast } from "./common/ToastProvider";
import { modelSettingsAction } from "@/lib/settings-event";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/ui/dropdown-menu";

export function WorkflowRunButton({ editor }: { editor: Editor }) {
  useLocale();
  useSyncExternalStore(editor.subscribe, editor.getVersion);
  const state = useWorkflowState(editor);
  const { showToast } = useToast();
  const nodes = editor
    .getCurrentPageShapes()
    .filter(
      (shape) =>
        nodeExecution(editor, shape.id).status !== "idle" ||
        generationInfo(shape),
    );
  const stale = nodes.filter(
    (shape) => !shape.props.isLocked && resultIsStale(editor, shape.id),
  );
  const visibleNodes = (
    state.busy
      ? nodes.filter(
          (shape) => nodeExecution(editor, shape.id).status !== "idle",
        )
      : stale.length
        ? stale
        : nodes
  ).sort((a, b) => {
    const left = editor.getShapePageBounds(a);
    const right = editor.getShapePageBounds(b);
    return (left?.x || 0) - (right?.x || 0) || (left?.y || 0) - (right?.y || 0);
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!state.busy) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.busy]);
  async function run(all = false) {
    const stopping = state.busy;
    try {
      await (!all && stale.length && !stopping
        ? runStaleWorkflow(editor)
        : runProjectWorkflow(editor));
      if (!stopping) showToast({ title: t("workflow.completed") });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError")
        showToast({
          title: t("workflow.incomplete"),
          description: error.message,
          variant: "destructive",
          action: modelSettingsAction(error),
        });
    }
  }
  return (
    <div className="flex items-center gap-1">
      {!!nodes.length && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("workflow.viewRunDetails")}
                className="gap-1.5 text-muted-foreground"
              >
                <Activity className="size-3.5" />
                <span className="hidden text-xs sm:inline">
                  {state.busy
                    ? `${state.completed}/${state.total}`
                    : stale.length
                      ? t("workflow.outdatedCount", { count: stale.length })
                      : t("workflow.runHistory")}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent
            className="max-h-[min(70dvh,32rem)] w-80"
            align="end"
          >
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {state.busy
                ? t("workflow.completedCount", {
                    arg0: state.completed,
                    arg1: state.total,
                  })
                : stale.length
                  ? t("workflow.materialsChanged")
                  : t("workflow.lastRun")}
            </div>
            {visibleNodes.map((shape) => {
              const execution = nodeExecution(editor, shape.id);
              const info = generationInfo(shape);
              const outdated =
                !shape.props.isLocked && resultIsStale(editor, shape.id);
              const busy = execution.status === "running";
              const failed = execution.status === "error";
              const waiting = execution.status === "queued";
              const duration = execution.startedAt
                ? (busy ? now : execution.completedAt || now) -
                  execution.startedAt
                : info?.durationMs;
              const label = busy
                ? t("workflow.status.processing")
                : waiting
                  ? t("workflow.status.waitingForInputs")
                  : failed
                    ? t("workflow.status.failed")
                    : outdated
                      ? t("workflow.status.outdated")
                      : execution.status === "cancelled"
                        ? t("workflow.status.cancelled")
                        : shape.props.isLocked
                          ? t("workflow.status.locked")
                          : t("workflow.status.completed");
              const Icon = busy
                ? Loader2
                : failed
                  ? CircleAlert
                  : waiting || execution.status === "cancelled"
                    ? Clock3
                    : outdated
                      ? RefreshCw
                      : Check;
              return (
                <DropdownMenuItem
                  key={shape.id}
                  className="items-start gap-3 px-3 py-2.5"
                  onClick={() => {
                    editor.select(shape.id);
                    focusShapes(editor, [shape.id]);
                  }}
                >
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${busy ? "animate-spin text-primary" : failed ? "text-destructive" : "text-muted-foreground"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm"
                      title={
                        shape.type === "instruction"
                          ? shape.props.text
                          : materialLabel(shape)
                      }
                    >
                      {shape.type === "instruction" && shape.props.text
                        ? shape.props.text
                        : materialLabel(shape)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {label}
                      {failed && execution.message
                        ? ` · ${execution.message}`
                        : ""}
                    </span>
                  </span>
                  {duration !== undefined && !waiting && (
                    <span className="pt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {formatElapsed(duration)}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={state.busy}
              onClick={() => void run(true)}
            >
              <Play />
              {t("workflow.runTheEntireCanvasAgain")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        size="sm"
        onClick={() => void run()}
        aria-label={
          state.busy
            ? t("workflow.stopWorkflow")
            : stale.length
              ? t("workflow.updateOutdatedResults")
              : t("workflow.runWorkflow")
        }
        className="gap-1.5"
      >
        {state.busy ? (
          <Square className="size-3.5" />
        ) : stale.length ? (
          <RefreshCw className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
        <span className="hidden sm:inline">
          {state.busy
            ? t("workflow.stop")
            : stale.length
              ? t("workflow.updateResults")
              : t("workflow.runWorkflow")}
        </span>
      </Button>
    </div>
  );
}
