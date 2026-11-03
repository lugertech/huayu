import { t } from "@/i18n";
import {
  Bounds,
  plainText,
  type CanvasShape,
  type Editor,
} from "@/canvas/editor";
import { COMPONENT_CONFIGS, type ComponentType } from "@/config/components";

export const COMPOSE_EVENT = "huayu:compose-selection";
export const INSPECT_EVENT = "huayu:inspect-content";
export function requestInspection(
  editor: Editor,
  id: string,
  options?: { refine?: boolean },
) {
  editor.container?.dispatchEvent(
    new CustomEvent(INSPECT_EVENT, {
      detail: options ? { id, ...options } : id,
    }),
  );
}

export function canInspect(shape: CanvasShape): boolean {
  return [
    "ai-text",
    "instruction",
    "ai-image",
    "image",
    "website",
    "speech",
    "file",
    "chart",
  ].includes(shape.type);
}

export function requestComposition(editor: Editor, ids: string[]) {
  editor.container?.dispatchEvent(
    new CustomEvent(COMPOSE_EVENT, { detail: ids }),
  );
}

/** Keep a selected frame intact; expand groups and exclude children already represented by a frame. */
export function materialShapes(editor: Editor, ids: string[]): CanvasShape[] {
  const pageIds = editor.getCurrentPageShapeIds();
  const candidates = new Map<string, CanvasShape>();
  for (const id of ids) {
    const shape = editor.getShape(id);
    if (!shape || !pageIds.has(id)) continue;
    for (const item of shape.type === "group"
      ? editor.descendants(id)
      : [shape])
      if (!["arrow", "group", "start", "ai-draw"].includes(item.type))
        candidates.set(item.id, item);
  }
  const framed = new Set<string>();
  for (const shape of candidates.values())
    if (shape.type === "frame")
      editor.descendants(shape.id).forEach((child) => framed.add(child.id));
  return [...candidates.values()].filter((shape) => !framed.has(shape.id));
}

export function materialLabel(shape: CanvasShape): string {
  const props = shape.props;
  const label =
    props.name ||
    props.fileName ||
    props.result ||
    props.text ||
    plainText(props.richText);
  if (typeof label === "string" && label.trim())
    return label.trim().replace(/\s+/g, " ").slice(0, 42);
  return (
    COMPONENT_CONFIGS[shape.type as ComponentType]?.displayName ||
    {
      image: t("common.image"),
      draw: t("workflow.drawing"),
      geo: t("workflow.shape"),
      note: t("workflow.stickyNote"),
      text: t("common.text"),
      line: t("workflow.line"),
    }[shape.type] ||
    t("workflow.canvasContent")
  );
}

export function materialText(shape: CanvasShape): string {
  const props = shape.props;
  return String(
    props.htmlContent ||
      props.chartData ||
      props.result ||
      props.text ||
      plainText(props.richText) ||
      props.description ||
      "",
  );
}

export function focusShapes(editor: Editor, ids: string[]) {
  const bounds = ids
    .map((id) => editor.getShapePageBounds(id))
    .filter(Boolean) as Bounds[];
  if (bounds.length) editor.zoomToBounds(Bounds.union(bounds));
}

export function hasVisibleContent(editor: Editor): boolean {
  const view = editor.getViewportPageBounds();
  return editor.getCurrentPageShapes().some((shape) => {
    if (shape.type === "group") return false;
    const box = editor.getShapePageBounds(shape);
    return (
      box &&
      box.maxX >= view.x &&
      box.x <= view.maxX &&
      box.maxY >= view.y &&
      box.y <= view.maxY
    );
  });
}
