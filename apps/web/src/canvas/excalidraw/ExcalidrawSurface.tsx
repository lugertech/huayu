import { t as appT, useTranslations } from "@/i18n";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import {
  Excalidraw,
  CaptureUpdateAction,
  MainMenu,
  useI18n,
  restoreElements,
  reconcileElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  Collaborator,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/excalidraw/element/types";
import { Editor, EditorContext, type CanvasStore } from "@/canvas/editor";
import type { ChangeEntry } from "@/canvas/engine/store";
import type { CanvasSync } from "@/canvas/sync";
import { memberColor, memberName } from "@/canvas/members";
import { useToast } from "@/Components/common/ToastProvider";
import { useTheme } from "@/lib/theme";
import { blobAsDataURL, blobForSource } from "@/api/backend";
import { uploadAsset, downloadBlob } from "@/api/client";
import {
  applyNativeScene,
  INTERNAL_EMBED_PREFIX,
  isComponent,
  isCustomElement,
  sceneFromEditor,
  shapeIdForElement,
  selectedShapesFromScene,
  withoutTransientMetadata,
  sceneBeforeLocalChange,
} from "./scene";
import { fitBoardElements, ZoomMenu } from "./ZoomMenu";
import { ToolbarTools } from "./ToolbarTools";
import { StylesPanel } from "./StylesPanel";
import { BoardComponents } from "./BoardComponents";
import { componentAtDropPoint } from "./image-drop";
import { nodeExecution } from "@/workflow/execute";
import { uploadComponentFile } from "@/workflow/uploads";
import { NodeInspector } from "./NodeInspector";
import { BoardConnections } from "./BoardConnections";
import { repairFrameArrowMembership } from "./frame-bindings";
import { BoardExecution } from "./BoardExecution";
import { canInspect } from "@/workflow/context";
import { nativeExporter, exportScene } from "./export";
import { boardLanguages, type BoardLanguage } from "./board-language";
import "@excalidraw/excalidraw/index.css";
import "./whiteboard.css";

const fingerprint = (elements: readonly ExcalidrawElement[]) =>
  JSON.stringify(elements.map(withoutTransientMetadata));
const toolMap: Record<string, string> = {
  selection: "select",
  freedraw: "draw",
  rectangle: "geo",
  ellipse: "geo",
  diamond: "geo",
};
const textOrUiTarget =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role=textbox], [role=combobox], [role=spinbutton], [role=dialog], [role=menu], [role=listbox], [data-content-reading], [data-canvas-ui]';
// The native language subscription must live inside Excalidraw's provider.
function NativeMenuItems({
  language,
  onLanguageChange,
  onExport,
  children,
}: {
  language: string;
  onLanguageChange: (value: string) => void;
  onExport: (format: "excalidraw" | "png" | "svg") => Promise<void>;
  children?: ReactNode;
}) {
  const { t: nativeT, langCode } = useI18n();
  const systemLabel =
    langCode === "zh-CN" || langCode === "en"
      ? appT("canvas.language.system", undefined, langCode)
      : nativeT("buttons.systemMode");
  return (
    <>
      <MainMenu.Item onSelect={() => void onExport("excalidraw")}>
        {nativeT("buttons.exportJSON")} (.excalidraw)
      </MainMenu.Item>
      <MainMenu.Item onSelect={() => void onExport("png")}>
        {nativeT("imageExportDialog.title.exportToPng")}
      </MainMenu.Item>
      <MainMenu.Item onSelect={() => void onExport("svg")}>
        {nativeT("imageExportDialog.title.exportToSvg")}
      </MainMenu.Item>
      {children}
      <MainMenu.Separator />
      <MainMenu.ItemCustom className="board-menu-language">
        <select
          aria-label={nativeT("buttons.selectLanguage")}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <option value="system">{systemLabel}</option>
          {boardLanguages.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.Help />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </>
  );
}

export function ExcalidrawSurface({
  boardLanguage,
  store,
  projectId,
  collaboration,
  initialInspectId,
  onMount,
  onReady,
  children,
  menuItems,
  toolbar,
}: {
  boardLanguage: BoardLanguage;
  store: CanvasStore;
  projectId: string;
  collaboration?: CanvasSync;
  initialInspectId?: string;
  onMount: (editor: Editor) => void;
  onReady?: () => void;
  children?: ReactNode;
  menuItems?: ReactNode;
  toolbar?: ReactNode;
}) {
  const { preference, langCode, setPreference } = boardLanguage;
  const { t, locale } = useTranslations();
  const [editor] = useState(() => new Editor(store));
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData, setInitialData] =
    useState<Promise<ExcalidrawInitialDataState> | null>(null);
  const [tool, setTool] = useState<AppState["activeTool"]["type"]>("selection");
  const [collaboratorCount, setCollaboratorCount] = useState(0);
  const [imageDropTarget, setImageDropTarget] = useState<string | null>(null);
  const pendingImageDrops = useRef(new Set<string>());
  const { resolved } = useTheme();
  const { showToast } = useToast();
  const [mountOptions] = useState(() => ({
    onMount,
    onReady,
    theme: resolved,
  }));
  const root = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef(api);
  const bridgePhase = useRef<
    "initializing" | "ready" | "applying-store" | "applying-native"
  >("initializing");
  const repaintFromStore = useRef<(() => void) | null>(null);
  const lastFingerprint = useRef("");
  const page = useRef(editor.getCurrentPageId());
  const cachedFiles = useRef<BinaryFiles>({});
  const loadingFiles = useRef(new Map<string, Promise<void>>());
  const uploaded = useRef(new Map<string, Promise<void>>());
  const resourceT = useRef(t);
  useLayoutEffect(() => {
    // Keep resource callbacks stable so a language change does not remount the editor.
    resourceT.current = t;
  }, [t]);
  apiRef.current = api;
  useEffect(() => {
    if (!api || !collaboration) return;
    const paintPresence = () => {
      const collaborators = new Map<SocketId, Collaborator>();
      for (const peer of collaboration.getPeers().values()) {
        if (peer.member_id === collaboration.getRoomMembers().self?.member_id)
          continue;
        const color = memberColor(peer).stroke;
        collaborators.set(peer.id as SocketId, {
          id: peer.id,
          socketId: peer.id as SocketId,
          username: memberName(peer, locale),
          pointer: peer.pointer || undefined,
          button: peer.button,
          selectedElementIds: peer.selectedElementIds,
          color: { stroke: color, background: color },
          isCurrentUser: false,
        });
      }
      api.updateScene({
        collaborators,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      setCollaboratorCount(collaborators.size);
    };
    const unsubscribe = collaboration.subscribePresence(paintPresence);
    paintPresence();
    return unsubscribe;
  }, [api, collaboration, locale]);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setCompact(entry.contentRect.width < 800),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = root.current;
    if (!api || !stage) return;
    const wheel = (event: WheelEvent) => {
      if (
        (!event.ctrlKey && !event.metaKey) ||
        !(event.target instanceof Element) ||
        !event.target.closest(".board-component")
      )
        return;
      const source = stage.querySelector<HTMLCanvasElement>(
        ".excalidraw__canvas.interactive",
      );
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      source.dispatchEvent(new WheelEvent("wheel", event));
    };
    stage.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => stage.removeEventListener("wheel", wheel, true);
  }, [api]);

  useEffect(() => {
    const source = root.current?.querySelector<HTMLCanvasElement>(
      ".excalidraw__canvas.interactive",
    );
    const target = feedback.current;
    const context = target?.getContext("2d");
    if (!api || !source || !target || !context) return;

    // Keep native feedback above the cards without intercepting their inputs.
    const opacity = source.style.opacity;
    let frame = 0;
    const paint = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!source.width || !source.height) return;
        if (target.width !== source.width) target.width = source.width;
        if (target.height !== source.height) target.height = source.height;
        context.clearRect(0, 0, target.width, target.height);
        context.drawImage(source, 0, 0);
        source.style.opacity = "0";
      });
    };
    const unsubscribe = api.onChange(paint);
    paint();
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      source.style.opacity = opacity;
    };
  }, [api]);

  const filesForScene = useCallback(
    async (elements: readonly ExcalidrawElement[]) => {
      await Promise.all(
        elements
          .filter((element) => element.type === "image")
          .map(async (element: ExcalidrawImageElement) => {
            if (!element.fileId || cachedFiles.current[element.fileId]) return;
            const shape = editor.getShape(shapeIdForElement(editor, element));
            const asset = shape?.props.assetId
              ? store.get(shape.props.assetId)
              : undefined;
            const source = shape?.props.src || asset?.props?.src;
            if (!source) return;
            const id = element.fileId;
            if (!loadingFiles.current.has(id))
              loadingFiles.current.set(
                id,
                (async () => {
                  const blob = await blobForSource(source);
                  const dataURL = await blobAsDataURL(blob);
                  cachedFiles.current[id] = {
                    id,
                    dataURL: dataURL as BinaryFiles[string]["dataURL"],
                    mimeType: blob.type as BinaryFiles[string]["mimeType"],
                    created: 1,
                  };
                })().catch(() => {
                  loadingFiles.current.delete(id);
                  showToast({
                    title: resourceT.current(
                      "results.image.imageCannotBeLoaded",
                    ),
                    description: resourceT.current("canvas.youCanKeepEditing"),
                    variant: "destructive",
                  });
                }),
              );
            await loadingFiles.current.get(id);
          }),
      );
      return cachedFiles.current;
    },
    [editor, store, showToast],
  );

  useEffect(() => {
    let active = true;
    const unmount = editor.mount({
      container: root.current!,
      setViewport: (viewport) =>
        apiRef.current?.updateScene({
          appState: {
            scrollX: viewport.x / viewport.zoom,
            scrollY: viewport.y / viewport.zoom,
            zoom: { value: viewport.zoom as AppState["zoom"]["value"] },
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        }),
      ...nativeExporter(editor, async () => {
        const elements = sceneFromEditor(editor);
        const files = await filesForScene(elements);
        return {
          elements,
          files: { ...apiRef.current?.getFiles(), ...files },
          appState: apiRef.current?.getAppState() || {},
        };
      }),
    });
    mountOptions.onMount(editor);
    const elements = sceneFromEditor(editor);
    const promise = (async () => {
      const files = await filesForScene(elements);
      let libraryItems = [];
      try {
        libraryItems = JSON.parse(
          localStorage.getItem("huayu:whiteboard-library") || "[]",
        );
      } catch {
        /* Local library corruption does not affect the board. */
      }
      return {
        elements,
        files,
        libraryItems,
        appState: {
          theme: mountOptions.theme,
          scrollX: editor.session.camera.x,
          scrollY: editor.session.camera.y,
          zoom: { value: editor.session.camera.z as AppState["zoom"]["value"] },
          currentItemFontFamily: 2,
          currentItemRoughness: 0,
          currentItemStrokeColor: "#000000",
          currentItemStrokeWidth: 2,
          currentItemStartArrowhead: null,
          currentItemEndArrowhead: "triangle",
          viewBackgroundColor: "#f8f8f7",
        },
      } as ExcalidrawInitialDataState;
    })();
    if (active) setInitialData(promise);
    return () => {
      active = false;
      unmount();
    };
  }, [editor, filesForScene, mountOptions]);

  useLayoutEffect(() => {
    const stage = root.current;
    const native = stage?.querySelector<HTMLElement>(".excalidraw");
    const slot = stage?.querySelector<HTMLElement>(
      ".board-toolbar-native-menu-slot",
    );
    if (!api || !stage || !native || !slot) return;
    let menuParent: HTMLElement | null = null;
    const positionMenu = () => {
      const button =
        native.querySelector<HTMLButtonElement>(".main-menu-trigger");
      const host = button?.parentElement;
      if (!button || !host) return;
      const anchor = slot.getBoundingClientRect();
      const bounds = stage.getBoundingClientRect();
      const parent = button.offsetParent;
      if (!(parent instanceof HTMLElement)) return;
      if (parent !== menuParent) {
        if (menuParent) resize.unobserve(menuParent);
        menuParent = parent;
        resize.observe(parent);
      }
      const origin = parent.getBoundingClientRect();
      stage.style.setProperty("--board-stage-height", `${bounds.height}px`);
      button.style.left = `${anchor.left - origin.left - parent.clientLeft + parent.scrollLeft}px`;
      button.style.top = `${anchor.top - origin.top - parent.clientTop + parent.scrollTop}px`;
      button.style.width = `${anchor.width}px`;
      button.style.height = `${anchor.height}px`;
      host.style.setProperty(
        "--board-menu-available-height",
        `${Math.max(0, bounds.bottom - anchor.bottom - 20)}px`,
      );
      button.dataset.huayuMenuPositioned = "true";
      button.setAttribute("aria-label", t("canvas.canvasMenu"));
      button.title = t("canvas.canvasMenu");
      const popup = host.querySelector<HTMLElement>(".dropdown-menu");
      if (popup) {
        const popupParent = popup.offsetParent;
        if (!(popupParent instanceof HTMLElement)) return;
        const popupOrigin = popupParent.getBoundingClientRect();
        const width = popup.getBoundingClientRect().width;
        const left = Math.max(
          bounds.left + 12,
          Math.min(anchor.right - width, bounds.right - width - 12),
        );
        popup.style.left = `${left - popupOrigin.left - popupParent.clientLeft + popupParent.scrollLeft}px`;
        popup.style.top = `${anchor.bottom + 8 - popupOrigin.top - popupParent.clientTop + popupParent.scrollTop}px`;
      }
    };
    let frame = 0;
    const scheduleMenuPosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionMenu);
    };
    let width = stage.clientWidth;
    let height = stage.clientHeight;
    const resize = new ResizeObserver(() => {
      if (stage.clientWidth !== width || stage.clientHeight !== height) {
        width = stage.clientWidth;
        height = stage.clientHeight;
        api.updateScene({
          appState: { openMenu: null, openPopup: null },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      scheduleMenuPosition();
    });
    resize.observe(stage);
    resize.observe(slot);
    const actions = slot.closest(".board-toolbar-actions");
    if (actions) resize.observe(actions);
    const mutations = new MutationObserver(scheduleMenuPosition);
    mutations.observe(native, { childList: true, subtree: true });
    stage.addEventListener("board-tool-dock-layout", scheduleMenuPosition);
    positionMenu();
    return () => {
      stage.removeEventListener("board-tool-dock-layout", scheduleMenuPosition);
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [api, langCode, t]);

  useEffect(() => {
    if (!api) return;
    let generation = 0;
    const paintScene = (entry: ChangeEntry) => {
      if (bridgePhase.current !== "ready") return;
      if (entry.scope === "session") {
        const state = api.getAppState();
        const selected = Object.fromEntries(
          editor
            .getSelectedShapeIds()
            .map((id) => [
              editor.getShape(id)?.props.excalidraw?.id || id,
              true,
            ]),
        );
        const currentTool = editor.getCurrentToolId();
        const nextTool =
          currentTool === "select"
            ? "selection"
            : currentTool === "draw"
              ? "freedraw"
              : currentTool;
        if (
          nextTool !== state.activeTool.type &&
          [
            "selection",
            "freedraw",
            "arrow",
            "text",
            "hand",
            "eraser",
            "frame",
            "line",
          ].includes(nextTool)
        )
          api.setActiveTool({
            type: nextTool as
              | "selection"
              | "freedraw"
              | "arrow"
              | "text"
              | "hand"
              | "eraser"
              | "frame"
              | "line",
          });
        if (
          JSON.stringify(state.selectedElementIds) !==
            JSON.stringify(selected) &&
          Object.keys(selected).every((id) =>
            api.getSceneElements().some((element) => element.id === id),
          )
        )
          api.updateScene({
            appState: { selectedElementIds: selected },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
      }
      const nextPage = editor.getCurrentPageId();
      if (entry.scope !== "document" && nextPage === page.current) return;
      const current = ++generation;
      const preview =
        entry.source === "remote" && collaboration?.isApplyingPreview;
      const next = sceneFromEditor(editor);
      void filesForScene(next)
        .then((files) => {
          if (current !== generation) return;
          const changedPage = page.current !== nextPage;
          page.current = nextPage;
          const localScene = api.getSceneElementsIncludingDeleted();
          const removed = new Set(
            Object.values(entry.changes.removed)
              .filter(
                (record) =>
                  record.typeName === "shape" && !editor.getShape(record.id),
              )
              .map((record) => record.id),
          );
          const tombstones = preview
            ? localScene
                .filter(
                  (element) =>
                    removed.has(element.customData?.huayu?.id || element.id) ||
                    (element.type === "text" &&
                      element.containerId &&
                      removed.has(element.customData?.huayuLabelFor)),
                )
                .map((element) => newElementWith(element, { isDeleted: true }))
            : [];
          let restored = restoreElements(
            [...sceneFromEditor(editor), ...tombstones],
            preview ? localScene : null,
            {
              repairBindings: true,
            },
          );
          if (preview)
            restored = reconcileElements(
              localScene,
              restored as unknown as Parameters<typeof reconcileElements>[1],
              api.getAppState(),
            );
          lastFingerprint.current = fingerprint(restored);
          bridgePhase.current = "applying-store";
          try {
            if (preview)
              store.mergeRemoteChanges(() =>
                applyNativeScene(editor, restored),
              );
            api.addFiles(Object.values(files));
            if (!changedPage && entry.source === "user") {
              const changedIds = new Set(
                [
                  ...Object.values(entry.changes.added),
                  ...Object.values(entry.changes.updated).map(
                    ([, record]) => record,
                  ),
                  ...Object.values(entry.changes.removed),
                ].flatMap((record) =>
                  record.typeName === "shape"
                    ? [record.id]
                    : record.typeName === "binding"
                      ? [record.fromId]
                      : [],
                ),
              );
              api.updateScene({
                elements: sceneBeforeLocalChange(
                  api.getSceneElements(),
                  restored,
                  changedIds,
                ),
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            }
            api.updateScene({
              elements: restored,
              appState: changedPage
                ? {
                    scrollX: editor.session.camera.x,
                    scrollY: editor.session.camera.y,
                    zoom: {
                      value: editor.session.camera
                        .z as AppState["zoom"]["value"],
                    },
                    selectedElementIds: {},
                  }
                : {
                    scrollX: api.getAppState().scrollX,
                    scrollY: api.getAppState().scrollY,
                    zoom: api.getAppState().zoom,
                    selectedElementIds: Object.fromEntries(
                      editor
                        .getSelectedShapeIds()
                        .map((id) => [
                          editor.getShape(id)?.props.excalidraw?.id || id,
                          true,
                        ]),
                    ),
                  },
              captureUpdate:
                changedPage || entry.source === "remote"
                  ? CaptureUpdateAction.NEVER
                  : CaptureUpdateAction.IMMEDIATELY,
            });
            if (changedPage) api.history.clear();
          } finally {
            bridgePhase.current = "ready";
          }
        })
        .catch((error) =>
          showToast({
            title: resourceT.current("canvas.cannotLoadCanvasResources"),
            description: error.message,
            variant: "destructive",
          }),
        );
    };
    const unsubscribe = store.listen(paintScene);
    repaintFromStore.current = () =>
      paintScene({
        source: "remote",
        scope: "document",
        changes: { added: {}, updated: {}, removed: {} },
      });
    if (bridgePhase.current === "ready") repaintFromStore.current();
    return () => {
      generation++;
      unsubscribe();
      repaintFromStore.current = null;
    };
  }, [api, store, editor, filesForScene, showToast, collaboration]);

  async function exportPage(format: "png" | "svg" | "excalidraw") {
    if (!api) return;
    try {
      const ids = [...editor.getCurrentPageShapeIds()];
      const name =
        editor.pages.find((page) => page.id === editor.getCurrentPageId())
          ?.name || appT("canvas.canvas");
      if (format === "png")
        downloadBlob(
          (
            await editor.toImage(ids, {
              format: "png",
              background: true,
              padding: 24,
            })
          ).blob,
          `${name}.png`,
        );
      else if (format === "svg") {
        const svg = await editor.getSvgString(ids, {
          background: true,
          padding: 24,
        });
        if (!svg)
          throw new Error(t("canvas.theresNothingOnTheCanvasToExportYet"));
        downloadBlob(
          new Blob([svg.svg], { type: "image/svg+xml" }),
          `${name}.svg`,
        );
      } else {
        const scene = await exportScene(
          editor,
          sceneFromEditor(editor),
          api.getFiles(),
          ids,
        );
        for (const element of scene.elements) {
          const props = element.customData?.huayu?.props;
          if (!props) continue;
          const source =
            props.src ||
            (props.assetId ? editor.store.get(props.assetId)?.props?.src : "");
          if (
            source &&
            typeof source === "string" &&
            !source.startsWith("data:")
          )
            props.src = await blobAsDataURL(await blobForSource(source));
        }
        downloadBlob(
          new Blob(
            [
              JSON.stringify({
                type: "excalidraw",
                version: 2,
                source: "huayu",
                name,
                ...scene,
                appState: {
                  viewBackgroundColor: api.getAppState().viewBackgroundColor,
                },
              }),
            ],
            { type: "application/json" },
          ),
          `${name}.excalidraw`,
        );
      }
    } catch (error) {
      showToast({
        title: t("canvas.exportFailed"),
        description:
          error instanceof Error ? error.message : t("common.tryAgain"),
        variant: "destructive",
      });
    }
  }

  function forwardNativeEvent(event: SyntheticEvent) {
    const source = root.current?.querySelector<HTMLCanvasElement>(
      ".excalidraw__canvas.interactive",
    );
    if (!source) return;
    source.closest<HTMLElement>(".excalidraw")?.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
    source.dispatchEvent(
      event.nativeEvent instanceof PointerEvent
        ? new PointerEvent(event.nativeEvent.type, event.nativeEvent)
        : new MouseEvent(event.nativeEvent.type, event.nativeEvent),
    );
  }

  function boardEventTarget(event: Pick<Event, "target" | "defaultPrevented">) {
    const target = event.target;
    if (
      !api ||
      event.defaultPrevented ||
      !(target instanceof Element) ||
      !root.current?.contains(target) ||
      target.closest(textOrUiTarget)
    )
      return;
    return target;
  }

  function prepareNativeClipboard(event: ReactClipboardEvent<HTMLDivElement>) {
    const target = boardEventTarget(event);
    const stage = root.current;
    if (!target || !stage) return;
    const native = stage.querySelector<HTMLElement>(".excalidraw");
    if (!native) return;
    const selection = window.getSelection();
    if (
      event.type !== "paste" &&
      selection &&
      !selection.isCollapsed &&
      selection.anchorNode?.parentElement?.closest(".board-component")
    ) {
      // Let the browser copy selected card text instead of the selected shapes.
      event.stopPropagation();
      return;
    }
    const state = api!.getAppState();
    if (
      state.openDialog ||
      state.openMenu ||
      state.openPopup ||
      state.contextMenu ||
      state.editingTextElement
    )
      return;
    native.focus({ preventScroll: true });
    if (event.type === "paste") {
      // The native paste handler checks elementFromPoint before reading the clipboard.
      // Cards temporarily yield hit testing so the original event can reach that handler.
      stage.dataset.nativePaste = "true";
    }
  }

  function copyCardVisual(format: "png" | "svg") {
    if (!api) return false;
    const selected = editor.getSelectedShapeIds();
    const ids = selected.length
      ? selected
      : [...editor.getCurrentPageShapeIds()];
    if (
      !ids.some((id) => {
        const shape = editor.getShape(id);
        return (
          (shape && isCustomElement(shape)) ||
          editor.descendants(id).some(isCustomElement)
        );
      })
    )
      return false;
    const state = api.getAppState();
    api.updateScene({
      appState: { contextMenu: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    root.current
      ?.querySelector<HTMLElement>(".excalidraw")
      ?.focus({ preventScroll: true });
    void (async () => {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error(t("results.thisBrowserCannotCopyImages"));
      // Pass a promise to ClipboardItem while the original user gesture is active.
      const content =
        format === "png"
          ? editor
              .toImage(ids, {
                format: "png",
                background: state.exportBackground,
                scale: state.exportScale,
              })
              .then((value) => value.blob)
          : editor
              .getSvgString(ids, { background: state.exportBackground })
              .then((value) => {
                if (!value)
                  throw new Error(
                    t("canvas.theresNothingOnTheCanvasToExportYet"),
                  );
                return new Blob([value.svg], { type: "text/plain" });
              });
      await navigator.clipboard.write([
        new ClipboardItem({
          [format === "png" ? "image/png" : "text/plain"]: content,
        }),
      ]);
      showToast({
        title: t(
          format === "png" ? "results.imageCopied" : "results.contentCopied",
        ),
      });
    })().catch((error) =>
      showToast({
        title: t("results.cannotCopy"),
        description: error.message,
        variant: "destructive",
      }),
    );
    return true;
  }

  function onChange(
    elements: readonly ExcalidrawElement[],
    state: AppState,
    files: BinaryFiles,
  ) {
    if (
      state.isLoading ||
      bridgePhase.current === "applying-store" ||
      bridgePhase.current === "applying-native"
    )
      return;
    const repaired =
      !state.newElement &&
      !state.multiElement &&
      !state.selectedElementsAreBeingDragged &&
      !state.selectedLinearElement?.isDragging &&
      !state.isResizing &&
      !state.isRotating
        ? repairFrameArrowMembership(elements)
        : null;
    if (repaired) elements = repaired;
    collaboration?.updatePresence({
      selectedElementIds: { ...state.selectedElementIds },
    });
    cachedFiles.current = { ...cachedFiles.current, ...files };
    const value = fingerprint(elements);
    if (
      root.current &&
      (value !== lastFingerprint.current || state.errorMessage)
    )
      delete root.current.dataset.nativePaste;
    if (bridgePhase.current === "initializing") {
      lastFingerprint.current = value;
      bridgePhase.current = "ready";
      // The socket may receive a scene while Excalidraw is still loading.
      repaintFromStore.current?.();
      mountOptions.onReady?.();
    }
    bridgePhase.current = "applying-native";
    try {
      if (repaired)
        api?.updateScene({
          elements: repaired,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      if (lastFingerprint.current !== value) {
        lastFingerprint.current = value;
        for (const element of elements)
          if (
            element.type === "image" &&
            element.fileId &&
            files[element.fileId]
          ) {
            const file = files[element.fileId];
            const shape = editor.getShape(shapeIdForElement(editor, element));
            const existingAsset =
              shape?.props.assetId &&
              (shape.props.excalidraw?.fileId === element.fileId ||
                !shape.props.excalidraw)
                ? shape.props.assetId
                : undefined;
            const id = existingAsset || `asset:excalidraw:${file.id}`;
            if (!store.get(id))
              store.put([
                {
                  id,
                  typeName: "asset",
                  type: "image",
                  props: {
                    src: file.dataURL,
                    name: appT("canvas.canvasImage"),
                    mimeType: file.mimeType,
                  },
                  meta: {},
                },
              ]);
            if (
              !uploaded.current.has(file.id) &&
              store.get(id)?.props?.src?.startsWith("data:")
            )
              uploaded.current.set(
                file.id,
                (async () => {
                  const asset = await uploadAsset(
                    await blobForSource(file.dataURL),
                    "whiteboard-image",
                  );
                  const current = store.get(id);
                  if (current)
                    store.put([
                      {
                        ...current,
                        props: { ...current.props, src: asset.url },
                      },
                    ]);
                })().catch(() => {
                  uploaded.current.delete(file.id);
                }),
              );
          }
        applyNativeScene(editor, elements);
      }
      const selection = selectedShapesFromScene(
        editor,
        elements,
        state.selectedElementIds,
      );
      if (root.current)
        root.current.dataset.componentSelection = String(
          selection.length > 0 &&
            selection.some((id) => {
              const shape = editor.getShape(id);
              return shape && isCustomElement(shape);
            }) &&
            selection.every((id) => {
              const shape = editor.getShape(id);
              return (
                shape && (isCustomElement(shape) || shape.type === "arrow")
              );
            }),
        );
      if (
        JSON.stringify(selection) !==
        JSON.stringify(editor.getSelectedShapeIds())
      )
        editor.select(...selection);
      const currentTool =
        toolMap[state.activeTool.type] || state.activeTool.type;
      if (editor.getCurrentToolId() !== currentTool)
        editor.setCurrentTool(currentTool);
      if (tool !== state.activeTool.type) setTool(state.activeTool.type);
      const camera = editor.session.camera;
      if (
        camera.x !== state.scrollX ||
        camera.y !== state.scrollY ||
        camera.z !== state.zoom.value
      )
        editor.setViewport(
          {
            x: state.scrollX * state.zoom.value,
            y: state.scrollY * state.zoom.value,
            zoom: state.zoom.value,
          },
          true,
        );
    } finally {
      bridgePhase.current = "ready";
    }
  }

  return (
    <EditorContext value={editor}>
      <div
        ref={workspace}
        className="huayu-board h-full w-full"
        data-compact={compact || undefined}
        data-tool={tool}
        role="main"
        aria-label={t("canvas.canvas")}
        onDragOverCapture={(event) => {
          if ((event.target as Element).closest("[data-canvas-ui]")) {
            setImageDropTarget(null);
            return;
          }
          if (!event.dataTransfer.types.includes("Files")) return;
          const target = componentAtDropPoint(editor, {
            x: event.clientX,
            y: event.clientY,
          });
          if (target) {
            event.preventDefault();
            event.stopPropagation();
            const allowed =
              target.type === "ai-image" &&
              !target.isLocked &&
              !target.props.isLocked &&
              !pendingImageDrops.current.has(target.id) &&
              !["queued", "running"].includes(
                nodeExecution(editor, target.id).status,
              );
            event.dataTransfer.dropEffect = allowed ? "copy" : "none";
            setImageDropTarget(allowed ? target.id : null);
          } else setImageDropTarget(null);
        }}
        onDragLeaveCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setImageDropTarget(null);
        }}
        onDropCapture={(event) => {
          setImageDropTarget(null);
          if ((event.target as Element).closest("[data-canvas-ui]")) return;
          const file = event.dataTransfer.files[0];
          const target = file
            ? componentAtDropPoint(editor, {
                x: event.clientX,
                y: event.clientY,
              })
            : undefined;
          if (target) {
            event.preventDefault();
            event.stopPropagation();
            if (
              target.type !== "ai-image" ||
              target.isLocked ||
              target.props.isLocked ||
              pendingImageDrops.current.has(target.id) ||
              ["queued", "running"].includes(
                nodeExecution(editor, target.id).status,
              )
            )
              return;
            pendingImageDrops.current.add(target.id);
            void (async () => {
              if (file) {
                const props = await uploadComponentFile("ai-image", file);
                const current = editor.getShape(target.id);
                if (
                  !current ||
                  current.isLocked ||
                  current.props.isLocked ||
                  ["queued", "running"].includes(
                    nodeExecution(editor, target.id).status,
                  )
                )
                  throw new Error(t("assets.targetUnavailable"));
                editor.updateShape({ id: target.id, props });
              }
            })()
              .catch((error: Error) =>
                showToast({
                  title: t("assets.insertFailed"),
                  description: error.message,
                  variant: "destructive",
                }),
              )
              .finally(() => pendingImageDrops.current.delete(target.id));
            return;
          }
        }}
      >
        <div className="board-workspace">
          <div
            ref={root}
            className="board-stage"
            onCopyCapture={prepareNativeClipboard}
            onCutCapture={prepareNativeClipboard}
            onPasteCapture={prepareNativeClipboard}
            onKeyDownCapture={(event) => {
              const target = boardEventTarget(event);
              if (!target || event.nativeEvent.isComposing) return;
              if (
                event.key === "Enter" &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !target.closest("button, a, [role=button], [role=toolbar]")
              ) {
                const selected = editor.getSelectedShapes();
                const shape = selected.length === 1 ? selected[0] : undefined;
                if (
                  shape &&
                  !shape.isLocked &&
                  isCustomElement(shape) &&
                  canInspect(shape)
                ) {
                  // The native rectangle behind the card only handles geometry.
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
              }
              if (
                event.code === "KeyC" &&
                event.altKey &&
                event.shiftKey &&
                copyCardVisual("png")
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onClickCapture={(event) => {
              const stage = root.current;
              const target = event.target;
              if (
                !stage ||
                !(target instanceof Element) ||
                !stage.contains(target)
              )
                return;
              delete stage.dataset.nativePaste;
              const visual = target.closest(
                '.excalidraw .context-menu [data-testid="copyAsPng"], .excalidraw .context-menu [data-testid="copyAsSvg"]',
              );
              if (
                visual &&
                copyCardVisual(
                  visual.getAttribute("data-testid") === "copyAsPng"
                    ? "png"
                    : "svg",
                )
              ) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              if (
                target.closest(
                  '.excalidraw .context-menu [data-testid="paste"]',
                )
              )
                stage.dataset.nativePaste = "true";
            }}
            onKeyDown={(event) => {
              if (root.current) delete root.current.dataset.nativePaste;
              const target = boardEventTarget(event);
              if (
                event.nativeEvent.isComposing ||
                !target ||
                target.closest(".excalidraw") ||
                [
                  "Tab",
                  "Shift",
                  "Control",
                  "Meta",
                  "Alt",
                  "AltGraph",
                  "CapsLock",
                ].includes(event.key) ||
                // Keep keyboard activation and navigation on custom controls.
                ([
                  " ",
                  "Enter",
                  "ArrowUp",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowRight",
                ].includes(event.key) &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey &&
                  target.closest("button, a, [role=button], [role=toolbar]"))
              )
                return;
              const selection = window.getSelection();
              if (
                (event.ctrlKey || event.metaKey) &&
                ["a", "c", "x"].includes(event.key.toLowerCase()) &&
                selection &&
                !selection.isCollapsed &&
                selection.anchorNode?.parentElement?.closest(".board-component")
              )
                return;
              const state = api!.getAppState();
              if (
                state.openDialog ||
                state.openMenu ||
                state.openPopup ||
                state.contextMenu ||
                state.editingTextElement
              )
                return;
              const native =
                root.current?.querySelector<HTMLElement>(".excalidraw");
              if (!native) return;
              native.focus({ preventScroll: true });
              const forwarded = new KeyboardEvent("keydown", {
                key: event.key,
                code: event.code,
                location: event.location,
                repeat: event.repeat,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                bubbles: true,
                cancelable: true,
              });
              native.dispatchEvent(forwarded);
              // C/V still need the browser to issue the real clipboard event.
              if (forwarded.defaultPrevented) event.preventDefault();
              event.stopPropagation();
            }}
            onPointerMoveCapture={(event) => {
              if (root.current) delete root.current.dataset.nativePaste;
              if (
                !(event.target instanceof Element) ||
                !event.target.closest(".board-component")
              )
                return;
              collaboration?.updatePresence({
                pointer: {
                  ...editor.screenToPage({
                    x: event.clientX,
                    y: event.clientY,
                  }),
                  tool: "pointer",
                },
                button: event.buttons ? "down" : "up",
              });
            }}
            onPointerUpCapture={() =>
              collaboration?.updatePresence({ button: "up" })
            }
            onPointerLeave={() =>
              collaboration?.updatePresence({ pointer: null, button: "up" })
            }
            onPointerDownCapture={(event) => {
              if (root.current) delete root.current.dataset.nativePaste;
              const target = event.target;
              const canvas = feedback.current;
              if (
                event.button !== 0 ||
                !canvas ||
                !(target instanceof Element) ||
                !target.closest(".board-component") ||
                target.closest(".connection-button, [data-node-controls]")
              )
                return;

              if (!target.closest(".node-header") || target.closest("button")) {
                // A visible native handle must win over a card behind it.
                const bounds = canvas.getBoundingClientRect();
                const probe = document.createElement("canvas");
                probe.width = probe.height = 1;
                const context = probe.getContext("2d", {
                  willReadFrequently: true,
                });
                if (!context) return;
                context.drawImage(
                  canvas,
                  Math.floor(
                    ((event.clientX - bounds.left) * canvas.width) /
                      bounds.width,
                  ),
                  Math.floor(
                    ((event.clientY - bounds.top) * canvas.height) /
                      bounds.height,
                  ),
                  1,
                  1,
                  0,
                  0,
                  1,
                  1,
                );
                if (!context.getImageData(0, 0, 1, 1).data[3]) return;
              }
              forwardNativeEvent(event);
            }}
            onContextMenuCapture={(event) => {
              const target = boardEventTarget(event);
              if (
                target?.closest(".board-component") &&
                !target.closest(
                  ".connection-button, [data-node-controls], a[href], audio, video, iframe",
                )
              )
                forwardNativeEvent(event);
            }}
            onDoubleClickCapture={(event) => {
              const { currentTarget, target } = event;
              if (
                !(target instanceof Element) ||
                !currentTarget.contains(target)
              )
                return;
              // Forwarding pointerdown lets the native canvas capture the click.
              const hit = currentTarget.ownerDocument.elementFromPoint(
                event.clientX,
                event.clientY,
              );
              if (
                hit?.closest(".node-header") &&
                currentTarget.contains(hit) &&
                !hit.closest("button")
              ) {
                const id = hit.closest<HTMLElement>("[data-component-id]")
                  ?.dataset.componentId;
                const shape = id ? editor.getShape(id) : undefined;
                if (!api || !shape || shape.isLocked || !isComponent(shape))
                  return;
                const elementId = shape.props.excalidraw?.id || shape.id;
                const element = api
                  .getSceneElements()
                  .find((item) => item.id === elementId);
                if (!element) return;
                event.preventDefault();
                event.stopPropagation();
                api.updateScene({
                  appState: {
                    selectedElementIds: { [element.id]: true },
                    selectedGroupIds: {},
                  },
                  captureUpdate: CaptureUpdateAction.NEVER,
                });
                fitBoardElements(currentTarget, api, [element]);
                return;
              }
              if (
                !(target instanceof HTMLCanvasElement) ||
                editor.getCurrentToolId() !== "select"
              )
                return;
              const ids = editor.getSelectedShapeIds();
              const shape =
                ids.length === 1 ? editor.getShape(ids[0]) : undefined;
              if (
                shape &&
                !shape.isLocked &&
                isCustomElement(shape) &&
                canInspect(shape)
              ) {
                // Keep the native rectangle from entering text editing.
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {initialData && (
              <Excalidraw
                initialData={initialData}
                excalidrawAPI={setApi}
                onChange={onChange}
                onPaste={() => {
                  if (root.current) delete root.current.dataset.nativePaste;
                  return true;
                }}
                onDuplicate={(next, previous) => {
                  const existing = new Set(
                    previous.map((element) => element.id),
                  );
                  const elements = new Map(
                    next.map((element) => [element.id, element]),
                  );
                  return next.map((element) => {
                    if (existing.has(element.id)) return element;
                    const metadata = element.customData;
                    if (!metadata) return element;
                    let customData = metadata;
                    if (metadata.huayu)
                      customData = {
                        ...customData,
                        huayu: {
                          ...metadata.huayu,
                          id: shapeIdForElement(editor, element),
                        },
                      };
                    if (metadata.huayuLabelFor && element.type === "text") {
                      const container = element.containerId
                        ? elements.get(element.containerId)
                        : undefined;
                      customData = { ...customData };
                      if (container)
                        customData.huayuLabelFor = shapeIdForElement(
                          editor,
                          container,
                        );
                      else delete customData.huayuLabelFor;
                    }
                    return customData === metadata
                      ? element
                      : newElementWith(element, { customData });
                  });
                }}
                isCollaborating={collaboratorCount > 0}
                onPointerUpdate={({ pointer, button, pointersMap }) => {
                  if (pointersMap.size < 2)
                    collaboration?.updatePresence({ pointer, button });
                }}
                theme={resolved}
                langCode={langCode}
                autoFocus
                aiEnabled={false}
                handleKeyboardGlobally={false}
                validateEmbeddable={(link) =>
                  link.startsWith(INTERNAL_EMBED_PREFIX) ? true : undefined
                }
                renderEmbeddable={() => <div />}
                onLinkOpen={(element, event) => {
                  if (element.link?.startsWith(INTERNAL_EMBED_PREFIX)) {
                    event.preventDefault();
                    const id = shapeIdForElement(editor, element);
                    editor.select(id);
                  }
                }}
                onLibraryChange={(items) => {
                  try {
                    localStorage.setItem(
                      "huayu:whiteboard-library",
                      JSON.stringify(items),
                    );
                  } catch {
                    showToast({
                      title: t("canvas.cannotSaveLibrary"),
                      description: t("canvas.browserStorageIsFull"),
                      variant: "destructive",
                    });
                  }
                }}
                UIOptions={{
                  dockedSidebarBreakpoint: Number.MAX_SAFE_INTEGER,
                  canvasActions: {
                    loadScene: false,
                    clearCanvas: false,
                    toggleTheme: false,
                    export: false,
                    saveAsImage: false,
                    saveToActiveFile: false,
                  },
                }}
              >
                <MainMenu>
                  <NativeMenuItems
                    language={preference}
                    onExport={exportPage}
                    onLanguageChange={setPreference}
                  >
                    {menuItems}
                  </NativeMenuItems>
                </MainMenu>
                {api && <StylesPanel stage={root} api={api} disabled={false} />}
                {api && <ToolbarTools stage={root} api={api} tool={tool} />}
              </Excalidraw>
            )}
            {children}
            {api && <BoardComponents imageDropTarget={imageDropTarget} />}
            {api && (
              <canvas
                ref={feedback}
                className="board-native-feedback"
                aria-hidden="true"
              />
            )}
            {api && <BoardExecution />}
            {api && <BoardConnections />}
            {api && (
              <ZoomMenu
                stage={root}
                api={api}
                boardEventTarget={boardEventTarget}
              />
            )}
            {api && (
              <NodeInspector
                projectId={projectId}
                initialId={initialInspectId}
              />
            )}
            {toolbar && (
              <div
                className="board-toolbar"
                data-canvas-ui
                role="group"
                aria-label={t("canvas.canvasActions")}
              >
                {toolbar}
              </div>
            )}
          </div>
        </div>
      </div>
    </EditorContext>
  );
}
