import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Viewer from "viewerjs";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAssetTranslations } from "./messages";
import { assetUrl, ASSET_DRAG_TYPE, assetMasonryColumns } from "./assets";
import { downloadBlob } from "@/api/client";
import { blobForSource } from "@/api/backend";
import "./assets.css";
import { AssetFolderFilter } from "./AssetFolderFilter";
import {
  Check,
  ChevronRight,
  Eye,
  FileText,
  FolderInput,
  FolderOpen,
  ImageOff,
  Images,
  Loader2,
  RefreshCcw,
  Search,
  Upload,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  SquarePlus,
  Trash2,
  Undo2,
  Shapes,
  ArrowDownUp,
  Download,
  X,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  ASSET_PAGE_SIZE_MAX,
  createAssetGroup,
  deleteAsset,
  deleteAssetGroup,
  getAssetGroups,
  getAssets,
  updateAsset,
  updateAssetGroup,
  uploadAsset,
  type AssetGroupItem,
  type AssetItem,
} from "./library-api";
import { useToast } from "@/components/common/ToastProvider";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetFolderTree } from "./AssetFolderTree";
import folderIcon from "./folder.svg";
import "viewerjs/dist/viewer.css";

const LIST_PAGE_SIZE = ASSET_PAGE_SIZE_MAX;
const ASSET_VIEWER_IMAGE_CLASS = "asset-viewer-image";
const DRAG_ASSET_ID_MIME = ASSET_DRAG_TYPE;

interface AssetBrowserProps {
  picker?: boolean;
  onInsert?: (asset: AssetItem) => void | Promise<void>;
  onClose?: () => void;
  onShapeLibrary?: () => void;
  navigation?: ReactNode;
  selectionOnly?: boolean;
  insertLabel?: string;
}

interface FlatGroupOption {
  id: string;
  name: string;
  depth: number;
}

interface UploadDialogItem {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string | null;
  status: "pending" | "uploading" | "done" | "error";
  message: string;
}

type ContextMenuTarget =
  | { type: "asset"; assetId: string }
  | { type: "group"; groupId: string }
  | { type: "canvas"; groupId: string | null };

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
}

type DialogState =
  | {
      type: "create-group";
      parentId: string | null;
      parentName: string;
      value: string;
    }
  | { type: "rename-group"; group: AssetGroupItem; value: string }
  | { type: "rename-asset"; asset: AssetItem; value: string }
  | { type: "move-asset"; asset: AssetItem; targetGroupId: string | null }
  | { type: "delete-group"; group: AssetGroupItem }
  | { type: "delete-asset"; asset: AssetItem };

type DragMoveTarget =
  | { type: "group"; groupId: string; area: "tree" | "grid" }
  | { type: "root"; area: "tree" | "grid" };

interface DragPreviewState {
  name: string;
  thumbnailUrl: string | null;
  metaText: string;
  cardWidth: number;
  cardHeight: number;
  imageHeight: number;
  listRow: boolean;
}

function mergeAssetPages(
  current: AssetItem[],
  incoming: AssetItem[],
): AssetItem[] {
  const assetsById = new Map(current.map((asset) => [asset.id, asset]));

  for (const asset of incoming) {
    assetsById.set(asset.id, asset);
  }

  return Array.from(assetsById.values());
}

function resolveAssetImageUrl(asset: AssetItem): string {
  return asset.mime.startsWith("image/") ? assetUrl(asset) : "";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const decimals = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function hasFileTransferTypes(
  dataTransfer: DataTransfer | null | undefined,
): boolean {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(dataTransfer.types).includes("Files");
}

function createTransparentDragImageElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.style.position = "fixed";
  element.style.top = "-9999px";
  element.style.left = "-9999px";
  element.style.width = "1px";
  element.style.height = "1px";
  element.style.opacity = "0";
  element.style.pointerEvents = "none";
  document.body.appendChild(element);
  return element;
}

