import type { ComponentProps, ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function CanvasToolbarTooltip({
  label,
  children,
  onOpenChange,
  open,
}: {
  label: string;
  children: ReactElement;
  open?: boolean;
  onOpenChange?: ComponentProps<typeof Tooltip>["onOpenChange"];
}) {
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
