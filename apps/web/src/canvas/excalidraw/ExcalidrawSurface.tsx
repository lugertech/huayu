import { t, useLocale } from "@/i18n";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Excalidraw,
  CaptureUpdateAction,
  MainMenu,
  restoreElements,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/excalidraw/element/types";
import { Editor, EditorContext, type CanvasStore } from "@/canvas/editor";
import { useToast } from "@/Components/common/ToastProvider";
import { useTheme } from "@/lib/theme";
import { blobAsDataURL, blobForSource } from "@/api/backend";
import { uploadAsset, downloadBlob } from "@/api/client";
import { api as localApi } from "@/api/client";
import {
  ASSET_DRAG_TYPE,
  insertLibraryImage,
  type LibraryAsset,
} from "@/features/asset-library/assets";
import {
  applyNativeScene,
  INTERNAL_EMBED_PREFIX,
  isCustomElement,
  sceneFromEditor,
  shapeIdForElement,
  selectedShapesFromScene,
  withoutTransientMetadata,
  sceneBeforeLocalChange,
} from "./scene";
import { BoardTools } from "./BoardTools";
import { BoardComponents } from "./BoardComponents";
import { SelectionComposer } from "./SelectionComposer";
import { NodeInspector } from "./NodeInspector";
import { BoardConnections } from "./BoardConnections";
import { BoardExecution } from "./BoardExecution";
import { resultKind } from "@/workflow/results";
import { requestInspection } from "@/workflow/context";
import { nativeExporter, exportScene } from "./export";
import "@excalidraw/excalidraw/index.css";
import "./whiteboard.css";

const AssetBrowser = lazy(() =>
  import("@/features/asset-library/AssetBrowser").then((module) => ({
    default: module.AssetBrowser,
  })),
);

const fingerprint = (elements: readonly ExcalidrawElement[]) =>
  JSON.stringify(elements.map(withoutTransientMetadata));
const toolMap: Record<string, string> = {
  selection: "select",
  freedraw: "draw",
  rectangle: "geo",
  ellipse: "geo",
  diamond: "geo",
};

