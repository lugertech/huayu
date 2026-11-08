import { useTranslations } from "@/i18n";
import {
  Check,
  Clock3,
  Lock,
  Unlock,
  Play,
  Square,
  Loader2,
  X,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useEditor } from "@/features/canvas/editor";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { componentConfig } from "@/config/components";
import {
  useNodeBusy,
  useNodeExecution,
  type NodeData,
} from "@/workflow/execute";
import type { AIComponentShape } from "@/types/components";
import { formatElapsed, resultIsStale } from "@/workflow/freshness";

export function ComponentHeader({
  shape,
  onRun,
  onToggleLock,
  onClose,
  compact = false,
}: {
  shape: AIComponentShape;
  onRun?: () => void;
  onToggleLock: () => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const running = useNodeBusy(editor, shape.id);
  const execution = useNodeExecution(editor, shape.id, locale);
  const config = componentConfig(shape.type, locale);
  const Icon = config.icon;
  const props = shape.props as NodeData;
  const stale = !props.isLocked && resultIsStale(editor, shape.id);
  const active = execution.status === "running";
  const [now, setNow] = useState(Date.now);
  const [showHelp, setShowHelp] = useState(false);
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
                      ? formatElapsed(elapsed, locale)
                      : t("canvas.node.running")
                    : execution.status === "cancelled"
                      ? t("workflow.status.cancelled")
                      : execution.status === "queued"
                        ? t("canvas.node.waiting")
                        : stale
                          ? t("canvas.node.needsUpdate")
                          : execution.status === "success"
                            ? elapsed !== undefined
                              ? formatElapsed(elapsed, locale)
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
        {config.helpContent && (
          <Tooltip open={showHelp} onOpenChange={setShowHelp}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("canvas.node.showHelp")}
                  onClick={() => setShowHelp((value) => !value)}
                >
                  <HelpCircle className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent className="max-w-xs whitespace-pre-line">
              {["speech", "file"].includes(shape.type)
                ? props.result || config.helpContent
                : config.helpContent}
            </TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={
            props.isLocked
              ? t("canvas.node.unlockStep")
              : t("canvas.node.lockStep")
          }
          title={
            props.isLocked
              ? t("canvas.node.unlockStep")
              : t("canvas.node.lockStep")
          }
          aria-pressed={!!props.isLocked}
          onClick={onToggleLock}
        >
          {props.isLocked ? (
            <Lock className="size-3.5" />
          ) : (
            <Unlock className="size-3.5" />
          )}
        </Button>
        {onRun && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={
              running ? t("canvas.node.stopRun") : t("canvas.node.runStep")
            }
            aria-label={
              running ? t("canvas.node.stopRun") : t("canvas.node.runStep")
            }
            onClick={onRun}
          >
            {running ? (
              <Square className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </Button>
        )}
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
