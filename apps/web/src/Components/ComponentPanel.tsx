import { t, useLocale } from "@/i18n";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EditorContext, useEditor, type Editor } from "@/canvas/editor";
import { ComponentDrag, createCanvasShape } from "@/canvas/component-creation";
import { NativeSVG } from "@/canvas/engine/visual";
import { BoardComponents } from "@/canvas/excalidraw/BoardComponents";
import { ChevronLeft, ChevronRight, Download, Images } from "lucide-react";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { useIsMobile } from "@/lib/use-mobile";
import { COMPONENT_CONFIGS, type ComponentType } from "@/config/components";
import { FileDownloadDrawer } from "./FileDownloadDrawer";

function ComponentPreview() {
  const editor = useEditor();
  const shape = editor.getCurrentPageShapes()[0];
  const camera = editor.session.camera;
  return (
    <div className="board-component-preview" aria-hidden="true" inert>
      <BoardComponents />
      {shape?.type === "frame" && (
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <g
            transform={`translate(${(shape.x + camera.x) * camera.z} ${(shape.y + camera.y) * camera.z}) scale(${camera.z})`}
          >
            <NativeSVG shape={shape} dark={editor.theme === "dark"} />
          </g>
        </svg>
      )}
    </div>
  );
}

export function ComponentPanel({
  onOpenLibrary,
  libraryOpen = false,
}: {
  onOpenLibrary?: () => void;
  libraryOpen?: boolean;
}) {
  useLocale();
  const editor = useEditor();
  const mobile = useIsMobile();
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const compact = collapsed ?? mobile;
  const [filesOpen, setFilesOpen] = useState(false);
  const [preview, setPreview] = useState<Editor | null>(null);
  const gesture = useRef<{
    drag: ComponentDrag;
    pointerId: number;
    button: HTMLButtonElement;
  } | null>(null);

  const clearGesture = useCallback((updateView = true) => {
    const active = gesture.current;
    gesture.current = null;
    active?.drag.cancel();
    if (active?.button.hasPointerCapture(active.pointerId))
      active.button.releasePointerCapture(active.pointerId);
    if (updateView) setPreview(null);
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !gesture.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearGesture();
    };
    const blur = () => clearGesture();
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("blur", blur);
      clearGesture(false);
    };
  }, [clearGesture]);

  function pointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    type: ComponentType,
  ) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    gesture.current = {
      drag: new ComponentDrag(editor, type, {
        x: event.clientX,
        y: event.clientY,
      }),
      pointerId: event.pointerId,
      button: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.drag.move({ x: event.clientX, y: event.clientY });
    setPreview(active.drag.preview);
  }

  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    if (active.drag.preview) {
      const valid =
        !!hit &&
        !!editor.container?.contains(hit) &&
        !hit.closest("[data-canvas-ui]");
      active.drag.finish({ x: event.clientX, y: event.clientY }, valid);
    } else if (hit && active.button.contains(hit))
      createCanvasShape(editor, active.drag.type);
    clearGesture();
  }

  return (
    <>
      <aside
        className="board-component-palette"
        data-collapsed={compact}
        aria-label={t("canvas.components.palette")}
        data-canvas-ui
      >
        <Button
          variant="ghost"
          className="board-palette-toggle"
          aria-expanded={!compact}
          aria-label={
            compact
              ? t("canvas.components.expandPalette")
              : t("canvas.components.collapsePalette")
          }
          title={
            compact
              ? t("canvas.components.expandPalette")
              : t("canvas.components.collapsePalette")
          }
          onClick={() => setCollapsed(!compact)}
        >
          {!compact && <span>{t("canvas.components.hide")}</span>}
          {compact ? <ChevronRight /> : <ChevronLeft />}
        </Button>
        <div className="board-palette-items">
          {(Object.keys(COMPONENT_CONFIGS) as ComponentType[]).map((type) => {
            const config = COMPONENT_CONFIGS[type];
            const Icon = config.icon;
            return (
              <Tooltip key={type} disabled={!!preview}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="board-palette-item"
                      aria-label={config.displayName}
                      data-component-type={type}
                      onPointerDown={(event) => pointerDown(event, type)}
                      onPointerMove={pointerMove}
                      onPointerUp={pointerUp}
                      onPointerCancel={() => clearGesture()}
                      onLostPointerCapture={(event) => {
                        if (gesture.current?.pointerId === event.pointerId)
                          clearGesture();
                      }}
                      onClick={(event) => {
                        if (event.detail === 0) createCanvasShape(editor, type);
                      }}
                    >
                      <span className="board-palette-label truncate">
                        {config.displayName}
                      </span>
                      <Icon className="size-4 shrink-0" />
                    </Button>
                  }
                />
                <TooltipContent
                  side="right"
                  className="max-w-56 flex-col items-start gap-0"
                >
                  <p className="font-medium">{config.displayName}</p>
                  <p className="mt-1 opacity-80">{config.description}</p>
                  <p className="mt-1 opacity-80">
                    {t("canvas.components.dragToCanvas")}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="board-palette-footer">
          {onOpenLibrary && (
            <Button
              variant="ghost"
              className="board-palette-item"
              aria-label={t("assets.title")}
              aria-pressed={libraryOpen}
              onClick={onOpenLibrary}
              title={t("assets.title")}
            >
              <span className="board-palette-label">{t("assets.title")}</span>
              <Images className="size-4 shrink-0" />
            </Button>
          )}
          <Button
            variant="ghost"
            className="board-palette-item"
            aria-label={t("canvas.files.title")}
            title={t("canvas.files.title")}
            onClick={() => setFilesOpen(true)}
          >
            <span className="board-palette-label truncate">
              {t("canvas.files.title")}
            </span>
            <Download />
          </Button>
        </div>
      </aside>
      {preview && (
        <EditorContext value={preview}>
          <ComponentPreview />
        </EditorContext>
      )}
      <FileDownloadDrawer
        open={filesOpen}
        onOpenChange={setFilesOpen}
        editor={editor}
      />
    </>
  );
}
