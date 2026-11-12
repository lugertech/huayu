import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ProjectTooltipProps = {
  children: ReactElement;
  label: string;
  side?: "top" | "bottom";
};

export function ProjectTooltip({ children, label, side }: ProjectTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
