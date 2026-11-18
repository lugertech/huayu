import { useTranslations } from "@/i18n";
import { HelpCircle, Lock, Play, Square, Unlock, X } from "lucide-react";
import { useState } from "react";
import { useEditor } from "@/features/canvas/editor";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { componentConfig } from "@/config/components";
import { useNodeBusy, type NodeData } from "@/workflow/execute";
import type { AIComponentShape } from "@/types/components";

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
  const config = componentConfig(shape.type, locale);
  const Icon = config.icon;
  const props = shape.props as NodeData;
  const [showHelp, setShowHelp] = useState(false);
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
              {shape.type === "speech"
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
