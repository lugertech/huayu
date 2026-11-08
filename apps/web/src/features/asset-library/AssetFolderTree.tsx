import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "@/i18n";
import type { AssetGroupItem } from "./library-api";
import { useAssetTranslations } from "./messages";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import folderIcon from "./folder.svg";

interface AssetFolderTreeProps {
  groups: AssetGroupItem[];
  loading: boolean;
  selectedGroupId: string | null;
  selectedRootGroupId: string | null;
  contextGroupId: string | null;
  contextAllFocused: boolean;
  dropTargetGroupId: string | null;
  dropTargetAll: boolean;
  onSelectAll: () => void;
  onSelectGroup: (groupId: string) => void;
  onGroupContextMenu?: (
    event: ReactMouseEvent | ReactKeyboardEvent,
    group: AssetGroupItem,
  ) => void;
  onAllContextMenu?: (event: ReactMouseEvent | ReactKeyboardEvent) => void;
  onGroupDragOver?: (event: ReactDragEvent, group: AssetGroupItem) => void;
  onGroupDrop?: (event: ReactDragEvent, group: AssetGroupItem) => void;
  onAllDragOver?: (event: ReactDragEvent) => void;
  onAllDrop?: (event: ReactDragEvent) => void;
}

interface TreeChildrenProps {
  groups: AssetGroupItem[];
  level: number;
  selectedGroupId: string | null;
  selectedRootGroupId: string | null;
  contextGroupId: string | null;
  dropTargetGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onGroupContextMenu?: (
    event: ReactMouseEvent | ReactKeyboardEvent,
    group: AssetGroupItem,
  ) => void;
  onGroupDragOver?: (event: ReactDragEvent, group: AssetGroupItem) => void;
  onGroupDrop?: (event: ReactDragEvent, group: AssetGroupItem) => void;
}

function FolderTreeRow({
  group,
  isSelected,
  isBranchActive,
  isContextFocused,
  isDropTarget,
  onSelect,
  onContextMenu,
  onDragOver,
  onDrop,
}: {
  group: AssetGroupItem;
  isSelected: boolean;
  isBranchActive: boolean;
  isContextFocused: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onContextMenu?: (
    event: ReactMouseEvent | ReactKeyboardEvent,
    group: AssetGroupItem,
  ) => void;
  onDragOver?: (event: ReactDragEvent, group: AssetGroupItem) => void;
  onDrop?: (event: ReactDragEvent, group: AssetGroupItem) => void;
}) {
  const { t } = useTranslations();
  return (
    <div
      className="group relative z-10"
      data-asset-drop-target
      onContextMenu={(event) => onContextMenu?.(event, group)}
      onKeyDown={(event) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        )
          onContextMenu?.(event, group);
      }}
      onDragEnter={(event) => onDragOver?.(event, group)}
      onDragOver={(event) => onDragOver?.(event, group)}
      onDrop={(event) => onDrop?.(event, group)}
    >
      <button
        type="button"
        onClick={(event) => {
          if (event.ctrlKey) {
            return;
          }

          onSelect();
        }}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border px-2 pr-8 text-left transition-colors",
          isDropTarget
            ? "border-[var(--ring)] bg-[var(--accent)] ring-1 ring-[var(--ring)]"
            : isContextFocused
              ? "border-[var(--ring)] bg-[var(--accent)] ring-1 ring-[var(--ring)]"
              : isSelected
                ? "border-border bg-muted"
                : isBranchActive
                  ? "border-border bg-muted"
                  : "border-transparent hover:bg-muted",
        )}
        title={group.name}
      >
        <img src={folderIcon} alt="" aria-hidden className="h-4 w-4 shrink-0" />
        <span
          className={cn(
            "truncate text-sm text-foreground",
            group.parent_id === null ? "font-medium" : "font-normal",
          )}
        >
          {group.name}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="asset-folder-more absolute top-1.5 right-1 text-muted-foreground"
        aria-label={t("assets.folderActions", { name: group.name })}
        onClick={(event) => {
          event.stopPropagation();
          onContextMenu?.(event, group);
        }}
      >
        <MoreHorizontal />
      </Button>
    </div>
  );
}

