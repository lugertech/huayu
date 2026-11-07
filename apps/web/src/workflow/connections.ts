import { t, type Locale } from "@/i18n";
import type { CanvasShape, Editor, VecLike } from "@/canvas/editor";
import { COMPONENT_CONFIGS } from "@/config/components";
import { connectedShapes, connectShapes } from "@/utils/connectionParser";

export const CONNECT_EVENT = "huayu:connect";
export type ConnectionSide = "left" | "right";
export interface ConnectionStart {
  id: string;
  side: ConnectionSide;
  pointerId: number;
  x: number;
  y: number;
}

export function connectionPort(
  editor: Editor,
  id: string,
  side: ConnectionSide,
): VecLike {
  const shape = editor.getShape(id);
  const origin = shape && editor.getPageTransform(shape);
  if (!shape || !origin) return { x: 0, y: 0 };
  const x = side === "right" ? shape.props.w : 0;
  const y = shape.props.h / 2;
  return {
    x: origin.x + x * Math.cos(origin.rotation) - y * Math.sin(origin.rotation),
    y: origin.y + x * Math.sin(origin.rotation) + y * Math.cos(origin.rotation),
  };
}

export function connectionProblem(
  editor: Editor,
  from: string,
  to: string,
  locale?: Locale,
): string | null {
  const source = editor.getShape(from);
  const target = editor.getShape(to);
  const page = editor.getCurrentPageId();
  if (
    !source ||
    !target ||
    editor.pageOf(from) !== page ||
    editor.pageOf(to) !== page
  )
    return t("workflow.thisCardIsNoLongerOnTheCurrentPage", undefined, locale);
  if (from === to) return t("workflow.chooseADifferentCard", undefined, locale);
  if (
    !(target.type in COMPONENT_CONFIGS) ||
    ["frame", "ai-draw", "interactive-web"].includes(target.type)
  )
    return t("workflow.connectToACreativeStep", undefined, locale);
  if (["arrow", "group"].includes(source.type))
    return t("workflow.chooseAvailableMaterial", undefined, locale);
  if (connectedShapes(editor, from, "next").some((shape) => shape.id === to))
    return t("workflow.theseCardsAreAlreadyConnected", undefined, locale);
  const pending = [to];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === from)
      return t("workflow.thisConnectionWouldCreateACycle", undefined, locale);
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(
      ...connectedShapes(editor, id, "next").map((shape) => shape.id),
    );
  }
  return null;
}

export function connectionTarget(
  editor: Editor,
  fixed: string,
  side: ConnectionSide,
  point: VecLike,
  tolerance = 0,
): CanvasShape | undefined {
  return editor
    .getCurrentPageShapes()
    .filter(
      (shape) =>
        shape.id !== fixed && !["arrow", "group", "line"].includes(shape.type),
    )
    .sort(
      (a, b) =>
        Number(a.type === "frame") - Number(b.type === "frame") ||
        b.index.localeCompare(a.index),
    )
    .find((shape) => {
      if (
        side === "right" &&
        (!(shape.type in COMPONENT_CONFIGS) ||
          ["frame", "ai-draw", "interactive-web"].includes(shape.type))
      )
        return false;
      const bounds = editor.getShapePageBounds(shape);
      if (
        !bounds ||
        point.x < bounds.x - tolerance ||
        point.x > bounds.maxX + tolerance ||
        point.y < bounds.y - tolerance ||
        point.y > bounds.maxY + tolerance
      )
        return false;
      const origin = editor.getPageTransform(shape);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const x = dx * Math.cos(origin.rotation) + dy * Math.sin(origin.rotation);
      const y =
        -dx * Math.sin(origin.rotation) + dy * Math.cos(origin.rotation);
      return (
        x >= -tolerance &&
        x <= shape.props.w + tolerance &&
        y >= -tolerance &&
        y <= shape.props.h + tolerance
      );
    });
}

export function linkWorkflow(
  editor: Editor,
  from: string,
  to: string,
  locale?: Locale,
) {
  const problem = connectionProblem(editor, from, to, locale);
  if (problem) throw new Error(problem);
  let id: string | undefined;
  editor.run(() => {
    id = connectShapes(editor, from, to);
  });
  return id;
}