export function ExcalidrawSurface({
  store,
  projectId,
  initialInspectId,
  onMount,
  onReady,
  children,
  topLeft,
  topRight,
  assetsOpen = false,
  onAssetsOpenChange,
}: {
  store: CanvasStore;
  projectId: string;
  initialInspectId?: string;
  onMount: (editor: Editor) => void;
  onReady?: () => void;
  children?: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  assetsOpen?: boolean;
  onAssetsOpenChange?: (open: boolean) => void;
}) {
  const locale = useLocale();
  const [editor] = useState(() => new Editor(store));
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialData, setInitialData] =
    useState<Promise<ExcalidrawInitialDataState> | null>(null);
  const [tool, setTool] = useState<AppState["activeTool"]["type"]>("selection");
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
  const applying = useRef(false);
  const initialized = useRef(false);
  const lastFingerprint = useRef("");
  const page = useRef(editor.getCurrentPageId());
  const cachedFiles = useRef<BinaryFiles>({});
  const loadingFiles = useRef(new Map<string, Promise<void>>());
  const uploaded = useRef(new Map<string, Promise<void>>());
  apiRef.current = api;
  useEffect(() => {
    if (assetsOpen && api?.getAppState().openSidebar)
      api.updateScene({
        appState: { openSidebar: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
  }, [api, assetsOpen]);
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
                    title: t("results.image.imageCannotBeLoaded"),
                    description: t("canvas.youCanKeepEditing"),
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

  useEffect(() => {
    root.current
      ?.querySelector(".main-menu-trigger")
      ?.setAttribute("aria-label", t("canvas.canvasMenu"));
  }, [api, locale]);
  useEffect(() => {
    if (!api) return;
    let generation = 0;
    const unsubscribe = store.listen((entry) => {
      if (applying.current || !initialized.current) return;
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
      const next = sceneFromEditor(editor);
      void filesForScene(next)
        .then((files) => {
          if (current !== generation) return;
          const changedPage = page.current !== nextPage;
          page.current = nextPage;
          const restored = restoreElements(next, null, {
            repairBindings: true,
          });
          lastFingerprint.current = fingerprint(restored);
          applying.current = true;
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
                    value: editor.session.camera.z as AppState["zoom"]["value"],
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
          applying.current = false;
        })
        .catch((error) =>
          showToast({
            title: t("canvas.cannotLoadCanvasResources"),
            description: error.message,
            variant: "destructive",
          }),
        );
    });
    return () => {
      generation++;
      unsubscribe();
    };
  }, [api, store, editor, filesForScene, showToast]);

  async function exportPage(format: "png" | "svg" | "excalidraw") {
    if (!api) return;
    try {
      const ids = [...editor.getCurrentPageShapeIds()];
      const name =
        editor.pages.find((page) => page.id === editor.getCurrentPageId())
          ?.name || t("canvas.canvas");
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
    event.preventDefault();
    event.stopPropagation();
    source.dispatchEvent(
      event.nativeEvent instanceof PointerEvent
        ? new PointerEvent(event.nativeEvent.type, event.nativeEvent)
        : new MouseEvent(event.nativeEvent.type, event.nativeEvent),
    );
  }

  function onChange(
    elements: readonly ExcalidrawElement[],
    state: AppState,
    files: BinaryFiles,
  ) {
    if (state.isLoading || applying.current) return;
    cachedFiles.current = { ...cachedFiles.current, ...files };
    const value = fingerprint(elements);
    if (!initialized.current) {
      lastFingerprint.current = value;
      initialized.current = true;
      mountOptions.onReady?.();
    }
    applying.current = true;
    try {
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
                    name: t("canvas.canvasImage"),
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
      applying.current = false;
    }
  }

  return (
    <EditorContext value={editor}>
      <div
        ref={workspace}
        className="huayu-board h-full w-full"
        data-compact={compact || undefined}
        data-tool={tool}
        aria-label={t("canvas.canvas")}
        onDragOverCapture={(event) => {
          if ((event.target as Element).closest("[data-canvas-ui]")) return;
          if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = root.current?.contains(
              event.target as Node,
            )
              ? "copy"
              : "none";
          }
        }}
        onDropCapture={(event) => {
          if ((event.target as Element).closest("[data-canvas-ui]")) return;
          const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE);
          if (assetId) {
            event.preventDefault();
            event.stopPropagation();
            if (!root.current?.contains(event.target as Node)) return;
            const point = editor.screenToPage({
              x: event.clientX,
              y: event.clientY,
            });
            void localApi<LibraryAsset>(
              `/api/library/assets/${encodeURIComponent(assetId)}`,
            )
              .then((asset) => {
                insertLibraryImage(editor, asset, point);
              })
              .catch((error) =>
                showToast({
                  title: t("assets.insertFailed"),
                  description: error.message,
                  variant: "destructive",
                }),
              );
            return;
          }
        }}
      >
        <div className="board-workspace">
          <div
            ref={root}
            className="board-stage"
            onPointerDownCapture={(event) => {
              const target = event.target;
              const canvas = feedback.current;
              if (
                event.button !== 0 ||
                !canvas ||
                !(target instanceof Element) ||
                !target.closest(".board-component") ||
                target.closest(".connection-button, .node-actionbar")
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
              if (
                event.target instanceof Element &&
                event.target.closest(".node-header") &&
                !event.target.closest("button")
              )
                forwardNativeEvent(event);
            }}
            onDoubleClickCapture={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest(".node-header") &&
                !event.target.closest("button")
              ) {
                forwardNativeEvent(event);
                return;
              }
              if (
                !(event.target instanceof HTMLCanvasElement) ||
                editor.getCurrentToolId() !== "select"
              )
                return;
              const ids = editor.getSelectedShapeIds();
              const shape =
                ids.length === 1 ? editor.getShape(ids[0]) : undefined;
              if (shape && resultKind(shape)) {
                event.preventDefault();
                event.stopPropagation();
                requestInspection(editor, shape.id);
              }
            }}
          >
            {initialData && (
              <Excalidraw
                initialData={initialData}
                excalidrawAPI={setApi}
                onChange={onChange}
                theme={resolved}
                langCode={locale}
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
                    toggleTheme: false,
                    export: false,
                    saveAsImage: false,
                    saveToActiveFile: false,
                  },
                }}
              >
                <MainMenu>
                  <MainMenu.DefaultItems.LoadScene />
                  <MainMenu.Item onSelect={() => void exportPage("excalidraw")}>
                    {t("canvas.exportExcalidrawFile")}
                  </MainMenu.Item>
                  <MainMenu.Item onSelect={() => void exportPage("png")}>
                    {t("canvas.export.pngImage")}
                  </MainMenu.Item>
                  <MainMenu.Item onSelect={() => void exportPage("svg")}>
                    {t("canvas.export.svgImage")}
                  </MainMenu.Item>
                  <MainMenu.Separator />
                  <MainMenu.Item
                    onSelect={() =>
                      api?.updateScene({
                        appState: { openDialog: { name: "commandPalette" } },
                        captureUpdate: CaptureUpdateAction.NEVER,
                      })
                    }
                  >
                    {t("canvas.quickCommands")}
                  </MainMenu.Item>
                  <MainMenu.Item
                    onSelect={() =>
                      api?.updateScene({
                        appState: {
                          openSidebar:
                            api.getAppState().openSidebar?.name === "default" &&
                            api.getAppState().openSidebar?.tab === "search"
                              ? null
                              : { name: "default", tab: "search" },
                        },
                        captureUpdate: CaptureUpdateAction.NEVER,
                      })
                    }
                  >
                    {t("canvas.findContent")}
                  </MainMenu.Item>
                  <MainMenu.DefaultItems.ClearCanvas />
                  <MainMenu.DefaultItems.ChangeCanvasBackground />
                </MainMenu>
              </Excalidraw>
            )}
            {children}
            {api && <BoardComponents />}
            {api && (
              <canvas
                ref={feedback}
                className="board-native-feedback"
                aria-hidden="true"
              />
            )}
            {api && <BoardExecution />}
            {api && <BoardConnections />}
            {api && <BoardTools api={api} tool={tool} />}
            {api && (
              <NodeInspector
                projectId={projectId}
                initialId={initialInspectId}
              />
            )}
            {topLeft && (
              <div
                className="board-corner-tools board-corner-left"
                data-canvas-ui
              >
                {topLeft}
              </div>
            )}
            {topRight && (
              <div
                className="board-corner-tools board-corner-right"
                data-canvas-ui
              >
                {topRight}
              </div>
            )}
            {assetsOpen && (
              <aside
                className="board-asset-panel"
                data-canvas-ui
                aria-label={t("assets.title")}
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {t("common.loading")}
                    </div>
                  }
                >
                  <AssetBrowser
                    picker
                    onClose={() => onAssetsOpenChange?.(false)}
                    onInsert={(asset) => {
                      insertLibraryImage(editor, asset);
                      onAssetsOpenChange?.(false);
                      showToast({ title: t("assets.inserted") });
                    }}
                    onShapeLibrary={() => {
                      onAssetsOpenChange?.(false);
                      api?.toggleSidebar({ name: "default", tab: "library" });
                    }}
                  />
                </Suspense>
              </aside>
            )}
          </div>
        </div>
        {api && <SelectionComposer projectId={projectId} />}
      </div>
    </EditorContext>
  );
}