function TreeChildren({
  groups,
  level,
  selectedGroupId,
  selectedRootGroupId,
  contextGroupId,
  dropTargetGroupId,
  onSelectGroup,
  onGroupContextMenu,
  onGroupDragOver,
  onGroupDrop,
}: TreeChildrenProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 space-y-1 pl-5">
      {groups.map((group, index) => {
        const isLast = index === groups.length - 1;
        const isSelected = selectedGroupId === group.id;
        const isBranchActive =
          level === 0 && !isSelected && selectedRootGroupId === group.id;
        const isContextFocused = contextGroupId === group.id;
        const isDropTarget = dropTargetGroupId === group.id;

        return (
          <div key={group.id} className="relative isolate">
            {!isLast && (
              <span className="pointer-events-none absolute left-[-2px] top-[-4px] -bottom-1 z-0 border-l border-border" />
            )}
            <div className="grid grid-cols-[18px_minmax(0,1fr)] items-stretch">
              <div className="relative z-0">
                {isLast && (
                  <span className="pointer-events-none absolute left-[-2px] top-[-6px] z-0 h-5 border-l border-border" />
                )}
                <span className="pointer-events-none absolute left-[-2px] top-[21px] z-0 h-3 w-5 -translate-y-full rounded-bl-[8px] border-b border-l border-border" />
              </div>
              <FolderTreeRow
                group={group}
                isSelected={isSelected}
                isBranchActive={isBranchActive}
                isContextFocused={isContextFocused}
                isDropTarget={isDropTarget}
                onContextMenu={onGroupContextMenu}
                onDragOver={onGroupDragOver}
                onDrop={onGroupDrop}
                onSelect={() => onSelectGroup(group.id)}
              />
            </div>

            {group.children.length > 0 && (
              <div className="ml-6">
                <TreeChildren
                  groups={group.children}
                  level={level + 1}
                  selectedGroupId={selectedGroupId}
                  selectedRootGroupId={selectedRootGroupId}
                  contextGroupId={contextGroupId}
                  dropTargetGroupId={dropTargetGroupId}
                  onSelectGroup={onSelectGroup}
                  onGroupContextMenu={onGroupContextMenu}
                  onGroupDragOver={onGroupDragOver}
                  onGroupDrop={onGroupDrop}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AssetFolderTree({
  groups,
  loading,
  selectedGroupId,
  selectedRootGroupId,
  contextGroupId,
  contextAllFocused,
  dropTargetGroupId,
  dropTargetAll,
  onSelectAll,
  onSelectGroup,
  onGroupContextMenu,
  onAllContextMenu,
  onGroupDragOver,
  onGroupDrop,
  onAllDragOver,
  onAllDrop,
}: AssetFolderTreeProps) {
  const { at } = useAssetTranslations();
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onSelectAll}
        data-asset-drop-target
        onContextMenu={(event) => onAllContextMenu?.(event)}
        onKeyDown={(event) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          )
            onAllContextMenu?.(event);
        }}
        onDragEnter={(event) => onAllDragOver?.(event)}
        onDragOver={(event) => onAllDragOver?.(event)}
        onDrop={(event) => onAllDrop?.(event)}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border px-2 text-left transition-colors",
          "relative z-10",
          dropTargetAll
            ? "border-[var(--ring)] bg-[var(--accent)] ring-1 ring-[var(--ring)]"
            : contextAllFocused
              ? "border-[var(--ring)] bg-[var(--accent)] ring-1 ring-[var(--ring)]"
              : selectedGroupId === null
                ? "border-border bg-muted"
                : "border-transparent hover:bg-muted",
        )}
      >
        <img src={folderIcon} alt="" aria-hidden className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm font-medium text-foreground">
          {at("素材")}
        </span>
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-transparent" />
        </div>
      ) : groups.length === 0 ? (
        <div className="px-2 py-3 text-xs text-muted-foreground">
          {at("暂无子文件夹")}
        </div>
      ) : (
        <TreeChildren
          groups={groups}
          level={0}
          selectedGroupId={selectedGroupId}
          selectedRootGroupId={selectedRootGroupId}
          contextGroupId={contextGroupId}
          dropTargetGroupId={dropTargetGroupId}
          onSelectGroup={onSelectGroup}
          onGroupContextMenu={onGroupContextMenu}
          onGroupDragOver={onGroupDragOver}
          onGroupDrop={onGroupDrop}
        />
      )}
    </div>
  );
}
