import { t } from "@/i18n";
import { type CanvasShape, type Editor } from "@/canvas/editor";

const shapeId = (value: string) =>
  value.startsWith("shape:") ? value : `shape:${value}`;
type LayoutEvent = Record<string, any>;
const types = new Set([
  "place",
  "bringToFront",
  "sendToBack",
  "rotate",
  "resize",
  "align",
  "distribute",
  "stack",
]);

/** Layout uses page coordinates so nested and rotated frames behave like the rest of the editor. */
export function executeLayoutEvent(
  editor: Editor,
  event: LayoutEvent,
): boolean {
  const type = event._type || event.type;
  if (!types.has(type)) return false;
  const ids = (event.shapeIds || [event.shapeId])
    .filter((id: unknown): id is string => typeof id === "string")
    .map(shapeId);
  const shapes = ids
    .map((id: string) => editor.getShape(id))
    .filter((shape: CanvasShape | undefined): shape is CanvasShape => !!shape);
  const bounds = (shape: CanvasShape) => editor.getShapePageBounds(shape)!;
  const move = (shape: CanvasShape, dx: number, dy: number) => {
    const parent = editor.getShape(shape.parentId);
    const rotation = parent ? editor.getPageTransform(parent).rotation : 0;
    editor.updateShape({
      id: shape.id,
      x: shape.x + dx * Math.cos(-rotation) - dy * Math.sin(-rotation),
      y: shape.y + dx * Math.sin(-rotation) + dy * Math.cos(-rotation),
    });
  };
  if (type === "bringToFront" || type === "sendToBack") {
    shapes.forEach((shape: CanvasShape, index: number) =>
      editor.updateShape({
        id: shape.id,
        index: `${type === "bringToFront" ? "z" : "A"}${Date.now()}-${index}`,
      }),
    );
  } else if (type === "place") {
    const shape = shapes[0];
    const reference = editor.getShape(shapeId(event.referenceShapeId || ""));
    if (!shape || !reference) return true;
    const a = bounds(shape);
    const b = bounds(reference);
    const vertical = ["top", "bottom"].includes(event.side);
    const alignment =
      event.align === "start" ? 0 : event.align === "end" ? 1 : 0.5;
    const x = vertical
      ? b.x + (b.w - a.w) * alignment + (event.alignOffset || 0)
      : event.side === "left"
        ? b.x - a.w - (event.sideOffset || 0)
        : b.maxX + (event.sideOffset || 0);
    const y = !vertical
      ? b.y + (b.h - a.h) * alignment + (event.alignOffset || 0)
      : event.side === "top"
        ? b.y - a.h - (event.sideOffset || 0)
        : b.maxY + (event.sideOffset || 0);
    move(shape, x - a.x, y - a.y);
  } else if (type === "rotate" || type === "resize") {
    if (![event.centerX, event.centerY].every(Number.isFinite))
      throw new Error(t("canvas.theShapeTransformIsMissingItsCenterPoint"));
    const angle = ((event.degrees || 0) * Math.PI) / 180;
    const sx = Number(event.scaleX);
    const sy = Number(event.scaleY);
    if (
      type === "resize" &&
      (![sx, sy].every(Number.isFinite) || sx <= 0 || sy <= 0)
    )
      throw new Error(t("canvas.invalidShapeScale"));
    for (const shape of shapes) {
      const origin = editor.getPageTransform(shape);
      const dx = origin.x - event.centerX;
      const dy = origin.y - event.centerY;
      if (type === "rotate") {
        move(
          shape,
          event.centerX +
            dx * Math.cos(angle) -
            dy * Math.sin(angle) -
            origin.x,
          event.centerY +
            dx * Math.sin(angle) +
            dy * Math.cos(angle) -
            origin.y,
        );
        editor.updateShape({ id: shape.id, rotation: shape.rotation + angle });
      } else {
        move(
          shape,
          event.centerX + dx * sx - origin.x,
          event.centerY + dy * sy - origin.y,
        );
        const p = shape.props;
        const props: Record<string, any> = {
          w: Math.max(1, p.w * sx),
          h: Math.max(1, p.h * sy),
        };
        if (p.start) props.start = { x: p.start.x * sx, y: p.start.y * sy };
        if (p.end) props.end = { x: p.end.x * sx, y: p.end.y * sy };
        if (p.points)
          props.points = Object.fromEntries(
            Object.entries(p.points).map(([key, point]: [string, any]) => [
              key,
              { ...point, x: point.x * sx, y: point.y * sy },
            ]),
          );
        if (p.segments)
          props.segments = p.segments.map((segment: any) => ({
            ...segment,
            points: segment.points.map((point: any) => ({
              ...point,
              x: point.x * sx,
              y: point.y * sy,
            })),
          }));
        if (["arrow", "line", "draw", "highlight"].includes(shape.type))
          props.excalidraw = undefined;
        editor.updateShape({ id: shape.id, props });
      }
    }
  } else if (shapes.length > 1) {
    const horizontal =
      type === "align"
        ? ["left", "right", "center-horizontal"].includes(event.alignment)
        : event.direction === "horizontal";
    const position = horizontal ? "x" : "y";
    const size = horizontal ? "w" : "h";
    const items = shapes
      .map((shape: CanvasShape) => ({ shape, box: bounds(shape) }))
      .sort(
        (a: { box: any }, b: { box: any }) => a.box[position] - b.box[position],
      );
    const min = Math.min(
      ...items.map((item: { box: any }) => item.box[position]),
    );
    const max = Math.max(
      ...items.map((item: { box: any }) => item.box[position] + item.box[size]),
    );
    if (type === "align") {
      const alignment = event.alignment;
      const target = ["left", "top"].includes(alignment)
        ? min
        : ["right", "bottom"].includes(alignment)
          ? max
          : (min + max) / 2;
      items.forEach(({ shape, box }: { shape: CanvasShape; box: any }) => {
        const current =
          box[position] +
          (["left", "top"].includes(alignment)
            ? 0
            : ["right", "bottom"].includes(alignment)
              ? box[size]
              : box[size] / 2);
        move(
          shape,
          horizontal ? target - current : 0,
          horizontal ? 0 : target - current,
        );
      });
    } else {
      const gap =
        type === "stack"
          ? Number(event.gap) || 0
          : (max -
              min -
              items.reduce(
                (sum: number, item: { box: any }) => sum + item.box[size],
                0,
              )) /
            (items.length - 1);
      let cursor = min;
      items.forEach(({ shape, box }: { shape: CanvasShape; box: any }) => {
        move(
          shape,
          horizontal ? cursor - box.x : 0,
          horizontal ? 0 : cursor - box.y,
        );
        cursor += box[size] + gap;
      });
    }
  }
  return true;
}
