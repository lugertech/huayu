import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

export type SidebarTooltipProps = {
  label: ReactNode;
  disabled: boolean;
  children: ReactElement;
  side?: "right" | "bottom";
};

export function SidebarTooltip({
  label,
  disabled,
  children,
  side = "right",
}: SidebarTooltipProps) {
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger render={children} />
      <TooltipContent
        side={side}
        sideOffset={side === "bottom" ? 8 : 10}
        className={side === "bottom" ? "sidebar-search-tooltip" : undefined}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