function findGroupById(
  groups: AssetGroupItem[],
  id: string | null,
): AssetGroupItem | null {
  if (id === null) {
    return null;
  }

  for (const group of groups) {
    if (group.id === id) {
      return group;
    }

    const childMatch = findGroupById(group.children, id);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function flattenPersonalGroups(
  groups: AssetGroupItem[],
  depth = 0,
): FlatGroupOption[] {
  return groups.flatMap((group) => [
    { id: group.id, name: group.name, depth },
    ...flattenPersonalGroups(group.children, depth + 1),
  ]);
}

function getGroupPath(
  groups: AssetGroupItem[],
  selectedGroupId: string | null,
): AssetGroupItem[] {
  const current = findGroupById(groups, selectedGroupId);
  if (!current) {
    return [];
  }

  const path: AssetGroupItem[] = [current];
  let parent = current.parent_id
    ? findGroupById(groups, current.parent_id)
    : null;
  while (parent) {
    path.unshift(parent);
    parent = parent.parent_id ? findGroupById(groups, parent.parent_id) : null;
  }
  return path;
}

function getSelectedRootGroup(
  groups: AssetGroupItem[],
  selectedGroupId: string | null,
): AssetGroupItem | null {
  return getGroupPath(groups, selectedGroupId)[0] || null;
}

function AssetSkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4">
      {Array.from({ length: 16 }).map((_, index) => (
        <div
          key={`asset-skeleton-${index}`}
          className="overflow-hidden rounded-lg border border-border bg-background"
        >
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssetBrowser({
  picker = false,
  onInsert,
  onClose,
  onShapeLibrary,
  navigation,
  selectionOnly = false,
  insertLabel,
}: AssetBrowserProps) {
  const { locale, t, at } = useAssetTranslations();
  const loadErrorText = useRef(at);
  useEffect(() => {
    // Language changes should not reload the asset list or reset pagination.
    loadErrorText.current = at;
  }, [at]);
  const { showToast } = useToast();
  const addToast = useCallback(
    ({
      type,
      message,
    }: {
      type: "error" | "success" | "info";
      message: string;
    }) =>
      showToast({
        title: message,
        variant: type === "error" ? "destructive" : "default",
      }),
    [showToast],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const assetGridRef = useRef<HTMLDivElement>(null);
  const assetViewerRef = useRef<Viewer | null>(null);
  const latestAssetsRequestRef = useRef(0);
  const assetsRequestRef = useRef<AbortController | null>(null);
  const groupsRequestRef = useRef<AbortController | null>(null);
  const dragPreviewElementRef = useRef<HTMLDivElement>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const dragSourceRef = useRef<HTMLButtonElement | null>(null);
  const dragReturnAnimationRef = useRef<Animation | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragPreviewAreaRef = useRef<"grid" | "tree" | null>(null);
  const dragSidebarRectRef = useRef<DOMRect | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [assetsPage, setAssetsPage] = useState(1);
  const [assetsLastPage, setAssetsLastPage] = useState(1);
  const [assetsTotal, setAssetsTotal] = useState(0);
  const [groups, setGroups] = useState<AssetGroupItem[]>([]);
  const [trash, setTrash] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [view, setView] = useState<"grid" | "list">(() =>
    localStorage.getItem("huayu:assets-view") === "list" ? "list" : "grid",
  );
  const [inserting, setInserting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const [assetsPhase, setAssetsPhase] = useState<
    "loading" | "appending" | "ready" | "error"
  >("loading");
  const assetsLoading = assetsPhase === "loading";
  const assetsLoadingMore = assetsPhase === "appending";
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<
    "staging" | "uploading" | "confirm-close"
  >("staging");
  const uploadPhaseRef = useRef(uploadPhase);
  function changeUploadPhase(phase: typeof uploadPhase) {
    uploadPhaseRef.current = phase;
    setUploadPhase(phase);
  }
  const uploading = uploadPhase === "uploading";
  const uploadCloseConfirm = uploadPhase === "confirm-close";
  function setUploadCloseConfirm(open: boolean) {
    if (uploadPhaseRef.current !== "uploading")
      changeUploadPhase(open ? "confirm-close" : "staging");
  }
  const [dragActive, setDragActive] = useState(false);
  const [uploadDialogItems, setUploadDialogItems] = useState<
    UploadDialogItem[]
  >([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [dialogRequest, setDialogRequest] = useState<
    { phase: "editing" | "submitting" } | { phase: "error"; message: string }
  >({ phase: "editing" });
  const dialogSubmitting = dialogRequest.phase === "submitting";
  const dialogError =
    dialogRequest.phase === "error" ? dialogRequest.message : null;
  function setDialogError(message: string | null) {
    setDialogRequest(
      message ? { phase: "error", message } : { phase: "editing" },
    );
  }
  const [loadedAssetsKey, setLoadedAssetsKey] = useState("");

  const [previewFile, setPreviewFile] = useState<AssetItem | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetDrag, setAssetDrag] = useState<
    | { phase: "idle" }
    | { phase: "dragging" | "returning" | "submitting"; assetId: string }
  >({ phase: "idle" });
  const draggingAssetId = assetDrag.phase === "idle" ? null : assetDrag.assetId;
  const dragMoveSubmitting = assetDrag.phase === "submitting";
  const [dragMoveTarget, setDragMoveTarget] = useState<DragMoveTarget | null>(
    null,
  );
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [dragPreviewArea, setDragPreviewArea] = useState<
    "grid" | "tree" | null
  >(null);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  const cancelDragPreviewFrame = (): void => {
    if (dragPreviewFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(dragPreviewFrameRef.current);
    dragPreviewFrameRef.current = null;
  };

  const scheduleDragPreviewPosition = (
    clientX: number,
    clientY: number,
  ): void => {
    if (dragReturnAnimationRef.current || (clientX === 0 && clientY === 0)) {
      return;
    }

    dragPointerRef.current = { x: clientX, y: clientY };

    if (dragPreviewFrameRef.current !== null) {
      return;
    }

    dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewFrameRef.current = null;

      const pointer = dragPointerRef.current;
      const previewElement = dragPreviewElementRef.current;

      if (!pointer || !previewElement) {
        return;
      }

      const sidebarRect = dragSidebarRectRef.current;
      const nextArea =
        sidebarRect &&
        pointer.x >= sidebarRect.left &&
        pointer.x <= sidebarRect.right &&
        pointer.y >= sidebarRect.top &&
        pointer.y <= sidebarRect.bottom
          ? "tree"
          : "grid";

      if (dragPreviewAreaRef.current !== nextArea) {
        dragPreviewAreaRef.current = nextArea;
        setDragPreviewArea(nextArea);
      }

      const pointerOffset = dragPointerOffsetRef.current;
      const offsetX = nextArea === "tree" ? 24 : (pointerOffset?.x ?? 14);
      const offsetY = nextArea === "tree" ? 24 : (pointerOffset?.y ?? 14);

      previewElement.style.transform = `translate3d(${pointer.x - offsetX}px, ${pointer.y - offsetY}px, 0)`;
    });
  };

  const pathGroups = useMemo(
    () => getGroupPath(groups, selectedGroupId),
    [groups, selectedGroupId],
  );
  const selectedRootGroup = useMemo(
    () => getSelectedRootGroup(groups, selectedGroupId),
    [groups, selectedGroupId],
  );
  const visibleFolderCards = useMemo(() => {
    if (keyword || picker || trash) {
      return [];
    }

    if (selectedGroupId === null) {
      return groups;
    }

    const current = findGroupById(groups, selectedGroupId);
    if (!current) {
      return [];
    }

    return current.children;
  }, [groups, keyword, selectedGroupId, picker, trash]);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );
  const listItems = useMemo(() => {
    const folders = keyword
      ? []
      : visibleFolderCards.map((group) => ({
          type: "group" as const,
          key: `group-${group.id}`,
          group,
        }));
    const files = assets.map((asset) => ({
      type: "asset" as const,
      key: `asset-${asset.id}`,
      asset,
    }));

    return [...folders, ...files];
  }, [assets, keyword, visibleFolderCards]);
  const listSummaryText = (() => {
    if (picker)
      return t(
        assetsTotal > assets.length
          ? "assets.loadedFileCount"
          : "assets.fileCount",
        { count: assetsTotal, loaded: assets.length },
      );
    if (assetsTotal > assets.length) {
      return at("{arg0} 个文件夹 · 已加载 {arg1}/{arg2} 个文件", {
        arg0: visibleFolderCards.length,
        arg1: assets.length,
        arg2: assetsTotal,
      });
    }

    return at("{arg0} 个文件夹 · {arg1} 个文件", {
      arg0: visibleFolderCards.length,
      arg1: assets.length,
    });
  })();
  const personalGroupOptions = useMemo(
    () => flattenPersonalGroups(groups),
    [groups],
  );
  const uploadDialogOpen = uploadDialogItems.length > 0;
  const uploadDialogPendingCount = useMemo(
    () => uploadDialogItems.filter((item) => item.status === "pending").length,
    [uploadDialogItems],
  );
  const uploadDialogAllFinished = useMemo(
    () =>
      uploadDialogItems.length > 0 &&
      uploadDialogItems.every(
        (item) => item.status === "done" || item.status === "error",
      ),
    [uploadDialogItems],
  );

  const canUpload = !trash;
  const canCreateFolder = !trash;
  const uploadTargetGroupId = selectedGroupId;
  const activeAssetsKey = `${selectedGroupId ?? "root"}|${keyword}|${sort}|${trash}`;
  const hasMoreAssets = assetsPage < assetsLastPage;

  const loadAssets = useCallback(
    async (nextPage = 1, append = false): Promise<void> => {
      if (append && assetsRequestRef.current) return;
      assetsRequestRef.current?.abort();
      const controller = new AbortController();
      assetsRequestRef.current = controller;
      const requestId = latestAssetsRequestRef.current + 1;
      latestAssetsRequestRef.current = requestId;
      const requestAssetsKey = activeAssetsKey;

      setAssetsPhase(append ? "appending" : "loading");
      if (!append) galleryScrollRef.current?.scrollTo({ top: 0 });

      try {
        const res = await getAssets({
          folder_id: selectedGroupId,
          unfiled: !picker && selectedGroupId === null && !keyword,
          sort,
          trash,
          keyword,
          page: nextPage,
          per_page: LIST_PAGE_SIZE,
          signal: controller.signal,
        });

        if (
          controller.signal.aborted ||
          requestId !== latestAssetsRequestRef.current
        ) {
          return;
        }

        setAssetsPhase("ready");
        setAssets((current) =>
          append ? mergeAssetPages(current, res.assets) : res.assets,
        );
        setAssetsPage(res.pagination.current_page);
        setAssetsLastPage(res.pagination.last_page);
        setAssetsTotal(res.pagination.total);
        setLoadedAssetsKey(requestAssetsKey);
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== latestAssetsRequestRef.current
        ) {
          return;
        }

        setAssetsPhase("error");
        console.error(loadErrorText.current("获取素材列表失败:"), error);
        addToast({
          type: "error",
          message: loadErrorText.current("获取素材列表失败"),
        });
        if (!append) {
          setAssets([]);
          setAssetsPage(1);
          setAssetsLastPage(1);
          setAssetsTotal(0);
          setLoadedAssetsKey(requestAssetsKey);
        }
      } finally {
        if (
          requestId === latestAssetsRequestRef.current &&
          assetsRequestRef.current === controller
        ) {
          assetsRequestRef.current = null;
        }
      }
    },
    [activeAssetsKey, selectedGroupId, picker, sort, trash, keyword, addToast],
  );

  const loadGroups = useCallback(async (): Promise<void> => {
    groupsRequestRef.current?.abort();
    const controller = new AbortController();
    groupsRequestRef.current = controller;
    setGroupsLoading(true);
    try {
      const res = await getAssetGroups(controller.signal);
      if (controller.signal.aborted || groupsRequestRef.current !== controller)
        return;
      setGroups(res.groups || []);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      console.error(loadErrorText.current("获取素材分组失败:"), error);
      addToast({
        type: "error",
        message: loadErrorText.current("获取素材分组失败"),
      });
    } finally {
      if (groupsRequestRef.current === controller) {
        groupsRequestRef.current = null;
        setGroupsLoading(false);
      }
    }
  }, [addToast]);

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([loadGroups(), loadAssets()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(
    () => () => {
      const groupsRequest = groupsRequestRef.current;
      const assetsRequest = assetsRequestRef.current;
      groupsRequestRef.current = null;
      assetsRequestRef.current = null;
      groupsRequest?.abort();
      assetsRequest?.abort();
    },
    [],
  );

  useEffect(() => {
    if (selectedGroupId === null) {
      return;
    }

    if (!groupsLoading && !findGroupById(groups, selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId, groupsLoading]);

  useEffect(() => {
    if (!selectedAssetId) {
      return;
    }

    if (!assets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null);
    }
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleClose = (): void => {
      setContextMenu(null);
    };

    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setContextMenu(null);
        menuTriggerRef.current?.focus();
      }
    };

    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
    window.addEventListener("click", handleClose);
    window.addEventListener("resize", handleClose);
    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!draggingAssetId) {
      return;
    }

    const handleWindowDragOver = (event: DragEvent): void => {
      scheduleDragPreviewPosition(event.clientX, event.clientY);
    };

    // Drop targets stop bubbling to avoid handling a move twice. Track the
    // pointer before those handlers so the preview follows the final position.
    window.addEventListener("dragover", handleWindowDragOver, true);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver, true);
      cancelDragPreviewFrame();
      dragReturnAnimationRef.current?.cancel();
      dragReturnAnimationRef.current = null;
    };
  }, [draggingAssetId]);

  useEffect(() => {
    if (dialogState) {
      setContextMenu(null);
      setDialogError(null);
    }
  }, [dialogState]);

  useEffect(() => {
    const gridElement = assetGridRef.current;
    if (!gridElement) {
      return;
    }

    const viewer = new Viewer(gridElement, {
      filter(image: HTMLImageElement): boolean {
        return image.classList.contains(ASSET_VIEWER_IMAGE_CLASS);
      },
      url(image: HTMLImageElement): string {
        return image.dataset.viewerSrc || image.currentSrc || image.src;
      },
      navbar: true,
      keyboard: true,
      zIndex: 1600,
      viewed() {
        const labels: Record<string, string> = {
          "zoom-in": at("放大"),
          "zoom-out": at("缩小"),
          "one-to-one": at("原始尺寸"),
          reset: at("重置"),
          prev: at("上一张"),
          next: at("下一张"),
          "rotate-left": at("向左旋转"),
          "rotate-right": at("向右旋转"),
          close: at("关闭预览"),
        };
        for (const [action, label] of Object.entries(labels)) {
          const button = document.querySelector<HTMLElement>(
            `.viewer-container .viewer-${action}`,
          );
          button?.setAttribute("aria-label", label);
          button?.setAttribute("title", label);
        }
      },
      toolbar: {
        prev: true,
        next: true,
        oneToOne: true,
        zoomIn: true,
        zoomOut: true,
        reset: true,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: false,
        flipVertical: false,
        play: false,
      },
      title: true,
    });

    assetViewerRef.current = viewer;

    return () => {
      viewer.destroy();
      assetViewerRef.current = null;
    };
  }, [at]);

  useEffect(() => {
    assetViewerRef.current?.update();
  }, [listItems]);

  useEffect(() => {
    if (
      !hasMoreAssets ||
      assetsLoading ||
      assetsLoadingMore ||
      !sentinel.current
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          void loadAssets(assetsPage + 1, true);
      },
      { root: galleryScrollRef.current, rootMargin: "160px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMoreAssets, assetsLoading, assetsLoadingMore, assetsPage, loadAssets]);

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const nextKeyword = searchInput.trim();
    if (nextKeyword === keyword) {
      return;
    }

    setKeyword(nextKeyword);
  };

  const handleClearSearch = (): void => {
    setSearchInput("");
    if (!keyword) {
      return;
    }
    setKeyword("");
  };

  const tryCloseUploadDialog = (): void => {
    if (uploading) {
      return;
    }

    const hasPending = uploadDialogItems.some(
      (item) => item.status === "pending",
    );
    if (hasPending) {
      setUploadCloseConfirm(true);
      return;
    }

    setUploadDialogItems((prev) => {
      for (const item of prev) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }

      return [];
    });
  };

  const confirmCloseUploadDialog = (): void => {
    setUploadCloseConfirm(false);
    setUploadDialogItems((prev) => {
      for (const item of prev) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }

      return [];
    });
  };

  const removeUploadDialogItem = (itemId: string): void => {
    setUploadDialogItems((prev) => {
      const target = prev.find((i) => i.id === itemId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return prev.filter((i) => i.id !== itemId);
    });
  };

  const openUploadDialog = (files: File[]): void => {
    if (!canUpload || files.length === 0) {
      return;
    }

    const createId = (): string =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newItems: UploadDialogItem[] = files.map((file) => ({
      id: createId(),
      file,
      name: file.name,
      size: file.size,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
      status: "pending" as const,
      message: at("等待上传"),
    }));

    setUploadDialogItems((prev) => [...prev, ...newItems]);
  };

  const startDialogUpload = async (): Promise<void> => {
    if (uploadPhaseRef.current !== "staging") return;
    const targetGroupId = uploadTargetGroupId;
    const pendingItems = uploadDialogItems.filter(
      (item) => item.status === "pending",
    );
    if (pendingItems.length === 0) {
      return;
    }

    changeUploadPhase("uploading");
    let successCount = 0;
    let failedCount = 0;

    for (const dialogItem of pendingItems) {
      const updateItem = (partial: Partial<UploadDialogItem>): void => {
        setUploadDialogItems((prev) =>
          prev.map((item) =>
            item.id === dialogItem.id ? { ...item, ...partial } : item,
          ),
        );
      };

      try {
        updateItem({ status: "uploading", message: at("上传中...") });

        await uploadAsset({
          file: dialogItem.file,
          name: dialogItem.file.name.replace(/\.[^.]+$/, ""),
          folder_id: targetGroupId,
        });
        successCount += 1;
        updateItem({ status: "done", message: at("已完成") });
      } catch (error) {
        console.error(at("上传素材失败:"), error);
        failedCount += 1;
        updateItem({ status: "error", message: at("上传失败") });
      }
    }

    changeUploadPhase("staging");

    if (successCount > 0) {
      addToast({
        type: "success",
        message: at("上传成功 {arg0} 个素材", { arg0: successCount }),
      });
      await Promise.all([loadGroups(), loadAssets()]);
    }

    if (failedCount > 0) {
      addToast({
        type: "error",
        message: at("上传失败 {arg0} 个素材", { arg0: failedCount }),
      });
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      openUploadDialog(files);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getCreateFolderAvailability = (
    parentId: string | null,
  ): { allowed: boolean; message: string } => {
    if (!canCreateFolder) {
      return { allowed: false, message: at("当前来源不支持新建文件夹") };
    }

    if (parentId === null) {
      return { allowed: true, message: "" };
    }

    const parentGroup = findGroupById(groups, parentId);
    if (!parentGroup) {
      return { allowed: false, message: at("目标文件夹不存在") };
    }

    return { allowed: true, message: "" };
  };

  const handleCreateFolder = (
    parentId: string | null = selectedGroupId,
  ): void => {
    const availability = getCreateFolderAvailability(parentId);
    if (!availability.allowed) {
      addToast({ type: "info", message: availability.message });
      return;
    }

    const parentGroup = findGroupById(groups, parentId);

    setDialogState({
      type: "create-group",
      parentId,
      parentName: parentGroup?.name ?? at("素材"),
      value: at("新建文件夹"),
    });
  };

  const submitCreateGroup = async (
    parentId: string | null,
    name: string,
  ): Promise<void> => {
    try {
      await createAssetGroup({ name, parent_id: parentId });
      addToast({ type: "success", message: at("文件夹创建成功") });
      await Promise.all([loadGroups(), loadAssets()]);
    } catch (error) {
      console.error(at("创建文件夹失败:"), error);
      addToast({ type: "error", message: at("创建文件夹失败") });
      throw error;
    }
  };

  const handleRenameGroup = (group: AssetGroupItem): void => {
    setDialogState({ type: "rename-group", group, value: group.name });
  };

  const submitRenameGroup = async (
    group: AssetGroupItem,
    name: string,
  ): Promise<void> => {
    try {
      await updateAssetGroup(group.id, { name });
      addToast({ type: "success", message: at("文件夹名称已更新") });
      await Promise.all([loadGroups(), loadAssets()]);
    } catch (error) {
      console.error(at("更新文件夹失败:"), error);
      addToast({ type: "error", message: at("更新文件夹失败") });
      throw error;
    }
  };

  const handleDeleteGroup = (group: AssetGroupItem): void => {
    setDialogState({ type: "delete-group", group });
  };

  const submitDeleteGroup = async (group: AssetGroupItem): Promise<void> => {
    try {
      await deleteAssetGroup(group.id);
      addToast({ type: "success", message: at("文件夹已删除") });

      if (selectedGroupId === group.id) {
        setSelectedGroupId(null);
        await Promise.all([loadGroups(), loadAssets()]);
      } else {
        await Promise.all([loadGroups(), loadAssets()]);
      }
    } catch (error) {
      console.error(at("删除文件夹失败:"), error);
      addToast({ type: "error", message: at("删除文件夹失败") });
      throw error;
    }
  };

  const handleRenameSelectedAsset = (
    targetAsset: AssetItem | null = selectedAsset,
  ): void => {
    if (!targetAsset) {
      return;
    }

    setDialogState({
      type: "rename-asset",
      asset: targetAsset,
      value: targetAsset.name,
    });
  };

  const submitRenameAsset = async (
    targetAsset: AssetItem,
    name: string,
  ): Promise<void> => {
    try {
      await updateAsset(targetAsset, { name });
      addToast({ type: "success", message: at("素材名称已更新") });
      await loadAssets();
    } catch (error) {
      console.error(at("重命名素材失败:"), error);
      addToast({ type: "error", message: at("重命名素材失败") });
      throw error;
    }
  };

  const handleMoveAsset = (
    targetAsset: AssetItem | null = selectedAsset,
  ): void => {
    if (!targetAsset) {
      return;
    }

    setDialogState({
      type: "move-asset",
      asset: targetAsset,
      targetGroupId: targetAsset.folder_id ?? null,
    });
  };

  const submitMoveAsset = async (
    targetAsset: AssetItem,
    nextGroupId: string | null,
  ): Promise<void> => {
    if (nextGroupId === (targetAsset.folder_id ?? null)) {
      addToast({ type: "info", message: at("素材位置未变更") });
      return;
    }

    try {
      await updateAsset(targetAsset, { folder_id: nextGroupId });
      addToast({ type: "success", message: at("素材已移动") });
      await Promise.all([loadGroups(), loadAssets()]);
    } catch (error) {
      console.error(at("移动素材失败:"), error);
      addToast({ type: "error", message: at("移动素材失败") });
      throw error;
    }
  };

  const handleDeleteSelectedAsset = (
    targetAsset: AssetItem | null = selectedAsset,
  ): void => {
    if (!targetAsset) {
      return;
    }

    setDialogState({ type: "delete-asset", asset: targetAsset });
  };

  const submitDeleteAsset = async (targetAsset: AssetItem): Promise<void> => {
    try {
      await deleteAsset(targetAsset);
      addToast({ type: "success", message: at("素材已删除") });
      if (selectedAssetId === targetAsset.id) {
        setSelectedAssetId(null);
      }
      await Promise.all([loadGroups(), loadAssets()]);
    } catch (error) {
      console.error(at("删除素材失败:"), error);
      addToast({ type: "error", message: at("删除素材失败") });
      throw error;
    }
  };

  const contextMenuTarget = contextMenu?.target;
  const contextMenuAssetId =
    contextMenuTarget?.type === "asset" ? contextMenuTarget.assetId : null;
  const contextMenuCanvasGroup =
    contextMenuTarget?.type === "canvas"
      ? findGroupById(groups, contextMenuTarget.groupId)
      : null;
  const contextMenuCreateParentId =
    contextMenu?.target.type === "group"
      ? contextMenu.target.groupId
      : contextMenu?.target.type === "canvas"
        ? contextMenu.target.groupId
        : null;
  const contextMenuCreateAvailability =
    contextMenu?.target.type === "group" ||
    contextMenu?.target.type === "canvas"
      ? getCreateFolderAvailability(contextMenuCreateParentId)
      : null;
  const contextMenuFocusedGroupId =
    contextMenu?.target.type === "group" ? contextMenu.target.groupId : null;
  const contextMenuFocusedAll =
    contextMenu?.target.type === "canvas" &&
    contextMenu.target.groupId === null;
  const dragMoveFocusedGroupId =
    dragMoveTarget?.type === "group" ? dragMoveTarget.groupId : null;
  const dragMoveFocusedAll = dragMoveTarget?.type === "root";
  const dragMoveFocusedArea = dragMoveTarget?.area ?? null;

  const openContextMenu = (
    event: ReactMouseEvent | ReactKeyboardEvent,
    target: ContextMenuTarget,
  ): void => {
    event.preventDefault();
    event.stopPropagation();

    if (target.type === "asset") setSelectedAssetId(target.assetId);
    const menuWidth = 192;
    const menuHeight =
      target.type === "asset" ? 280 : target.type === "group" ? 200 : 132;
    menuTriggerRef.current = event.currentTarget as HTMLElement;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

    setContextMenu({
      x: Math.max(
        8,
        Math.min(
          "clientX" in event
            ? event.clientX
            : event.currentTarget.getBoundingClientRect().left,
          maxX,
        ),
      ),
      y: Math.max(
        8,
        Math.min(
          "clientY" in event
            ? event.clientY
            : event.currentTarget.getBoundingClientRect().bottom,
          maxY,
        ),
      ),
      target,
    });
  };

  const handleGroupContextMenu = (
    event: ReactMouseEvent | ReactKeyboardEvent,
    group: AssetGroupItem,
  ): void => {
    openContextMenu(event, { type: "group", groupId: group.id });
  };

  const handleAllFoldersContextMenu = (
    event: ReactMouseEvent | ReactKeyboardEvent,
  ): void => {
    openContextMenu(event, { type: "canvas", groupId: null });
  };

  const handleAssetContextMenu = (
    event: ReactMouseEvent,
    asset: AssetItem,
  ): void => {
    setSelectedAssetId(asset.id);
    openContextMenu(event, { type: "asset", assetId: asset.id });
  };

  const handleCanvasContextMenu = (event: ReactMouseEvent): void => {
    openContextMenu(event, { type: "canvas", groupId: selectedGroupId });
  };

  const setDragMoveTargetState = (nextTarget: DragMoveTarget | null): void => {
    setDragMoveTarget((previousTarget) => {
      if (previousTarget === null && nextTarget === null) {
        return previousTarget;
      }

      if (previousTarget === null || nextTarget === null) {
        return nextTarget;
      }

      if (previousTarget.type !== nextTarget.type) {
        return nextTarget;
      }

      if (previousTarget.type === "group" && nextTarget.type === "group") {
        if (
          previousTarget.groupId === nextTarget.groupId &&
          previousTarget.area === nextTarget.area
        ) {
          return previousTarget;
        }

        return nextTarget;
      }

      if (previousTarget.type === "root" && nextTarget.type === "root") {
        return previousTarget.area === nextTarget.area
          ? previousTarget
          : nextTarget;
      }

      return nextTarget;
    });
  };

  const resolveDraggingAssetId = (
    dataTransfer: DataTransfer | null | undefined,
  ): string | null => {
    if (
      draggingAssetId &&
      assets.some((asset) => asset.id === draggingAssetId)
    ) {
      return draggingAssetId;
    }

    if (!dataTransfer) {
      return null;
    }

    const customAssetId = dataTransfer.getData(DRAG_ASSET_ID_MIME).trim();
    if (customAssetId && assets.some((asset) => asset.id === customAssetId)) {
      return customAssetId;
    }

    return null;
  };

  const getDragMoveAvailability = (
    assetId: string | null,
    targetGroupId: string | null,
  ): { allowed: boolean; asset: AssetItem | null } => {
    if (!assetId || trash) {
      return { allowed: false, asset: null };
    }

    const targetAsset = assets.find((asset) => asset.id === assetId) ?? null;
    if (!targetAsset) {
      return { allowed: false, asset: null };
    }

    if ((targetAsset.folder_id ?? null) === targetGroupId) {
      return { allowed: false, asset: targetAsset };
    }

    if (targetGroupId !== null) {
      const targetGroup = findGroupById(groups, targetGroupId);
      if (!targetGroup) {
        return { allowed: false, asset: targetAsset };
      }
    }

    return { allowed: true, asset: targetAsset };
  };

  const handleAssetDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    asset: AssetItem,
  ): void => {
    if (trash || dragMoveSubmitting) {
      event.preventDefault();
      return;
    }
    dragReturnAnimationRef.current?.cancel();
    dragReturnAnimationRef.current = null;
    dragSourceRef.current = event.currentTarget;
    setAssetDrag({ phase: "dragging", assetId: asset.id });
    setDragMoveTargetState(null);
    setContextMenu(null);
    setSelectedAssetId(asset.id);
    const assetResolution =
      asset.width > 0 && asset.height > 0
        ? `${asset.width} × ${asset.height}`
        : "";
    const cardRect = event.currentTarget.getBoundingClientRect();
    const listRow = !picker && view === "list";
    const previewWidth = listRow ? 280 : cardRect.width;
    const offsetX = Math.max(
      0,
      Math.min(event.clientX - cardRect.left, previewWidth),
    );
    const offsetY = Math.max(
      0,
      Math.min(event.clientY - cardRect.top, cardRect.height),
    );
    setDragPreview({
      name: asset.name,
      thumbnailUrl: resolveAssetImageUrl(asset),
      metaText: `${formatBytes(asset.size)}${assetResolution ? ` · ${assetResolution}` : ""}`,
      cardWidth: Math.round(previewWidth),
      cardHeight: Math.round(cardRect.height),
      imageHeight: Math.round(
        event.currentTarget
          .querySelector(".asset-card-image")!
          .getBoundingClientRect().height,
      ),
      listRow,
    });
    dragPointerOffsetRef.current = { x: offsetX, y: offsetY };
    dragSidebarRectRef.current =
      sidebarRef.current?.getBoundingClientRect() ?? null;
    dragPreviewAreaRef.current = "grid";
    setDragPreviewArea("grid");
    scheduleDragPreviewPosition(event.clientX, event.clientY);

    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.dropEffect = "move";
    event.dataTransfer.setData(DRAG_ASSET_ID_MIME, asset.id);
    const transparentImageElement = createTransparentDragImageElement();
    event.dataTransfer.setDragImage(transparentImageElement, 0, 0);
    window.setTimeout(() => {
      transparentImageElement.remove();
    }, 0);
  };

  const finishAssetDrag = (returnToSource = false): void => {
    if (dragReturnAnimationRef.current) return;
    cancelDragPreviewFrame();
    const clear = () => {
      setAssetDrag((current) =>
        current.phase === "submitting" ? current : { phase: "idle" },
      );
      setDragMoveTargetState(null);
      setDragPreview(null);
      setDragPreviewArea(null);
      dragSourceRef.current = null;
      dragPointerRef.current = null;
      dragPointerOffsetRef.current = null;
      dragPreviewAreaRef.current = null;
      dragSidebarRectRef.current = null;
    };
    const preview = dragPreviewElementRef.current;
    const source = dragSourceRef.current;
    if (
      returnToSource &&
      preview &&
      source &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const origin = source.getBoundingClientRect();
      setDragMoveTargetState(null);
      setDragPreviewArea("grid");
      setAssetDrag((current) =>
        current.phase === "dragging"
          ? { ...current, phase: "returning" }
          : current,
      );
      const animation = preview.animate(
        [
          { transform: preview.style.transform, opacity: 1 },
          {
            transform: `translate3d(${origin.left}px, ${origin.top}px, 0)`,
            opacity: 0.25,
          },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      dragReturnAnimationRef.current = animation;
      animation.onfinish = clear;
      return;
    }
    clear();
  };

  const handleAssetDragging = (
    event: ReactDragEvent<HTMLButtonElement>,
  ): void => {
    if (!draggingAssetId) {
      return;
    }

    scheduleDragPreviewPosition(event.clientX, event.clientY);
  };

  const handleDragOverMoveTarget = (
    event: ReactDragEvent,
    targetGroupId: string | null,
    area: "tree" | "grid",
  ): void => {
    if (hasFileTransferTypes(event.dataTransfer)) {
      if (!trash) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDragMoveTargetState(
          targetGroupId === null
            ? { type: "root", area }
            : { type: "group", groupId: targetGroupId, area },
        );
      }
      return;
    }

    const assetId = resolveDraggingAssetId(event.dataTransfer);
    const availability = getDragMoveAvailability(assetId, targetGroupId);
    if (!availability.allowed) {
      setDragMoveTargetState(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragMoveTargetState(
      targetGroupId === null
        ? { type: "root", area }
        : { type: "group", groupId: targetGroupId, area },
    );
  };

  const handleDropMoveTarget = async (
    event: ReactDragEvent,
    targetGroupId: string | null,
  ): Promise<void> => {
    if (hasFileTransferTypes(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      setDragMoveTargetState(null);
      setSelectedGroupId(targetGroupId);
      setTrash(false);
      openUploadDialog(Array.from(event.dataTransfer.files));
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (dragMoveSubmitting) {
      return;
    }

    const assetId = resolveDraggingAssetId(event.dataTransfer);
    const availability = getDragMoveAvailability(assetId, targetGroupId);
    setDragMoveTargetState(null);

    if (!availability.allowed || !availability.asset) {
      finishAssetDrag(true);
      return;
    }

    finishAssetDrag();
    try {
      setAssetDrag({ phase: "submitting", assetId: availability.asset.id });
      await updateAsset(availability.asset, { folder_id: targetGroupId });
      addToast({ type: "success", message: at("素材已移动") });
      await Promise.all([loadGroups(), loadAssets()]);
    } catch (error) {
      console.error(at("拖拽移动素材失败:"), error);
      addToast({ type: "error", message: at("拖拽移动素材失败") });
    } finally {
      setAssetDrag({ phase: "idle" });
      setDragMoveTargetState(null);
    }
  };

  const handleAssetPanelClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ): void => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-asset-grid-item]")) {
      return;
    }

    setSelectedAssetId(null);
  };

  const handleOpenAssetPreview = (asset: AssetItem): void => {
    if (!asset.mime.startsWith("image/")) {
      setPreviewFile(asset);
      return;
    }
    setSelectedAssetId(asset.id);

    const viewer = assetViewerRef.current;
    if (!viewer) {
      return;
    }

    const assetIndex = Array.from(
      assetGridRef.current?.querySelectorAll<HTMLImageElement>(
        `.${ASSET_VIEWER_IMAGE_CLASS}`,
      ) || [],
    ).findIndex((image) => image.dataset.assetId === asset.id);
    if (assetIndex < 0) {
      return;
    }

    viewer.update();
    viewer.view(assetIndex);
  };

  const handleContextMenuAction = async (
    action:
      | "open"
      | "rename"
      | "move"
      | "delete"
      | "create-group"
      | "refresh"
      | "insert"
      | "download"
      | "restore",
  ): Promise<void> => {
    const menu = contextMenu;
    setContextMenu(null);

    if (!menu) {
      return;
    }

    if (menu.target.type === "group") {
      const group = findGroupById(groups, menu.target.groupId);
      if (!group) {
        return;
      }

      if (action === "open") {
        setSelectedGroupId(group.id);
        return;
      }

      if (action === "create-group") {
        handleCreateFolder(group.id);
        return;
      }

      if (action === "rename") {
        handleRenameGroup(group);
        return;
      }

      if (action === "delete") {
        handleDeleteGroup(group);
      }
      return;
    }

    if (menu.target.type === "canvas") {
      if (action === "refresh") {
        await refreshAll();
        return;
      }

      if (action === "create-group") {
        handleCreateFolder(menu.target.groupId);
      }
      return;
    }

    const assetId = menu.target.type === "asset" ? menu.target.assetId : null;
    const asset = assetId
      ? (assets.find((item) => item.id === assetId) ?? null)
      : null;
    if (!asset) {
      return;
    }

    if (action === "insert") {
      await insertAsset(asset);
      return;
    }
    if (action === "download") {
      await downloadAsset(asset);
      return;
    }
    if (action === "restore") {
      await restoreAsset(asset);
      return;
    }
    if (action === "open") {
      handleOpenAssetPreview(asset);
      return;
    }

    if (action === "rename") {
      handleRenameSelectedAsset(asset);
      return;
    }

    if (action === "move") {
      handleMoveAsset(asset);
      return;
    }

    if (action === "delete") {
      handleDeleteSelectedAsset(asset);
    }
  };

  const closeDialog = (): void => {
    if (dialogSubmitting) {
      return;
    }

    setDialogError(null);
    setDialogState(null);
  };

  const updateDialogTextValue = (value: string): void => {
    setDialogState((prev) => {
      if (!prev) {
        return prev;
      }

      if (
        prev.type === "create-group" ||
        prev.type === "rename-group" ||
        prev.type === "rename-asset"
      ) {
        return { ...prev, value };
      }

      return prev;
    });
  };

  const updateMoveDialogTarget = (targetGroupId: string | null): void => {
    setDialogState((prev) => {
      if (!prev || prev.type !== "move-asset") {
        return prev;
      }

      return { ...prev, targetGroupId };
    });
  };

  const handleDialogSubmit = async (): Promise<void> => {
    if (!dialogState || dialogSubmitting) return;
    setDialogRequest({ phase: "submitting" });

    try {
      if (dialogState.type === "create-group") {
        const name = dialogState.value.trim();
        if (!name) {
          setDialogError(at("请输入文件夹名称"));
          return;
        }

        await submitCreateGroup(dialogState.parentId, name);
        setDialogState(null);
        return;
      }

      if (dialogState.type === "rename-group") {
        const name = dialogState.value.trim();
        if (!name) {
          setDialogError(at("请输入文件夹名称"));
          return;
        }

        if (name === dialogState.group.name) {
          setDialogState(null);
          return;
        }

        await submitRenameGroup(dialogState.group, name);
        setDialogState(null);
        return;
      }

      if (dialogState.type === "rename-asset") {
        const name = dialogState.value.trim();
        if (!name) {
          setDialogError(at("请输入素材名称"));
          return;
        }

        if (name === dialogState.asset.name) {
          setDialogState(null);
          return;
        }

        await submitRenameAsset(dialogState.asset, name);
        setDialogState(null);
        return;
      }

      if (dialogState.type === "move-asset") {
        await submitMoveAsset(dialogState.asset, dialogState.targetGroupId);
        setDialogState(null);
        return;
      }

      if (dialogState.type === "delete-group") {
        await submitDeleteGroup(dialogState.group);
        setDialogState(null);
        return;
      }

      if (dialogState.type === "delete-asset") {
        await submitDeleteAsset(dialogState.asset);
        setDialogState(null);
      }
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : at("操作失败，请重试"),
      );
    } finally {
      setDialogRequest((current) =>
        current.phase === "submitting" ? { phase: "editing" } : current,
      );
    }
  };

  async function insertAsset(asset: AssetItem) {
    if (inserting || !onInsert) return;
    setInserting(true);
    try {
      await onInsert(asset);
    } catch (error) {
      addToast({
        type: "error",
        message:
          error instanceof Error ? error.message : t("assets.insertFailed"),
      });
    } finally {
      setInserting(false);
    }
  }
  async function restoreAsset(asset: AssetItem) {
    try {
      await updateAsset(asset, { trashed: false });
      addToast({ type: "success", message: t("assets.restored") });
      await refreshAll();
    } catch (error) {
      addToast({
        type: "error",
        message: error instanceof Error ? error.message : t("common.tryAgain"),
      });
    }
  }
  async function downloadAsset(asset: AssetItem) {
    try {
      downloadBlob(await blobForSource(assetUrl(asset)), asset.name);
    } catch (error) {
      addToast({
        type: "error",
        message: error instanceof Error ? error.message : t("common.tryAgain"),
      });
    }
  }

  function renderAssetCard(asset: AssetItem) {
    const active = asset.id === selectedAssetId;
    const dragging = asset.id === draggingAssetId;
    const draggable = !trash && !selectionOnly;
    const previewUrl = resolveAssetImageUrl(asset);
    const viewerSrc = assetUrl(asset);
    const resolution =
      asset.width > 0 && asset.height > 0
        ? `${asset.width} × ${asset.height}`
        : "";

    return (
      <div
        key={asset.id}
        className="asset-card-wrap relative min-w-0"
        data-asset-grid-item="asset"
      >
        <Button
          type="button"
          variant="ghost"
          data-asset-grid-item="asset"
          draggable={draggable}
          onClickCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (picker) setSelectedAssetId(asset.id);
            else handleOpenAssetPreview(asset);
          }}
          onDoubleClick={() => {
            if (picker && !trash) void insertAsset(asset);
          }}
          onDragStart={(event) => handleAssetDragStart(event, asset)}
          onDrag={handleAssetDragging}
          onDragEnd={(event) =>
            finishAssetDrag(event.dataTransfer.dropEffect === "none")
          }
          onContextMenu={(event) => {
            if (!selectionOnly) handleAssetContextMenu(event, asset);
          }}
          onKeyDown={(event) => {
            if (
              !selectionOnly &&
              (event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10"))
            )
              openContextMenu(event, { type: "asset", assetId: asset.id });
          }}
          aria-label={t("assets.selectAsset", { name: asset.name })}
          title={asset.name}
          aria-pressed={active}
          className={cn(
            picker && "asset-picker-card",
            "group flex h-auto min-h-0 w-full flex-col items-stretch justify-start gap-0 overflow-hidden rounded-lg border bg-background p-0 text-left text-inherit shadow-none",
            "transition-colors duration-200",
            dragging && "opacity-70",
            active
              ? "border-[var(--ring)] ring-1 ring-[var(--ring)] hover:bg-background"
              : "border-border hover:border-input hover:bg-background",
          )}
        >
          <div className="asset-card-image relative aspect-[4/3] overflow-hidden bg-muted">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={asset.name}
                loading="lazy"
                draggable={false}
                data-viewer-src={viewerSrc}
                data-asset-id={asset.id}
                className={cn(
                  "absolute -inset-px block h-[calc(100%+2px)] w-[calc(100%+2px)] max-w-none object-contain",
                  ASSET_VIEWER_IMAGE_CLASS,
                )}
              />
            ) : (
              <FileText className="absolute inset-0 m-auto size-9 text-muted-foreground" />
            )}
            {picker && active && (
              <span className="asset-selection-mark">
                <Check className="size-3" />
              </span>
            )}
          </div>
          <div className="asset-card-caption p-2.5">
            <div
              className="truncate text-sm font-medium text-foreground"
              title={asset.name}
            >
              {asset.name}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {formatBytes(asset.size)}
              {resolution ? ` · ${resolution}` : ""}
            </div>
          </div>
          {!picker && (
            <time
              className="asset-row-date text-xs text-muted-foreground"
              dateTime={asset.created_at}
            >
              {new Date(asset.created_at).toLocaleDateString(locale)}
            </time>
          )}
        </Button>
        {!selectionOnly && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="asset-card-more absolute right-1 bottom-1"
            aria-label={t("assets.assetActions", { name: asset.name })}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedAssetId(asset.id);
              openContextMenu(event, { type: "asset", assetId: asset.id });
            }}
          >
            <MoreHorizontal />
          </Button>
        )}
      </div>
    );
  }

  const EmptyAssetIcon = trash ? Trash2 : keyword ? Search : Images;
  return (
    <div
      aria-label={t("assets.title")}
      onDragOverCapture={(event) => {
        if (!(event.target as Element).closest("[data-asset-drop-target]"))
          setDragMoveTargetState(null);
      }}
      onDragOver={(event) => {
        if (!draggingAssetId || hasFileTransferTypes(event.dataTransfer))
          return;
        // Accept a no-op drop so we can return the preview immediately,
        // without waiting for the browser's rejected-drop feedback.
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!draggingAssetId || hasFileTransferTypes(event.dataTransfer))
          return;
        event.preventDefault();
        event.stopPropagation();
        finishAssetDrag(true);
      }}
      onDragLeaveCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        const target = (event.target as Element).closest(
          "[data-asset-drop-target]",
        );
        if (
          !event.currentTarget.contains(next) ||
          (target && !target.contains(next))
        )
          setDragMoveTargetState(null);
      }}
      ref={explorerRef}
      className={cn(
        "asset-browser grid h-full min-h-0 grid-cols-1 overflow-hidden bg-background",
        picker
          ? "asset-browser-picker"
          : "asset-browser-manager md:grid-cols-[252px_minmax(0,1fr)]",
      )}
    >
      {sidebarDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setSidebarDrawerOpen(false)}
        />
      )}

      <aside
        ref={sidebarRef}
        aria-label={t("assets.folders")}
        className={cn(
          "asset-folder-sidebar min-h-0 overflow-hidden border-r border-border bg-background",
          "flex flex-col",
          "fixed inset-y-0 left-0 z-50 w-[272px] transition-transform duration-200 ease-out",
          "md:static md:z-auto md:w-auto md:translate-x-0 md:transition-none",
          sidebarDrawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-3 md:hidden">
          <span className="text-sm font-semibold text-foreground">
            {t("assets.folders")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setSidebarDrawerOpen(false)}
            aria-label={t("assets.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
          <AssetFolderTree
            groups={groups}
            loading={groupsLoading}
            selectedGroupId={trash ? "trash" : selectedGroupId}
            selectedRootGroupId={selectedRootGroup?.id ?? null}
            contextGroupId={contextMenuFocusedGroupId}
            contextAllFocused={contextMenuFocusedAll}
            dropTargetGroupId={
              dragMoveFocusedArea === "tree" ? dragMoveFocusedGroupId : null
            }
            dropTargetAll={dragMoveFocusedArea === "tree" && dragMoveFocusedAll}
            onSelectAll={() => {
              setSelectedGroupId(null);
              setTrash(false);
              setSidebarDrawerOpen(false);
            }}
            onSelectGroup={(groupId) => {
              setSelectedGroupId(groupId);
              setTrash(false);
              setSidebarDrawerOpen(false);
            }}
            onGroupContextMenu={handleGroupContextMenu}
            onAllContextMenu={handleAllFoldersContextMenu}
            onGroupDragOver={(event, group) =>
              handleDragOverMoveTarget(event, group.id, "tree")
            }
            onGroupDrop={(event, group) => {
              void handleDropMoveTarget(event, group.id);
            }}
            onAllDragOver={(event) =>
              handleDragOverMoveTarget(event, null, "tree")
            }
            onAllDrop={(event) => {
              void handleDropMoveTarget(event, null);
            }}
          />
        </div>

        <div className="mt-auto border-t border-border p-3">
          <Button
            variant={trash ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => {
              setSelectedGroupId(null);
              setSelectedAssetId(null);
              setTrash(true);
              setSidebarDrawerOpen(false);
            }}
          >
            <Trash2 className="size-4" />
            {t("assets.trash")}
          </Button>
        </div>
      </aside>

      <section
        className={cn(
          "relative min-h-0 overflow-hidden bg-background",
          "flex flex-col",
        )}
        onDragEnter={(e) => {
          if (hasFileTransferTypes(e.dataTransfer)) {
            if (!canUpload) {
              return;
            }
            e.preventDefault();
            setDragActive(true);
            return;
          }

          if (!draggingAssetId) {
            return;
          }

          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDragOver={(e) => {
          if (hasFileTransferTypes(e.dataTransfer)) {
            if (!canUpload) {
              return;
            }
            e.preventDefault();
            setDragActive(true);
            return;
          }

          if (!draggingAssetId) {
            return;
          }

          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragMoveTargetState(null);
        }}
        onDragLeave={(e) => {
          if (!canUpload || !dragActive) {
            return;
          }
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
            return;
          }
          setDragActive(false);
        }}
        onDrop={(e) => {
          if (hasFileTransferTypes(e.dataTransfer)) {
            if (!canUpload) {
              return;
            }
            e.preventDefault();
            setDragActive(false);
            openUploadDialog(Array.from(e.dataTransfer.files || []));
            return;
          }

          if (draggingAssetId) {
            e.preventDefault();
            e.stopPropagation();
            finishAssetDrag(true);
          }
        }}
      >
        {picker && (
          <div className="asset-browser-heading flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {navigation}
              <h2 className="truncate text-sm font-semibold">
                {t("assets.title")}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onShapeLibrary && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("assets.shapeLibrary")}
                  onClick={onShapeLibrary}
                >
                  <Shapes />
                </Button>
              )}
              {!selectionOnly && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  nativeButton={false}
                  render={<Link to="/assets" />}
                  className="text-muted-foreground"
                  aria-label={t("assets.manage")}
                >
                  <FolderOpen />
                </Button>
              )}
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("assets.close")}
                  onClick={onClose}
                  disabled={uploading}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="border-b border-border bg-background">
          <div className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 md:basis-60">
              {!picker && navigation}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="asset-folder-drawer-toggle md:hidden"
                title={at("文件夹")}
                aria-label={at("文件夹")}
                onClick={() => setSidebarDrawerOpen(true)}
              >
                <FolderOpen className="size-4" />
              </Button>
              <form
                onSubmit={handleSearchSubmit}
                className="relative min-w-0 flex-1 md:max-w-[420px]"
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setKeyword(e.target.value.trim());
                  }}
                  placeholder={at("搜索文件（输入关键词）")}
                  className="pr-9 pl-9"
                />
                {searchInput && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("assets.clearSearch")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={handleClearSearch}
                  >
                    <X />
                  </Button>
                )}
              </form>
            </div>

            <div className="asset-browser-tools flex flex-wrap items-center gap-2">
              {!picker && (
                <>
                  <div
                    className="asset-view-toggle"
                    role="group"
                    aria-label={t("assets.viewMode")}
                  >
                    {(["grid", "list"] as const).map((mode) => (
                      <Tooltip key={mode}>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t(
                                mode === "grid"
                                  ? "assets.gridView"
                                  : "assets.listView",
                              )}
                              aria-pressed={view === mode}
                              className="border-0 text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground"
                              onClick={() => {
                                setView(mode);
                                localStorage.setItem("huayu:assets-view", mode);
                              }}
                            >
                              {mode === "grid" ? <LayoutGrid /> : <List />}
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {t(
                            mode === "grid"
                              ? "assets.gridView"
                              : "assets.listView",
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </>
              )}
              {picker && (
                <AssetFolderFilter
                  groups={groups}
                  selectedGroupId={selectedGroupId}
                  onSelectAll={() => {
                    setSelectedGroupId(null);
                    setTrash(false);
                  }}
                  onSelectGroup={(id) => {
                    setSelectedGroupId(id);
                    setTrash(false);
                  }}
                />
              )}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t(
                        sort === "newest" ? "assets.newest" : "assets.oldest",
                      )}
                      onClick={() =>
                        setSort(sort === "newest" ? "oldest" : "newest")
                      }
                    >
                      <ArrowDownUp />
                    </Button>
                  }
                />
                <TooltipContent side="bottom">
                  {t(sort === "newest" ? "assets.newest" : "assets.oldest")}
                </TooltipContent>
              </Tooltip>
              <Button
                type="button"
                variant="outline"
                className="asset-new-folder"
                onClick={() => handleCreateFolder()}
                disabled={trash}
              >
                <FolderPlus className="size-4" />
                {at("新建文件夹")}
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="asset-refresh"
                      aria-label={at("刷新")}
                      onClick={() => void refreshAll()}
                      disabled={refreshing}
                    >
                      {refreshing ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCcw />
                      )}
                    </Button>
                  }
                />
                <TooltipContent side="bottom">{at("刷新")}</TooltipContent>
              </Tooltip>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="default"
                className="asset-toolbar-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canUpload || uploading}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin shrink-0" />
                ) : (
                  <Upload className="size-4" />
                )}
                {at("上传")}
              </Button>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            ref={galleryScrollRef}
            className="asset-gallery-scroll h-full overflow-auto bg-background px-4 py-4"
            onClick={handleAssetPanelClick}
            tabIndex={0}
            aria-label={t("assets.list")}
            onKeyDown={(event) => {
              if (
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              )
                openContextMenu(event, {
                  type: "canvas",
                  groupId: selectedGroupId,
                });
            }}
            onContextMenu={(event) => handleCanvasContextMenu(event)}
          >
            <div ref={assetGridRef}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap text-sm text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-6 min-w-0 rounded-sm px-1 text-sm leading-none",
                      selectedGroupId === null
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      setSelectedGroupId(null);
                      setTrash(false);
                    }}
                  >
                    {trash ? t("assets.trash") : at("素材")}
                  </Button>
                  {!trash &&
                    pathGroups.map((group, index) => {
                      const isLast = index === pathGroups.length - 1;
                      return (
                        <div
                          key={group.id}
                          className="flex h-6 items-center gap-1.5"
                        >
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={isLast}
                            className={cn(
                              "h-6 min-w-0 rounded-sm px-1 text-sm leading-none",
                              isLast
                                ? "cursor-default font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() =>
                              !isLast && setSelectedGroupId(group.id)
                            }
                          >
                            {group.name}
                          </Button>
                        </div>
                      );
                    })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {listSummaryText}
                </div>
              </div>

              {assetsLoading ||
              loadedAssetsKey !== activeAssetsKey ||
              (!keyword && groupsLoading) ? (
                <AssetSkeletonGrid />
              ) : listItems.length === 0 ? (
                <div className="rounded-md border border-border bg-background py-16 text-center">
                  <EmptyAssetIcon
                    className="mx-auto mb-3 size-10 text-muted-foreground opacity-50"
                    strokeWidth={1.5}
                  />
                  <p className="text-sm font-medium text-foreground">
                    {trash
                      ? t("assets.trashEmpty")
                      : keyword
                        ? t("assets.noResults")
                        : at("当前目录暂无素材")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {!trash && t("assets.emptyFilesHint")}
                  </p>
                </div>
              ) : picker ? (
                <div
                  className="asset-picker-masonry"
                  style={{
                    gridTemplateColumns: `repeat(${selectionOnly ? 3 : 2}, minmax(0, 1fr))`,
                  }}
                >
                  {assetMasonryColumns(assets, selectionOnly ? 3 : 2).map(
                    (column, index) => (
                      <div key={index} className="asset-picker-column">
                        {column.map(renderAssetCard)}
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div
                  className={
                    view === "grid"
                      ? "asset-manager-grid grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3"
                      : "asset-manager-list"
                  }
                >
                  {listItems.map((item) => {
                    if (item.type === "group") {
                      const group = item.group;
                      const isFolderActive = selectedGroupId === group.id;
                      const isFolderContextFocused =
                        contextMenuFocusedGroupId === group.id;
                      const isFolderDropTarget =
                        dragMoveFocusedArea === "grid" &&
                        dragMoveFocusedGroupId === group.id;

                      return (
                        <Button
                          key={item.key}
                          type="button"
                          variant="ghost"
                          data-asset-grid-item="group"
                          data-asset-drop-target
                          onClick={(event) => {
                            if (event.ctrlKey) return;
                            setSelectedGroupId(group.id);
                          }}
                          onContextMenu={(event) =>
                            handleGroupContextMenu(event, group)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === "ContextMenu" ||
                              (event.shiftKey && event.key === "F10")
                            )
                              openContextMenu(event, {
                                type: "group",
                                groupId: group.id,
                              });
                          }}
                          onDragEnter={(event) =>
                            handleDragOverMoveTarget(event, group.id, "grid")
                          }
                          onDragOver={(event) =>
                            handleDragOverMoveTarget(event, group.id, "grid")
                          }
                          onDrop={(event) => {
                            void handleDropMoveTarget(event, group.id);
                          }}
                          className={cn(
                            "group flex h-auto min-h-0 w-full flex-col items-stretch justify-start gap-0 overflow-hidden rounded-lg border p-0 text-left text-inherit shadow-none",
                            "transition-colors duration-200",
                            isFolderDropTarget
                              ? "border-[var(--ring)] bg-[var(--accent)] ring-1 ring-[var(--ring)] hover:bg-[var(--accent)]"
                              : isFolderContextFocused
                                ? "border-[var(--ring)] bg-[var(--accent)] ring-1 ring-[var(--ring)] hover:bg-[var(--accent)]"
                                : isFolderActive
                                  ? "border-border bg-muted ring-1 ring-border hover:bg-muted"
                                  : "border-border bg-background hover:border-input hover:bg-background",
                          )}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                            <div className="flex h-full w-full items-center justify-center">
                              <img
                                src={folderIcon}
                                alt=""
                                aria-hidden
                                className="h-16 w-16"
                              />
                            </div>
                          </div>
                          <div className="p-2.5">
                            <div
                              className="truncate text-[12px] font-medium text-foreground"
                              title={group.name}
                            >
                              {group.name}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <span className="inline-flex size-3 items-center justify-center shrink-0">
                                  <img
                                    src={folderIcon}
                                    alt=""
                                    aria-hidden
                                    className="h-3 w-3 shrink-0"
                                  />
                                </span>
                                {group.children.length}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="inline-flex size-3 items-center justify-center shrink-0">
                                  <FileText className="size-3 shrink-0 text-muted-foreground" />
                                </span>
                                {group.asset_count}
                              </span>
                            </div>
                          </div>
                        </Button>
                      );
                    }

                    return renderAssetCard(item.asset);
                  })}
                </div>
              )}

              <div ref={sentinel} className="h-px" />
              {!assetsLoading &&
              loadedAssetsKey === activeAssetsKey &&
              hasMoreAssets ? (
                <div className="flex justify-center py-6">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={assetsLoadingMore}
                    onClick={() => void loadAssets(assetsPage + 1, true)}
                  >
                    {assetsLoadingMore ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {assetsLoadingMore ? at("加载中...") : at("加载更多")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {dragActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--accent)]">
              <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[var(--ring)] bg-background/80 px-16 py-12">
                <Upload className="size-12 text-[var(--primary)]" />
                <p className="text-lg font-medium text-[var(--primary)]">
                  {t("assets.dropFiles")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("assets.fileTypes")}
                </p>
              </div>
            </div>
          )}
        </div>

        {previewFile && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setPreviewFile(null);
            }}
          >
            <DialogContent>
              <DialogTitle>{previewFile.name}</DialogTitle>
              <DialogDescription>
                {formatBytes(previewFile.size)} · {previewFile.mime}
              </DialogDescription>
              <div className="flex flex-col items-center gap-5 py-8">
                <FileText className="size-12 text-muted-foreground" />
                <Button
                  variant="outline"
                  onClick={() => void downloadAsset(previewFile)}
                >
                  <Download />
                  {t("common.download")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {picker && (
          <div className="asset-browser-footer flex shrink-0 items-center gap-2 border-t px-3 py-3">
            {!selectionOnly && (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || trash}
              >
                <Upload className="size-4" />
                {t("assets.upload")}
              </Button>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {selectedAsset?.name ||
                (selectionOnly
                  ? t("assets.chooseAnImage")
                  : at("选择图片后插入"))}
            </span>
            <Button
              disabled={!selectedAsset || inserting || trash}
              onClick={() => selectedAsset && void insertAsset(selectedAsset)}
            >
              {inserting && <Loader2 className="size-4 animate-spin" />}
              {insertLabel || t("assets.insert")}
            </Button>
          </div>
        )}

        {draggingAssetId &&
          dragPreview &&
          createPortal(
            <div
              ref={dragPreviewElementRef}
              data-asset-drag-preview
              className="pointer-events-none fixed left-0 top-0 z-[70] will-change-transform [transform:translate3d(-9999px,-9999px,0)]"
            >
              <div
                className={cn(
                  "absolute left-0 top-0 overflow-hidden rounded-md border border-[var(--ring)] bg-background ring-1 ring-[var(--ring)]",
                  dragPreview.listRow && "flex items-center px-2",
                  "transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  dragPreviewArea === "tree" ? "opacity-0" : "opacity-100",
                )}
                style={{
                  width: dragPreview.cardWidth,
                  height: dragPreview.cardHeight,
                  transform:
                    dragPreviewArea === "tree" ? "scale(0.95)" : "scale(1)",
                }}
              >
                <div
                  className="relative shrink-0 overflow-hidden bg-muted"
                  style={{
                    height: dragPreview.imageHeight,
                    width: dragPreview.listRow ? 40 : undefined,
                  }}
                >
                  {dragPreview.thumbnailUrl ? (
                    <img
                      src={dragPreview.thumbnailUrl}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 block h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-6 opacity-50" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 overflow-hidden px-2.5 py-2.5">
                  <div className="truncate text-sm font-medium text-foreground">
                    {dragPreview.name}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {dragPreview.metaText}
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "absolute left-0 top-0 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-[var(--ring)] bg-muted shadow-md",
                  "transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
                  dragPreviewArea === "tree" ? "opacity-100" : "opacity-0",
                )}
                style={{
                  transform:
                    dragPreviewArea === "tree" ? "scale(1)" : "scale(0.95)",
                }}
              >
                {dragPreview.thumbnailUrl ? (
                  <img
                    src={dragPreview.thumbnailUrl}
                    alt=""
                    aria-hidden
                    className="block h-full w-full object-cover"
                  />
                ) : (
                  <ImageOff className="size-4 text-muted-foreground opacity-50" />
                )}
              </div>
            </div>,
            document.body,
          )}
      </section>

      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={
              contextMenu.target.type === "asset"
                ? t("assets.assetActions", {
                    name:
                      assets.find((asset) => asset.id === contextMenuAssetId)
                        ?.name ?? "",
                  })
                : contextMenu.target.type === "group"
                  ? t("assets.folderActions", {
                      name:
                        findGroupById(groups, contextMenu.target.groupId)
                          ?.name ?? "",
                    })
                  : t("assets.title")
            }
            tabIndex={-1}
            className="asset-context-menu fixed z-[1400] w-[192px] rounded-md border border-border bg-background py-1 shadow-md"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]:not(:disabled)',
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowUp" ? items.length - 1 : 1)) %
                        items.length;
                items[next]?.focus();
              }
              if (event.key === "Tab") setContextMenu(null);
            }}
          >
            {contextMenu.target.type === "asset" && (
              <>
                {!trash && onInsert && (
                  <Button
                    type="button"
                    variant="ghost"
                    role="menuitem"
                    className="asset-menu-item"
                    disabled={inserting}
                    onClick={() => void handleContextMenuAction("insert")}
                  >
                    <SquarePlus />
                    {t("assets.insert")}
                  </Button>
                )}
                {trash && (
                  <Button
                    type="button"
                    variant="ghost"
                    role="menuitem"
                    className="asset-menu-item"
                    onClick={() => void handleContextMenuAction("restore")}
                  >
                    <Undo2 />
                    {t("assets.restore")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  role="menuitem"
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("download")}
                >
                  <Download />
                  {t("assets.download")}
                </Button>
                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("open")}
                >
                  <Eye />
                  {at("打开")}
                </Button>

                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  disabled={trash}
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("rename")}
                >
                  <Pencil />
                  {at("重命名")}
                </Button>

                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  disabled={trash}
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("move")}
                >
                  <FolderInput />
                  {at("移动到文件夹...")}
                </Button>

                <div className="my-1 border-t border-border" />

                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  disabled={trash}
                  className="asset-menu-item text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleContextMenuAction("delete")}
                >
                  <Trash2 />
                  {at("删除")}
                </Button>
              </>
            )}

            {contextMenu.target.type === "group" && (
              <>
                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("open")}
                >
                  <FolderOpen />
                  {at("打开")}
                </Button>

                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  disabled={!contextMenuCreateAvailability?.allowed}
                  title={
                    contextMenuCreateAvailability?.allowed
                      ? ""
                      : contextMenuCreateAvailability?.message
                  }
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("create-group")}
                >
                  <FolderPlus />
                  {at("新建子文件夹")}
                </Button>

                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("rename")}
                >
                  <Pencil />
                  {at("重命名")}
                </Button>

                <div className="my-1 border-t border-border" />

                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  className="asset-menu-item text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleContextMenuAction("delete")}
                >
                  <Trash2 />
                  {at("删除")}
                </Button>
              </>
            )}

            {contextMenu.target.type === "canvas" && (
              <>
                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("refresh")}
                >
                  <RefreshCcw />
                  {at("刷新")}
                </Button>
                <Button
                  role="menuitem"
                  type="button"
                  variant="ghost"
                  disabled={!contextMenuCreateAvailability?.allowed}
                  title={
                    contextMenuCreateAvailability?.allowed
                      ? ""
                      : contextMenuCreateAvailability?.message
                  }
                  className="asset-menu-item"
                  onClick={() => void handleContextMenuAction("create-group")}
                >
                  <FolderPlus />
                  {contextMenuCanvasGroup
                    ? at("新建子文件夹")
                    : at("新建文件夹")}
                </Button>
              </>
            )}
          </div>,
          document.body,
        )}
      {dialogState && (
        <Dialog open onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className="max-w-[520px]">
            <DialogHeader>
              <DialogTitle>
                {dialogState.type === "create-group"
                  ? at("新建文件夹")
                  : dialogState.type === "rename-group"
                    ? at("重命名文件夹")
                    : dialogState.type === "rename-asset"
                      ? at("重命名素材")
                      : dialogState.type === "move-asset"
                        ? at("移动到文件夹")
                        : dialogState.type === "delete-group"
                          ? at("删除文件夹")
                          : at("删除素材")}
              </DialogTitle>
              <DialogDescription>
                {dialogState.type === "create-group"
                  ? at("将在「{arg0}」中创建", { arg0: dialogState.parentName })
                  : dialogState.type === "rename-group"
                    ? at("当前名称：{arg0}", { arg0: dialogState.group.name })
                    : dialogState.type === "rename-asset"
                      ? at("当前名称：{arg0}", { arg0: dialogState.asset.name })
                      : dialogState.type === "move-asset"
                        ? at("选择「{arg0}」的目标文件夹", {
                            arg0: dialogState.asset.name,
                          })
                        : dialogState.type === "delete-group"
                          ? at(
                              "删除「{arg0}」后，其中的素材和子文件夹会移到上一级。",
                              { arg0: dialogState.group.name },
                            )
                          : at("将「{arg0}」移入回收站？", {
                              arg0: dialogState.asset.name,
                            })}
              </DialogDescription>
            </DialogHeader>
            {(dialogState.type === "create-group" ||
              dialogState.type === "rename-group" ||
              dialogState.type === "rename-asset") && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  {dialogState.type === "rename-asset"
                    ? at("素材名称")
                    : at("文件夹名称")}
                </label>
                <Input
                  value={dialogState.value}
                  onChange={(event) =>
                    updateDialogTextValue(event.target.value)
                  }
                  aria-label={
                    dialogState.type === "rename-asset"
                      ? at("素材名称")
                      : at("文件夹名称")
                  }
                  placeholder={
                    dialogState.type === "rename-asset"
                      ? at("请输入素材名称")
                      : at("请输入文件夹名称")
                  }
                  onFocus={(event) => event.currentTarget.select()}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleDialogSubmit();
                    }
                  }}
                />
              </div>
            )}

            {dialogState.type === "move-asset" && (
              <div className="space-y-3">
                <div className="max-h-[280px] overflow-auto rounded-md border border-border bg-muted p-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "w-full justify-between text-left",
                      dialogState.targetGroupId === null
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background",
                    )}
                    onClick={() => updateMoveDialogTarget(null)}
                  >
                    <span>{at("根目录 / 未分组")}</span>
                    {dialogState.targetGroupId === null && (
                      <Check className="size-4 text-[var(--primary)]" />
                    )}
                  </Button>

                  {personalGroupOptions.map((option) => (
                    <Button
                      key={`move-target-${option.id}`}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "mt-1 w-full justify-between text-left",
                        dialogState.targetGroupId === option.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-background",
                      )}
                      onClick={() => updateMoveDialogTarget(option.id)}
                    >
                      <span className="truncate">
                        {`${"　".repeat(option.depth)}${option.depth ? "└ " : ""}${option.name}`}
                      </span>
                      {dialogState.targetGroupId === option.id && (
                        <Check className="size-4 text-[var(--primary)]" />
                      )}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {at("当前文件：")}
                  {dialogState.asset.name}
                </div>
              </div>
            )}

            {(dialogState.type === "delete-group" ||
              dialogState.type === "delete-asset") && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {dialogState.type === "delete-group"
                  ? at("素材和子文件夹会保留。")
                  : t("assets.restoreHint")}
              </div>
            )}

            {dialogError && (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {dialogError}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                disabled={dialogSubmitting}
              >
                {at("取消")}
              </Button>
              <Button
                type="button"
                variant={
                  dialogState.type === "delete-group" ||
                  dialogState.type === "delete-asset"
                    ? "destructive"
                    : "default"
                }
                onClick={() => void handleDialogSubmit()}
                disabled={dialogSubmitting}
              >
                {dialogSubmitting && (
                  <Loader2 className="size-4 animate-spin shrink-0" />
                )}
                {dialogState.type === "move-asset"
                  ? at("移动")
                  : dialogState.type === "delete-group" ||
                      dialogState.type === "delete-asset"
                    ? at("删除")
                    : dialogState.type === "create-group"
                      ? at("创建")
                      : t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => !open && tryCloseUploadDialog()}
      >
        <DialogContent
          className="asset-upload-dialog max-w-[calc(100%-2rem)] sm:!max-w-[880px]"
          showCloseButton
        >
          <DialogHeader className="pr-10 text-left sm:pr-12">
            <DialogTitle>
              {at("上传文件到【")}
              {uploadTargetGroupId
                ? (findGroupById(groups, uploadTargetGroupId)?.name ??
                  at("未知"))
                : at("根目录 / 未分组")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-[1fr_90px_90px_52px] gap-x-3 py-2 text-xs font-medium text-muted-foreground">
            <span>{at("文件名")}</span>
            <span className="asset-upload-size">{at("文件大小")}</span>
            <span>{at("上传状态")}</span>
            <span className="text-right">{at("操作")}</span>
          </div>

          <div className="min-h-[120px] max-h-[60vh] overflow-auto">
            {uploadDialogItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_90px_90px_52px] items-center gap-x-3 border-b py-2.5 text-sm last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" />
                      </div>
                    )}
                  </div>
                  <span className="truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <span className="asset-upload-size text-xs text-muted-foreground">
                  {formatBytes(item.size)}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    item.status === "done" && "text-green-600",
                    item.status === "error" && "text-destructive",
                    item.status === "uploading" && "text-primary",
                  )}
                >
                  {item.status === "pending"
                    ? at("等待上传")
                    : item.status === "uploading"
                      ? at("上传中...")
                      : item.status === "done"
                        ? at("已完成")
                        : item.message}
                </span>
                <div className="text-right">
                  {item.status === "pending" && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="hidden text-destructive sm:inline-flex"
                        aria-label={`${at("取消")} ${item.name}`}
                        onClick={() => removeUploadDialogItem(item.id)}
                      >
                        {at("取消")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive sm:hidden"
                        aria-label={`${at("取消")} ${item.name}`}
                        onClick={() => removeUploadDialogItem(item.id)}
                      >
                        <X />
                      </Button>
                    </>
                  )}
                  {item.status === "done" && (
                    <Check className="ml-auto size-4 text-green-600" />
                  )}
                  {item.status === "error" && (
                    <X className="ml-auto size-4 text-destructive" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            <div className="flex-1">
              {!uploading && uploadDialogPendingCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setUploadDialogItems((prev) => {
                      for (const item of prev) {
                        if (item.status === "pending" && item.previewUrl) {
                          URL.revokeObjectURL(item.previewUrl);
                        }
                      }

                      return prev.filter((item) => item.status !== "pending");
                    })
                  }
                >
                  {at("清空列表")}
                </Button>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {uploadDialogAllFinished ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={confirmCloseUploadDialog}
                >
                  {at("关闭")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  onClick={() => void startDialogUpload()}
                  disabled={uploading || uploadDialogPendingCount === 0}
                >
                  {uploading && (
                    <Loader2 className="size-4 animate-spin shrink-0" />
                  )}
                  {at("开始上传")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {uploadCloseConfirm && (
        <Dialog
          open
          onOpenChange={(open) => !open && setUploadCloseConfirm(false)}
        >
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{at("取消上传")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {at("是否取消上传，取消后将清空上传列表？")}
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadCloseConfirm(false)}
              >
                {at("继续上传")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmCloseUploadDialog}
              >
                {at("取消上传")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
