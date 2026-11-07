import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

export function ProjectViewTooltip({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
