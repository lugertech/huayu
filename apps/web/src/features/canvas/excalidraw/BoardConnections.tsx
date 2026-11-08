import { errorText } from "@/i18n/errors";
import { useTranslations } from "@/i18n";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useEditor, type VecLike } from "@/features/canvas/editor";
import {
  COMPONENT_CONFIGS,
  componentConfig,
  type ComponentType,
} from "@/config/components";
import { createConnectedComponent } from "@/features/canvas/connection-parser";
import {
  CONNECT_EVENT,
  connectionPort,
  connectionProblem,
  connectionTarget,
  linkWorkflow,
  type ConnectionStart,
} from "@/workflow/connections";
import { focusShapes, materialLabel } from "@/workflow/context";
import { useToast } from "@/components/common/ToastProvider";
import { ComponentConnectionDots } from "@/features/canvas/components/ComponentConnectionDots";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

interface Drag extends ConnectionStart {
  pageId: string;
  point: VecLike;
  moved: boolean;
  target?: string;
}
interface Picker extends ConnectionStart {
  point?: VecLike;
}
const types: ComponentType[] = [
  "instruction",
  "ai-text",
  "ai-image",
  "website",
  "chart",
  "speech",
  "file",
];

export function BoardConnections() {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const { showToast } = useToast();
  const marker = useId().replaceAll(":", "");
  type Gesture =
    | { phase: "idle" }
    | { phase: "dragging"; drag: Drag }
    | { phase: "choosing"; picker: Picker };
  const [gesture, setGesture] = useState<Gesture>({ phase: "idle" });
  const active = useRef<Drag | null>(null);
  const drag = gesture.phase === "dragging" ? gesture.drag : null;
  const picker = gesture.phase === "choosing" ? gesture.picker : null;
  function setPicker(value: Picker | null) {
    active.current = null;
    setGesture(
      value ? { phase: "choosing", picker: value } : { phase: "idle" },
    );
  }
  function setDrag(value: Drag | null) {
    active.current = value;
    setGesture(value ? { phase: "dragging", drag: value } : { phase: "idle" });
  }
  const page = editor.getCurrentPageId();
  function cancel() {
    active.current = null;
    setDrag(null);
  }
  function link(start: ConnectionStart, target: string) {
    try {
      linkWorkflow(
        editor,
        start.side === "right" ? start.id : target,
        start.side === "right" ? target : start.id,
        locale,
      );
      editor.select(start.side === "right" ? target : start.id);
    } catch (error) {
      showToast({
        title: t("canvas.connections.failed"),
        description:
          error instanceof Error
            ? errorText(error, locale)
            : t("canvas.connections.selectACardAgain"),
        variant: "destructive",
      });
    }
  }
  const linkFromDrag = useEffectEvent(link);
  useEffect(() => {
    const container = editor.container;
    function start(event: Event) {
      const detail = (event as CustomEvent<ConnectionStart>).detail;
      if (!editor.getShape(detail.id)) return;
      setPicker(null);
      if (detail.pointerId < 0) {
        setPicker(detail);
        return;
      }
      const next: Drag = {
        ...detail,
        point: editor.screenToPage(detail),
        pageId: editor.getCurrentPageId(),
        moved: false,
      };
      active.current = next;
      setDrag(next);
    }
    function move(event: PointerEvent) {
      const current = active.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      if (
        editor.getCurrentPageId() !== current.pageId ||
        !editor.getShape(current.id)
      ) {
        cancel();
        return;
      }
      const point = editor.screenToPage({ x: event.clientX, y: event.clientY });
      const target = connectionTarget(
        editor,
        current.id,
        current.side,
        point,
        12 / editor.session.camera.z,
      );
      const next = {
        ...current,
        point,
        moved:
          current.moved ||
          Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5,
        target: target?.id,
      };
      active.current = next;
      setDrag(next);
    }
    function end(event: PointerEvent) {
      const current = active.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
      if (current.target && current.moved) {
        linkFromDrag(current, current.target);
        return;
      }
      if (
        current.moved &&
        editor.getShapePageBounds(current.id)?.contains(current.point)
      )
        return;
      const rect = container?.getBoundingClientRect();
      if (
        !rect ||
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        return;
      setPicker({
        ...current,
        x: event.clientX,
        y: event.clientY,
        point: current.moved
          ? editor.screenToPage({ x: event.clientX, y: event.clientY })
          : undefined,
      });
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && active.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    }
    container?.addEventListener(CONNECT_EVENT, start);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      active.current = null;
      container?.removeEventListener(CONNECT_EVENT, start);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [editor]);
  useEffect(() => {
    cancel();
    setPicker(null);
  }, [page]);

  const camera = editor.session.camera;
  const selected = editor.getSelectedShapes();
  const frame =
    selected.length === 1 &&
    selected[0].type === "frame" &&
    !selected[0].isLocked &&
    editor.getCurrentToolId() === "select"
      ? selected[0]
      : null;
  const frameTransform = frame && editor.getPageTransform(frame);
  const local = (point: VecLike) => ({
    x: (point.x + camera.x) * camera.z,
    y: (point.y + camera.y) * camera.z,
  });
  let wire;
  if (drag) {
    const fixed = connectionPort(editor, drag.id, drag.side);
    const end = drag.target
      ? connectionPort(
          editor,
          drag.target,
          drag.side === "right" ? "left" : "right",
        )
      : drag.point;
    const a = local(drag.side === "right" ? fixed : end);
    const b = local(drag.side === "right" ? end : fixed);
    const length = Math.max(40, Math.min(150, Math.abs(b.x - a.x) / 2));
    const box = drag.target && editor.getShapePageBounds(drag.target);
    const corner = box && local(box.point);
    const problem =
      drag.target &&
      connectionProblem(
        editor,
        drag.side === "right" ? drag.id : drag.target,
        drag.side === "right" ? drag.target : drag.id,
        locale,
      );
    const label =
      problem ||
      (drag.target
        ? t("canvas.connections.connect", {
            arg0: materialLabel(editor.getShape(drag.target)!, locale),
          })
        : drag.side === "right"
          ? t("canvas.connections.releaseToAddTheNextStep")
          : t("canvas.connections.releaseToAddInputMaterial"));
    const point = local(drag.point);
    const width = editor.container?.clientWidth || 1200;
    wire = (
      <>
        <svg
          className="board-connection-overlay"
          aria-hidden="true"
          style={{
            color: problem ? "var(--destructive)" : "var(--canvas-stroke)",
          }}
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 1 1 L 9 5 L 1 9 Z" fill="currentColor" />
            </marker>
          </defs>
          {box && corner && (
            <rect
              x={corner.x - 4}
              y={corner.y - 4}
              width={box.w * camera.z + 8}
              height={box.h * camera.z + 8}
              rx={12}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
          )}
          <path
            d={`M ${a.x} ${a.y} C ${a.x + length} ${a.y} ${b.x - length} ${b.y} ${b.x} ${b.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            markerEnd={`url(#${marker})`}
          />
        </svg>
        <div
          className="board-wire-hint"
          role="status"
          style={{
            left: Math.min(width - 170, Math.max(8, point.x + 14)),
            top: Math.max(8, point.y - 38),
          }}
        >
          {label}
        </div>
      </>
    );
  }
  const rect = editor.container?.getBoundingClientRect();
  const candidates = picker
    ? editor
        .getCurrentPageShapes()
        .filter(
          (shape) =>
            shape.id !== picker.id &&
            !["arrow", "line", "group", "start"].includes(shape.type) &&
            (picker.side === "left" || shape.type in COMPONENT_CONFIGS),
        )
    : [];
  return (
    <>
      {frame && frameTransform && (
        <div
          className="board-frame-connections"
          data-canvas-ui
          style={{
            width: frame.props.w,
            height: frame.props.h,
            transform: `translate(${(frameTransform.x + camera.x) * camera.z}px, ${(frameTransform.y + camera.y) * camera.z}px) scale(${camera.z}) rotate(${frameTransform.rotation}rad)`,
          }}
        >
          <ComponentConnectionDots shape={frame} />
        </div>
      )}
      {wire}
      {picker && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
        >
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="board-picker-anchor"
                aria-label={
                  picker.side === "right"
                    ? t("canvas.connections.chooseTheNextStep")
                    : t("canvas.connections.chooseInputMaterial")
                }
                style={{
                  left: picker.x - (rect?.left || 0),
                  top: picker.y - (rect?.top || 0),
                }}
              />
            }
          />
          <DropdownMenuContent className="w-52" side="right" align="start">
            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">
              {picker.side === "right"
                ? t("canvas.connections.createNextStep")
                : t("canvas.connections.createInputMaterial")}
            </div>
            {types.map((type) => {
              const config = componentConfig(type, locale);
              const Icon = config.icon;
              return (
                <DropdownMenuItem
                  key={type}
                  onClick={() => {
                    const start = picker;
                    setPicker(null);
                    if (!editor.getShape(start.id)) return;
                    const size = config.defaultSize;
                    const position = start.point
                      ? {
                          x:
                            start.point.x -
                            (start.side === "left" ? size.w : 0),
                          y: start.point.y - size.h / 2,
                        }
                      : undefined;
                    const id = createConnectedComponent(
                      editor,
                      [start.id],
                      type,
                      "",
                      start.side,
                      position,
                    );
                    if (!id) return;
                    editor.select(id);
                    focusShapes(
                      editor,
                      editor.getViewportPageBounds().w < 700
                        ? [id]
                        : [start.id, id],
                    );
                    requestAnimationFrame(() =>
                      editor.container
                        ?.querySelector<HTMLTextAreaElement>(
                          `[data-node-id="${CSS.escape(id)}"] textarea`,
                        )
                        ?.focus({ preventScroll: true }),
                    );
                  }}
                >
                  <Icon />
                  {config.displayName}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t("canvas.connections.connectAnExistingCard")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-64">
                {candidates.length ? (
                  candidates.map((shape) => {
                    const problem = connectionProblem(
                      editor,
                      picker.side === "right" ? picker.id : shape.id,
                      picker.side === "right" ? shape.id : picker.id,
                      locale,
                    );
                    return (
                      <DropdownMenuItem
                        key={shape.id}
                        disabled={!!problem}
                        title={problem || materialLabel(shape, locale)}
                        onClick={() => {
                          link(picker, shape.id);
                          setPicker(null);
                        }}
                      >
                        <span className="truncate">
                          {materialLabel(shape, locale)}
                        </span>
                        {problem && (
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            {t("canvas.connections.unavailable")}
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t("canvas.connections.noCardsAvailableToConnect")}
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
