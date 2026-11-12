import type { ReactElement } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Copy } from "lucide-react";
import { t, useLocale } from "@/i18n";

export type ProjectCardMenuProps = {
  children: ReactElement;
  onDuplicate: () => void;
};

export function ProjectCardMenu({
  children,
  onDuplicate,
}: ProjectCardMenuProps) {
  useLocale();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={children} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50 outline-none">
          <ContextMenu.Popup className="project-card-menu min-w-40 bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <ContextMenu.Item
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none focus:bg-accent"
              aria-haspopup="dialog"
              onClick={onDuplicate}
            >
              <Copy className="size-4" />
              {t("projects.duplicateProject")}
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
