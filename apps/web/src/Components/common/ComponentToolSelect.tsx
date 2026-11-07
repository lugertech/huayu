import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export function ComponentToolSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; icon: LucideIcon }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const current =
    options.find((option) => option.value === value) || options[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="node-tool-select"
            disabled={disabled}
            title={label}
            aria-label={`${label}: ${current.label}`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Icon className="size-3" />
            <span>{current.label}</span>
            <ChevronDown className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-20">
        {options.map((option) => {
          const OptionIcon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              <OptionIcon className="size-3" />
              <span className="text-xs">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
