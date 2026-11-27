import { t, type MessageKey } from "@/i18n";
import type { Editor } from "@/features/canvas/engine/editor";
import { Bounds } from "@/features/canvas/engine/bounds";
import {
  type CanvasShape,
  type ShapeId,
  type ArrowBinding,
  createShapeId,
  createBindingId,
} from "@/features/canvas/engine/model";
import {
  COMPONENT_CONFIGS,
  getDefaultComponentProps,
  type ComponentType,
} from "../../config/components";

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
/** A start node gates execution, while its incoming materials remain readable. */
export function getPreviousConnectedShapes(editor: Editor, id: ShapeId) {
  const sources: CanvasShape[] = [];
  const pending = connectedShapes(editor, id, "previous").reverse();
  const seen = new Set<string>([id]);
  while (pending.length) {
    const shape = pending.pop()!;
    if (seen.has(shape.id)) continue;
    seen.add(shape.id);
    if (shape.type === "start")
      pending.push(...connectedShapes(editor, shape.id, "previous").reverse());
    else sources.push(shape);
  }
  return sources;
}

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
): ShapeId | null {
  const pageIds = editor.getCurrentPageShapeIds();
  const ids = [...new Set(sources)].filter((id) => pageIds.has(id));
  const boxes = ids.map((id) => editor.getShapePageBounds(id)).filter(Boolean);
  if (!boxes.length) return null;
  const bounds = Bounds.union(boxes as Bounds[]);
  const { w, h } = COMPONENT_CONFIGS[type].defaultSize;
  const x = side === "right" ? bounds.maxX + 80 : bounds.x - w - 80;
  let y = bounds.center.y - h / 2;
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
      );
  });
  return id;
}

const legacyConnectionLabelKeys: Partial<Record<string, MessageKey>> = {
  "ai-image": "canvas.referenceImage",
  image: "canvas.referenceImage",
  speech: "canvas.audioMaterial",
  file: "canvas.fileMaterial",
  website: "canvas.webContent",
  "interactive-web": "canvas.webContent",
  chart: "canvas.chartContent",
  "ai-text": "canvas.textMaterial",
  instruction: "api.generatedContent",
  frame: "canvas.frameContent",
  start: "canvas.start",
};

export function isLegacyConnectionLabel(
  editor: Editor,
  arrowId: ShapeId,
  label: string,
): boolean {
  const bindings = editor.getBindingsFromShape<ArrowBinding>(arrowId, "arrow");
  const start = bindings.find((binding) => binding.props.terminal === "start");
  const end = bindings.find((binding) => binding.props.terminal === "end");
  // Old workflow connections used the exact midpoint ports on both cards.
  if (
    !start?.props.isPrecise ||
    !end?.props.isPrecise ||
    start.props.normalizedAnchor.x !== 1 ||
    start.props.normalizedAnchor.y !== 0.5 ||
    end.props.normalizedAnchor.x !== 0 ||
    end.props.normalizedAnchor.y !== 0.5
  )
    return false;
  const source = editor.getShape(start.toId);
  if (!source) return false;
  const key =
    legacyConnectionLabelKeys[source.type] ?? "workflow.canvasContent";
  return (
    label === t(key, undefined, "zh-CN") || label === t(key, undefined, "en")
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
