import { t } from "@/i18n";
import {
  Editor,
  Bounds,
  type CanvasShape,
  type ShapeId,
  type ArrowBinding,
  createShapeId,
  createBindingId,
} from "@/canvas/editor";
import {
  COMPONENT_CONFIGS,
  getDefaultComponentProps,
  type ComponentType,
} from "../config/components";

export function connectedShapes(
  editor: Editor,
  id: ShapeId,
  direction: "previous" | "next",
): CanvasShape[] {
  const ownTerminal = direction === "next" ? "start" : "end";
  const otherTerminal = direction === "next" ? "end" : "start";
  const results = new Map<ShapeId, CanvasShape>();
  for (const binding of editor.getBindingsToShape<ArrowBinding>(id, "arrow")) {
    if (binding.props.terminal !== ownTerminal) continue;
    for (const other of editor.getBindingsFromShape<ArrowBinding>(
      binding.fromId,
      "arrow",
    )) {
      if (other.props.terminal !== otherTerminal) continue;
      const shape = editor.getShape(other.toId);
      if (shape && shape.type !== "arrow" && shape.type !== "group")
        results.set(shape.id, shape);
    }
  }
  return [...results.values()];
}

export const getNextConnectedShapes = (editor: Editor, id: ShapeId) =>
  connectedShapes(editor, id, "next");
export const getPreviousConnectedShapes = (editor: Editor, id: ShapeId) =>
  connectedShapes(editor, id, "previous");

export function connectShapes(
  editor: Editor,
  from: ShapeId,
  to: ShapeId,
  label?: string,
) {
  const start = editor.getShapePageBounds(from);
  const end = editor.getShapePageBounds(to);
  if (!start || !end) return;
  const id = createShapeId();
  editor.createShape({
    id,
    type: "arrow",
    x: start.maxX,
    y: start.center.y,
    props: {
      start: { x: 0, y: 0 },
      end: { x: end.minX - start.maxX, y: end.center.y - start.center.y },
      arrowheadEnd: "triangle",
      ...(label ? { text: label } : {}),
    },
  });
  editor.createBindings([
    {
      id: createBindingId(),
      type: "arrow",
      fromId: id,
      toId: from,
      props: {
        terminal: "start",
        normalizedAnchor: { x: 1, y: 0.5 },
        isExact: false,
        isPrecise: true,
      },
    },
    {
      id: createBindingId(),
      type: "arrow",
      fromId: id,
      toId: to,
      props: {
        terminal: "end",
        normalizedAnchor: { x: 0, y: 0.5 },
        isExact: false,
        isPrecise: true,
      },
    },
  ]);
  return id;
}

export function createConnectedAIComponent(
  editor: Editor,
  source: ShapeId,
  type: ComponentType,
  text: string,
): ShapeId | null {
  return createConnectedComponent(editor, [source], type, text);
}

export function createConnectedComponent(
  editor: Editor,
  sources: ShapeId[],
  type: ComponentType,
  text: string,
  side: "left" | "right" = "right",
  position?: { x: number; y: number },
): ShapeId | null {
  const pageIds = editor.getCurrentPageShapeIds();
  const ids = [...new Set(sources)].filter((id) => pageIds.has(id));
  const boxes = ids.map((id) => editor.getShapePageBounds(id)).filter(Boolean);
  if (!boxes.length) return null;
  const bounds = Bounds.union(boxes as Bounds[]);
  const { w, h } = COMPONENT_CONFIGS[type].defaultSize;
  const x =
    position?.x ?? (side === "right" ? bounds.maxX + 80 : bounds.x - w - 80);
  let y = position?.y ?? bounds.y;
  const occupied = editor
    .getCurrentPageShapes()
    .filter(
      (shape) => !["arrow", "line", "group", "frame"].includes(shape.type),
    )
    .map((shape) => editor.getShapePageBounds(shape))
    .filter(Boolean);
  for (let attempt = 0; attempt < 200; attempt++) {
    const collision = occupied.find(
      (box) =>
        x < box!.maxX + 24 &&
        x + w + 24 > box!.x &&
        y < box!.maxY + 24 &&
        y + h + 24 > box!.y,
    );
    if (!collision) break;
    y = collision.maxY + 48;
  }
  const id = createShapeId();
  editor.run(() => {
    editor.createShape({
      id,
      type,
      x,
      y,
      props: { ...getDefaultComponentProps(type), text },
    });
    for (const source of ids)
      connectShapes(
        editor,
        side === "right" ? source : id,
        side === "right" ? id : source,
        connectionLabel(
          editor.getShape(side === "right" ? source : id)?.type || "",
        ),
      );
  });
  return id;
}
export function connectionLabel(type: string) {
  return (
    {
      "ai-image": t("canvas.referenceImage"),
      image: t("canvas.referenceImage"),
      speech: t("canvas.audioMaterial"),
      file: t("canvas.fileMaterial"),
      website: t("canvas.webContent"),
      "interactive-web": t("canvas.webContent"),
      chart: t("canvas.chartContent"),
      "ai-text": t("canvas.textMaterial"),
      instruction: t("api.generatedContent"),
      frame: t("canvas.frameContent"),
      start: t("canvas.start"),
    }[type] || t("workflow.canvasContent")
  );
}
export const createConnectedTextShape = (
  editor: Editor,
  id: ShapeId,
  text: string,
) => {
  const created = createConnectedAIComponent(editor, id, "ai-text", "");
  if (created) editor.updateShape({ id: created, props: { result: text } });
  return created;
};
export const getAvailableComponentTypes = () =>
  Object.keys(COMPONENT_CONFIGS) as ComponentType[];
export const getComponentConfig = (type: ComponentType) =>
  COMPONENT_CONFIGS[type];
