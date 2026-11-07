import { useCallback, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AssetGroupItem } from "./library-api";
import { useAssetTranslations } from "./messages";

export function flattenExpandedGroups(
  groups: AssetGroupItem[],
  expandedGroupIds: ReadonlySet<string>,
  level = 0,
): GroupTreeRow[] {
  const result: GroupTreeRow[] = [];

  for (const group of groups) {
    const hasChildren = Boolean(group.children.length);
    const isExpanded = expandedGroupIds.has(group.id);

    result.push({
      group,
      hasChildren,
      isExpanded,
      level,
    });

    if (hasChildren && isExpanded) {
      result.push(
        ...flattenExpandedGroups(group.children, expandedGroupIds, level + 1),
      );
    }
  }

  return result;
}

interface GroupTreeRow {
  group: AssetGroupItem;
  hasChildren: boolean;
  isExpanded: boolean;
  level: number;
}

function findGroupPathById(
  groups: AssetGroupItem[],
  groupId: string,
  path: AssetGroupItem[] = [],
): AssetGroupItem[] | null {
  for (const group of groups) {
    const nextPath = [...path, group];

    if (group.id === groupId) {
      return nextPath;
    }

    if (group.children.length) {
      const childPath = findGroupPathById(group.children, groupId, nextPath);

      if (childPath) {
        return childPath;
      }
    }
  }

  return null;
}

export function selectedGroupExpandedIds(
  selectedPath: AssetGroupItem[],
): string[] {
  return selectedPath
    .filter(
      (group, index) =>
        index < selectedPath.length - 1 || Boolean(group.children.length),
    )
    .map((group) => group.id);
}

export function AssetFolderFilter({
  groups,
  onSelectAll,
  onSelectGroup,
  selectedGroupId,
}: {
  groups: AssetGroupItem[];
  onSelectAll: () => void;
  onSelectGroup: (id: string) => void;
  selectedGroupId: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { at } = useAssetTranslations();
  const allLabel = at("全部分组");
  const selectedPath = useMemo(
    () =>
      selectedGroupId === null
        ? []
        : (findGroupPathById(groups, selectedGroupId) ?? []),
    [groups, selectedGroupId],
  );
  const selectedLabel = selectedPath[selectedPath.length - 1]?.name ?? allLabel;
  const rows = useMemo(
    () => flattenExpandedGroups(groups, expandedGroupIds),
    [expandedGroupIds, groups],
  );

  const handleMenuOpenChange = useCallback(
    (nextOpen: boolean) => {
      setMenuOpen(nextOpen);

      if (nextOpen) {
        setExpandedGroupIds(new Set(selectedGroupExpandedIds(selectedPath)));
      }
    },
    [selectedPath],
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    onSelectAll();
    setMenuOpen(false);
  }, [onSelectAll]);

  const handleSelectGroupRow = useCallback(
    (row: GroupTreeRow) => {
      onSelectGroup(row.group.id);

      if (row.hasChildren) {
        toggleGroup(row.group.id);
        return;
      }

      setMenuOpen(false);
    },
    [onSelectGroup, toggleGroup],
  );

  return (
    <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="max-w-[126px] text-muted-foreground shadow-none"
            aria-label={at("素材分组筛选器")}
          />
        }
      >
        <Filter />
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-72 border-border bg-popover p-1 shadow-lg outline-none"
        aria-label={at("素材分组树筛选器")}
      >
        <button
          type="button"
          onClick={handleSelectAll}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
            "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
            selectedGroupId === null
              ? "bg-accent font-medium text-accent-foreground"
              : "text-popover-foreground",
          )}
        >
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{allLabel}</span>
          {selectedGroupId === null ? (
            <Check className="size-3.5 shrink-0" />
          ) : null}
        </button>

        <div className="mt-1 space-y-0.5">
          {rows.map((row) => {
            const selected = selectedGroupId === row.group.id;

            return (
              <div
                key={row.group.id}
                className={cn(
                  "flex items-center rounded-sm text-sm transition-colors",
                  selected
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                style={{ paddingLeft: `${4 + row.level * 14}px` }}
              >
                <button
                  type="button"
                  aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                  aria-label={
                    row.hasChildren
                      ? `${row.isExpanded ? at("收起") : at("展开")}${row.group.name}`
                      : undefined
                  }
                  className={cn(
                    "flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors",
                    row.hasChildren
                      ? "cursor-pointer hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                      : "cursor-default text-transparent",
                  )}
                  disabled={!row.hasChildren}
                  tabIndex={row.hasChildren ? 0 : -1}
                  onClick={() => {
                    if (row.hasChildren) {
                      toggleGroup(row.group.id);
                    }
                  }}
                >
                  {row.hasChildren ? (
                    row.isExpanded ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )
                  ) : (
                    <span className="h-3.5 w-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                  onClick={() => handleSelectGroupRow(row)}
                  className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {row.group.name}
                  </span>
                  {row.group.asset_count > 0 ? (
                    <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                      {row.group.asset_count}
                    </span>
                  ) : null}
                  {selected ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {at("暂无分类")}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
