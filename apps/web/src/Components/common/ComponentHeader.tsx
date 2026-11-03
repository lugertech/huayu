import { t, useLocale } from "@/i18n";
import {
  Check,
  Clock3,
  Lock,
  Unlock,
  Play,
  Square,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Maximize2,
  X,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useEditor } from "@/canvas/editor";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { COMPONENT_CONFIGS } from "@/config/components";
import {
  useNodeRunning,
  useNodeExecution,
  type NodeData,
} from "@/workflow/execute";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import type { AIComponentShape } from "@/types/components";
import { formatElapsed, resultIsStale } from "@/workflow/freshness";

export function ComponentHeader({
  shape,
  onRun,
  onToggleLock,
  onExpand,
  onClose,
  compact = false,
  expandLabel = t("canvas.node.openEditor"),
}: {
  shape: AIComponentShape;
  onRun: () => void;
  onToggleLock: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  compact?: boolean;
  expandLabel?: string;
}) {
  useLocale();
  const editor = useEditor();
  const running = useNodeRunning(editor, shape.id);
  const execution = useNodeExecution(editor, shape.id);
  const config = COMPONENT_CONFIGS[shape.type];
  const Icon = config.icon;
  const props = shape.props as NodeData;
  const stale = !props.isLocked && resultIsStale(editor, shape.id);
  const active = execution.status === "running";
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  const elapsed =
    active && execution.startedAt
      ? now - execution.startedAt
      : execution.startedAt && execution.completedAt
        ? execution.completedAt - execution.startedAt
        : undefined;
  const showState =
    execution.status !== "error" &&
    (running || stale || execution.status !== "idle");
  return (
    <div
      className={`node-header flex shrink-0 items-center justify-between gap-2 border-b ${compact ? "h-9 px-3" : "h-11 px-3.5"}`}
    >
      <span
        className={`flex min-w-0 items-center gap-2 font-medium ${compact ? "text-[13px]" : "text-sm"}`}
      >
        <Icon size={15} />
        <span className="truncate" title={props.name || config.displayName}>
          {props.name || config.displayName}
        </span>
        {props.isLocked && (
          <Lock
            className="size-3 shrink-0 text-muted-foreground"
            aria-label={t("workflow.status.locked")}
          />
        )}
      </span>
      <div
        className="flex items-center gap-0.5"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {showState && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="status"
                  aria-live={active ? "off" : "polite"}
                  className={`mr-1 flex shrink-0 items-center gap-1 text-[11px] ${stale && !running ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                >
                  {active ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : execution.status === "queued" ||
                    execution.status === "cancelled" ? (
                    <Clock3 className="size-3" />
                  ) : stale ? (
                    <RefreshCw className="size-3" />
                  ) : execution.status === "success" ? (
                    <Check className="size-3" />
                  ) : (
                    <Clock3 className="size-3" />
                  )}
                  {active
                    ? elapsed !== undefined
                      ? formatElapsed(elapsed)
                      : t("canvas.node.running")
                    : execution.status === "cancelled"
                      ? t("workflow.status.cancelled")
                      : execution.status === "queued"
                        ? t("canvas.node.waiting")
                        : stale
                          ? t("canvas.node.needsUpdate")
                          : execution.status === "success"
                            ? elapsed !== undefined
                              ? formatElapsed(elapsed)
                              : t("workflow.status.completed")
                            : t("workflow.status.cancelled")}
                </span>
              }
            />
            <TooltipContent className="max-w-64">
              {stale && !running
                ? t("canvas.node.materialsOrInstructionsChanged")
                : execution.message}
            </TooltipContent>
          </Tooltip>
        )}
        {onExpand && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={
              compact && expandLabel !== t("canvas.node.viewWork")
                ? "node-secondary-action"
                : undefined
            }
            aria-label={expandLabel}
            title={expandLabel}
            onClick={onExpand}
          >
            <Maximize2 />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className={compact ? "node-secondary-action" : undefined}
                aria-label={t("canvas.node.stepOptions")}
              >
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onToggleLock}>
              {props.isLocked ? <Unlock /> : <Lock />}
              {props.isLocked
                ? t("canvas.node.unlockStep")
                : t("canvas.node.lockStep")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={running}
              onClick={() =>
                editor.updateShape({
                  id: shape.id,
                  props: {
                    result: undefined,
                    generation: undefined,
                    ...(props.isUploaded
                      ? {}
                      : {
                          src: undefined,
                          htmlContent: undefined,
                          chartData: undefined,
                        }),
                  },
                })
              }
            >
              <RotateCcw />
              {t("canvas.node.clearGeneratedResult")}
            </DropdownMenuItem>
            {config.helpContent && (
              <div className="max-w-64 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {config.helpContent}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          title={running ? t("canvas.node.stopRun") : t("canvas.node.runStep")}
          aria-label={
            running ? t("canvas.node.stopRun") : t("canvas.node.runStep")
          }
          onClick={onRun}
        >
          {running ? <Square /> : <Play />}
        </Button>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("canvas.node.closeEditor")}
            title={t("canvas.node.closeEditor")}
            onClick={onClose}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}
