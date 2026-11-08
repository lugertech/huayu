import { useTranslations } from "@/i18n";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  EditorContext,
  useEditor,
  type Editor,
} from "@/features/canvas/editor";
import {
  ComponentDrag,
  createCanvasShape,
} from "@/features/canvas/component-creation";
import { BoardComponents } from "@/features/canvas/excalidraw/BoardComponents";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COMPONENT_CONFIGS,
  componentConfig,
  type ComponentType,
} from "@/config/components";
import { FileDownloadDrawer } from "./FileDownloadDrawer";

function ComponentPreview() {
  const { t } = useTranslations();
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
            <rect
              width={shape.props.w}
              height={shape.props.h}
              rx={8 / camera.z}
              fill="none"
              stroke="#bbb"
              strokeWidth={2 / camera.z}
            />
            <text
              x={0}
              y={-6 / camera.z}
              fontSize={14 / camera.z}
              fill={editor.theme === "dark" ? "#7a7a7a" : "#999"}
            >
              {t("canvas.frame")}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}

export function ComponentPanel() {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const [hovered, setHovered] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
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
        data-expanded={hovered || focusVisible}
        data-hovered={hovered}
        aria-label={t("canvas.components.palette")}
        data-canvas-ui
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") setHovered(false);
        }}
        onFocusCapture={(event) =>
          setFocusVisible(event.target.matches(":focus-visible"))
        }
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocusVisible(false);
        }}
      >
        <div className="board-palette-items">
          {(Object.keys(COMPONENT_CONFIGS) as ComponentType[]).map((type) => {
            const config = componentConfig(type, locale);
            const Icon = config.icon;
            return (
              <Button
                key={type}
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
                <Icon className="shrink-0" />
                <span className="board-palette-label">
                  {config.displayName}
                </span>
              </Button>
            );
          })}
        </div>
        <div className="board-palette-footer">
          <Button
            variant="ghost"
            className="board-palette-item"
            aria-label={t("canvas.files.title")}
            onClick={() => setFilesOpen(true)}
          >
            <Download />
            <span className="board-palette-label">
              {t("canvas.files.title")}
            </span>
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
