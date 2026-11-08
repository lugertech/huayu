import { t } from "@/i18n";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { COMPONENT_CONFIGS } from "@/config/components";
import { isLegacyConnectionLabel } from "@/features/canvas/connection-parser";
import { repairFrameArrowMembership } from "./frame-bindings";
import {
  Editor,
  plainText,
  richText,
  type CanvasRecord,
  type CanvasShape,
} from "@/features/canvas/editor";

type Element = ExcalidrawElement & Record<string, any>;
export const INTERNAL_EMBED_PREFIX = "https://huayu.local/component/";
const palette: Record<string, string> = {
  black: "#000000",
  grey: "#868e96",
  violet: "#7950f2",
  "light-violet": "#b197fc",
  blue: "#4263eb",
  "light-blue": "#74c0fc",
  yellow: "#f59f00",
  orange: "#f08c00",
  green: "#2f9e44",
  "light-green": "#8ce99a",
  red: "#e03131",
  "light-red": "#ffa8a8",
  white: "#ffffff",
};
const color = (value: string) => palette[value] || value || "#000000";
const cleanProps = (props: Record<string, any>) => {
  const { excalidraw, excalidrawLabel, excalidrawStyle, ...content } = props;
  return { ...content, isRunning: false, isSubmitting: false };
};
export function isComponent(shape: CanvasShape) {
  return shape.type in COMPONENT_CONFIGS && shape.type !== "frame";
}
export function isCustomElement(shape: CanvasShape) {
  return (
    isComponent(shape) ||
    ["video", "embed", "bookmark"].includes(shape.type) ||
    (shape.type === "geo" &&
      !["rectangle", "ellipse", "diamond"].includes(shape.props.geo))
  );
}
function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 1;
}
function equivalent(a: number, b: number) {
  return Math.abs(a - b) < 0.000001 ? b : a;
}
export function canonicalOrigin(
  element: Pick<Element, "x" | "y" | "width" | "height" | "angle">,
) {
  const x = element.width / 2;
  const y = element.height / 2;
  const c = Math.cos(element.angle);
  const s = Math.sin(element.angle);
  return {
    x: element.x + x - (c * x - s * y),
    y: element.y + y - (s * x + c * y),
    rotation: element.angle,
  };
}
function nativeOrigin(
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x + (c * w) / 2 - (s * h) / 2 - w / 2,
    y: y + (s * w) / 2 + (c * h) / 2 - h / 2,
  };
}
function ancestry(editor: Editor, shape: CanvasShape) {
  const groups: string[] = [];
  let parent = editor.getShape(shape.parentId);
  let frameId: string | null = null;
  for (let depth = 0; parent && depth < 100; depth++) {
    if (parent.type === "group") groups.push(parent.id);
    if (parent.type === "frame" && !frameId)
      frameId = parent.props.excalidraw?.id || parent.id;
    parent = editor.getShape(parent.parentId);
  }
  return { groups, frameId };
}

function boundTargetMoved(editor: Editor, shape: CanvasShape) {
  return editor.getBindingsFromShape(shape.id, "arrow").some((binding) => {
    const target = editor.getShape(binding.toId);
    if (!target) return false;
    const previous = target.props.excalidraw;
    if (!previous) return true;
    const transform = editor.getPageTransform(target);
    const { w, h } = target.props;
    const current = nativeOrigin(
      transform.x,
      transform.y,
      w,
      h,
      transform.rotation,
    );
    return (
      Math.abs(current.x - previous.x) > 0.001 ||
      Math.abs(current.y - previous.y) > 0.001 ||
      Math.abs(w - previous.width) > 0.001 ||
      Math.abs(h - previous.height) > 0.001 ||
      Math.abs(transform.rotation - previous.angle) > 0.001
    );
  });
}

function refreshBoundArrow(
  editor: Editor,
  shape: CanvasShape,
  base: any,
  cached: Element,
) {
  const desired = editor.arrowPoints(shape);
  const transform = editor.getPageTransform(shape);
  const points = (
    cached.points || [
      [0, 0],
      [cached.width, cached.height],
    ]
  ).map(([x, y]: number[]) => ({
    x:
      transform.x +
      x * Math.cos(transform.rotation) -
      y * Math.sin(transform.rotation),
    y:
      transform.y +
      x * Math.sin(transform.rotation) +
      y * Math.cos(transform.rotation),
  }));
  const first = points[0];
  const last = points.at(-1)!;
  const moved = points.map((point: { x: number; y: number }, index: number) => {
    const t = index / Math.max(1, points.length - 1);
    return {
      x:
        point.x +
        (desired.start.x - first.x) * (1 - t) +
        (desired.end.x - last.x) * t,
      y:
        point.y +
        (desired.start.y - first.y) * (1 - t) +
        (desired.end.y - last.y) * t,
    };
  });
  base.x = moved[0].x;
  base.y = moved[0].y;
  base.angle = 0;
  base.points = moved.map((point: { x: number; y: number }) => [
    point.x - base.x,
    point.y - base.y,
  ]);
  base.width =
    Math.max(...moved.map((p: { x: number }) => p.x)) -
    Math.min(...moved.map((p: { x: number }) => p.x));
  base.height =
    Math.max(...moved.map((p: { y: number }) => p.y)) -
    Math.min(...moved.map((p: { y: number }) => p.y));
}

/** Converts legacy records lazily; an unedited document is never rewritten on open. */
export function sceneFromEditor(editor: Editor): ExcalidrawElement[] {
  const shapes = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type !== "group")
    .sort((a, b) => a.index.localeCompare(b.index));
  const ids = new Map(
    shapes.map((shape) => [shape.id, shape.props.excalidraw?.id || shape.id]),
  );
  const elements: Element[] = [];
  for (const shape of shapes) {
    const p = shape.props;
    const cached = p.excalidraw as Element | undefined;
    const id = ids.get(shape.id)!;
    const transform = editor.getPageTransform(shape);
    const family = ancestry(editor, shape);
    const w = Math.max(1, Number(p.w || cached?.width || 180));
    const h = Math.max(1, Number(p.h || cached?.height || 100));
    const origin = nativeOrigin(
      transform.x,
      transform.y,
      w,
      h,
      transform.rotation,
    );
    const base: any = {
      type: "rectangle",
      id,
      x: origin.x,
      y: origin.y,
      width: w,
      height: h,
      angle: transform.rotation,
      strokeColor: color(p.color),
      backgroundColor:
        p.fill && p.fill !== "none"
          ? color(p.color === "black" ? "#e9ecef" : p.color)
          : "transparent",
      fillStyle: p.fill === "pattern" ? "hachure" : "solid",
      strokeWidth:
        p.size === "s" ? 1 : p.size === "l" ? 3 : p.size === "xl" ? 4 : 2,
      strokeStyle:
        p.dash === "dashed"
          ? "dashed"
          : p.dash === "dotted"
            ? "dotted"
            : "solid",
      roughness: p.dash === "draw" ? 1 : 0,
      opacity: shape.opacity * 100,
      roundness: { type: 3 },
      seed: hash(id),
      version: 1,
      versionNonce: hash(id),
      isDeleted: false,
      groupIds: family.groups,
      frameId: family.frameId,
      index: null,
      boundElements: null,
      updated: 1,
      link: null,
      locked: shape.isLocked,
      ...cached,
    };
    Object.assign(base, {
      id,
      isDeleted: false,
      x: equivalent(origin.x, cached?.x ?? origin.x),
      y: equivalent(origin.y, cached?.y ?? origin.y),
      width: w,
      height: h,
      angle: transform.rotation,
      opacity: shape.opacity * 100,
      locked: shape.isLocked,
      frameId: family.frameId,
    });
    if (cached) {
      if (color(p.color) !== cached.strokeColor && p.color)
        base.strokeColor = color(p.color);
      const baseline = p.excalidrawStyle;
      if (baseline && p.fill !== baseline.fill)
        base.backgroundColor =
          p.fill === "none"
            ? "transparent"
            : color(p.color === "black" ? "#e9ecef" : p.color);
      if (baseline && p.size !== baseline.size)
        base.strokeWidth =
          p.size === "s" ? 1 : p.size === "l" ? 3 : p.size === "xl" ? 4 : 2;
      if (baseline && p.dash !== baseline.dash)
        base.strokeStyle =
          p.dash === "dashed"
            ? "dashed"
            : p.dash === "dotted"
              ? "dotted"
              : "solid";
    }
    base.customData = {
      ...cached?.customData,
      huayu: {
        id: shape.id,
        type: shape.type,
        ...(isCustomElement(shape) ? { props: cleanProps(p) } : {}),
      },
    };
    if (isCustomElement(shape)) {
      base.type = "rectangle";
      base.link = null;
      base.strokeWidth = 0;
      base.backgroundColor = "#ffffff";
      base.strokeColor = "transparent";
    } else if (shape.type === "frame") {
      base.type = "frame";
      base.name = p.name || t("canvas.frame");
      base.roundness = null;
    } else if (shape.type === "image") {
      base.type = "image";
      base.fileId = cached?.fileId || `huayu-${hash(shape.id)}`;
      base.scale = cached?.scale || [1, 1];
      base.status = "saved";
    } else if (shape.type === "text") {
      base.type = "text";
      base.text = p.text || plainText(p.richText);
      base.originalText = base.text;
      base.fontSize =
        p.fontSize ||
        cached?.fontSize ||
        { s: 16, m: 20, l: 28, xl: 36 }[p.size] ||
        20;
      base.fontFamily = cached?.fontFamily || 2;
      base.textAlign =
        p.textAlign === "middle"
          ? "center"
          : p.textAlign === "end"
            ? "right"
            : "left";
      base.verticalAlign = "top";
      base.lineHeight = cached?.lineHeight || 1.25;
      base.containerId = cached?.containerId || null;
      base.autoResize = cached?.autoResize ?? false;
      base.roundness = null;
    } else if (shape.type === "arrow" || shape.type === "line") {
      base.type = shape.type;
      if (!cached) {
        if (shape.type === "arrow") {
          const points = editor.arrowPoints(shape);
          base.x = points.start.x;
          base.y = points.start.y;
          base.angle = 0;
          const dx = points.end.x - base.x;
          const dy = points.end.y - base.y;
          const length = Math.hypot(dx, dy) || 1;
          base.points = [
            [0, 0],
            ...(p.bend
              ? [
                  [
                    dx / 2 - (dy / length) * p.bend,
                    dy / 2 + (dx / length) * p.bend,
                  ],
                ]
              : []),
            [dx, dy],
          ];
          base.width = Math.abs(dx);
          base.height = Math.abs(dy);
        } else {
          base.x = transform.x;
          base.y = transform.y;
          base.points = Object.values(p.points || {}).map((point: any) => [
            point.x,
            point.y,
          ]);
        }
        base.lastCommittedPoint = null;
        base.startBinding = null;
        base.endBinding = null;
        base.startArrowhead =
          p.arrowheadStart === "none" ? null : p.arrowheadStart || null;
        base.endArrowhead =
          shape.type === "arrow"
            ? p.arrowheadEnd === "none"
              ? null
              : p.arrowheadEnd || "triangle"
            : null;
        base.elbowed = false;
      }
      if (shape.type === "arrow") {
        if (cached && boundTargetMoved(editor, shape))
          refreshBoundArrow(editor, shape, base, cached);
        for (const terminal of ["start", "end"] as const) {
          const binding = editor
            .getBindingsFromShape(shape.id, "arrow")
            .find((b) => b.props.terminal === terminal);
          if (binding && ids.has(binding.toId))
            base[`${terminal}Binding`] = {
              ...(cached?.[`${terminal}Binding`] || {}),
              elementId: ids.get(binding.toId),
              focus: cached?.[`${terminal}Binding`]?.focus || 0,
              gap: cached?.[`${terminal}Binding`]?.gap ?? 6,
              fixedPoint: cached?.[`${terminal}Binding`]?.fixedPoint || null,
            };
          else base[`${terminal}Binding`] = null;
        }
      }
    } else if (shape.type === "draw" || shape.type === "highlight") {
      base.type = "freedraw";
      if (!cached) {
        const points = (p.segments || []).flatMap(
          (segment: any) => segment.points || [],
        );
        base.x = transform.x;
        base.y = transform.y;
        base.points = points.map((point: any) => [point.x, point.y]);
        base.pressures = points.map((point: any) => point.z ?? 0.5);
        base.simulatePressure = !p.isPen;
        base.lastCommittedPoint = null;
        if (shape.type === "highlight") {
          base.strokeWidth = 16;
          base.opacity *= 0.35;
        }
      }
    } else {
      base.type =
        shape.type === "geo"
          ? p.geo === "ellipse"
            ? "ellipse"
            : p.geo === "diamond"
              ? "diamond"
              : "rectangle"
          : "rectangle";
      if (shape.type === "note" && !cached) base.backgroundColor = "#fff3bf";
    }
    if (isCustomElement(shape))
      base.customData.huayu.contentHash = hash(JSON.stringify(cleanProps(p)));
    let text = p.text || plainText(p.richText);
    if (
      shape.type === "arrow" &&
      text &&
      isLegacyConnectionLabel(editor, shape.id, text)
    ) {
      text = "";
      const labelId = p.excalidrawLabel?.id || `${id}-label`;
      const boundElements =
        base.boundElements as ExcalidrawElement["boundElements"];
      base.boundElements =
        boundElements?.filter(
          (item) => item.type !== "text" || item.id !== labelId,
        ) ?? null;
    }
    const signature = JSON.stringify({
      ...withoutTransientMetadata(base),
      version: 0,
      versionNonce: 0,
      updated: 0,
    });
    const previous = cached
      ? JSON.stringify({ ...cached, version: 0, versionNonce: 0, updated: 0 })
      : "";
    if (signature !== previous) {
      base.version = (cached?.version || 0) + 1;
      base.versionNonce = hash(signature);
      base.updated = cached ? Date.now() : 1;
    }
    elements.push(base);
    if (
      ["geo", "note", "arrow"].includes(shape.type) &&
      !isCustomElement(shape) &&
      text
    ) {
      const fontSize =
        p.excalidrawLabel?.fontSize ||
        { s: 16, m: 20, l: 28, xl: 36 }[p.size] ||
        20;
      const label: any = {
        ...base,
        ...p.excalidrawLabel,
        id: p.excalidrawLabel?.id || `${id}-label`,
        type: "text",
        x: base.x + 12,
        y: base.y + 12,
        width: Math.max(1, w - 24),
        height: Math.max(fontSize * 1.25, h - 24),
        text,
        originalText: text,
        fontFamily: p.excalidrawLabel?.fontFamily || 2,
        fontSize,
        lineHeight: 1.25,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: id,
        autoResize: true,
        backgroundColor: "transparent",
        strokeColor: color(p.color),
        roundness: null,
        boundElements: null,
        link: null,
        customData: { huayuLabelFor: shape.id },
      };
      if (shape.type === "arrow") {
        const points = base.points;
        const middle =
          points.length > 2
            ? points[Math.floor(points.length / 2)]
            : [
                (points[0][0] + points.at(-1)[0]) / 2,
                (points[0][1] + points.at(-1)[1]) / 2,
              ];
        label.width = Math.max(
          40,
          Math.min(320, text.length * fontSize * 0.65),
        );
        label.height = fontSize * 1.25;
        label.x = base.x + middle[0] - label.width / 2;
        label.y = base.y + middle[1] - label.height / 2;
      }
      base.boundElements = [
        ...(base.boundElements || []).filter(
          (item: any) => item.type !== "text",
        ),
        { id: label.id, type: "text" },
      ];
      elements.push(label);
    }
  }
  for (const arrow of elements.filter((element) => element.type === "arrow"))
    for (const binding of [arrow.startBinding, arrow.endBinding]) {
      const target =
        binding && elements.find((element) => element.id === binding.elementId);
      if (target)
        (target as any).boundElements = [
          ...(target.boundElements || []).filter(
            (item) => item.id !== arrow.id,
          ),
          { id: arrow.id, type: "arrow" },
        ];
    }
  return repairFrameArrowMembership(elements) ?? elements;
}

export function shapeIdForElement(editor: Editor, element: ExcalidrawElement) {
  const hint = element.customData?.huayu?.id;
  const existing = hint && editor.getShape(hint);
  if (
    existing &&
    editor.pageOf(existing.id) === editor.getCurrentPageId() &&
    (existing.props.excalidraw?.id || existing.id) === element.id
  )
    return existing.id;
  const byNative = editor
    .getCurrentPageShapes()
    .find((shape) => shape.props.excalidraw?.id === element.id);
  if (byNative) return byNative.id;
  const candidate = element.id.startsWith("shape:")
    ? element.id
    : `shape:${element.id}`;
  return editor.getShape(candidate) &&
    editor.pageOf(candidate) !== editor.getCurrentPageId()
    ? `shape:${editor.getCurrentPageId()}:${element.id}`
    : candidate;
}
export function withoutTransientMetadata(
  element: ExcalidrawElement,
): ExcalidrawElement {
  const copy = structuredClone(element);
  if (copy.customData?.huayu) {
    const { props, ...reference } = copy.customData.huayu;
    copy.customData.huayu = reference;
  }
  if (
    copy.type === "text" &&
    !copy.containerId &&
    copy.customData?.huayuLabelFor
  )
    delete copy.customData.huayuLabelFor;
  return copy;
}

/** Rebase unrelated adapter metadata before capturing a local edit in native history. */
export function sceneBeforeLocalChange(
  current: readonly ExcalidrawElement[],
  next: readonly ExcalidrawElement[],
  changedShapeIds: ReadonlySet<string>,
): ExcalidrawElement[] {
  const changed = (element: ExcalidrawElement) =>
    changedShapeIds.has(
      (element.type === "text" &&
        element.containerId &&
        element.customData?.huayuLabelFor) ||
        element.customData?.huayu?.id ||
        (element.id.startsWith("shape:") ? element.id : `shape:${element.id}`),
    );
  const previous = new Map(current.map((element) => [element.id, element]));
  const upcoming = new Set(next.map((element) => element.id));
  return [
    ...next.flatMap((element) => {
      if (!changed(element)) return [element];
      const before = previous.get(element.id);
      return before ? [before] : [];
    }),
    ...current.filter(
      (element) => !upcoming.has(element.id) && changed(element),
    ),
  ];
}

export function selectedShapesFromScene(
  editor: Editor,
  elements: readonly ExcalidrawElement[],
  selected: Readonly<Record<string, boolean>>,
) {
  const ids = elements
    .filter(
      (element) =>
        selected[element.id] &&
        !element.isDeleted &&
        !(
          element.type === "text" &&
          element.containerId &&
          element.customData?.huayuLabelFor
        ),
    )
    .map((element) => shapeIdForElement(editor, element));
  const nativeIds = new Set(elements.map((element) => element.id));
  // Camera notifications can arrive before the async scene update installs a new canonical shape.
  const current = editor.getSelectedShapeIds();
  for (const id of current) {
    const shape = editor.getShape(id);
    if (shape && !nativeIds.has(shape.props.excalidraw?.id || id))
      return current;
  }
  return [...new Set(ids)];
}

/** Native elements are retained verbatim, including groups, bindings, pressure and future fields. */
export function applyNativeScene(
  editor: Editor,
  incoming: readonly ExcalidrawElement[],
) {
  const live = incoming.filter((element) => !element.isDeleted) as Element[];
  const elements = (repairFrameArrowMembership(live) ?? live) as Element[];
  const ids = new Map(
    elements.map((element) => [element.id, shapeIdForElement(editor, element)]),
  );
  const pageId = editor.getCurrentPageId();
  const records: CanvasRecord[] = [];
  const active = new Set<string>();
  for (const [index, element] of elements.entries()) {
    if (
      element.type === "text" &&
      element.containerId &&
      element.customData?.huayuLabelFor
    )
      continue;
    const id = ids.get(element.id)!;
    const previous = editor.getShape(id);
    const hint = element.customData?.huayu;
    const nativeType = element.type;
    const type =
      previous?.type ||
      hint?.type ||
      {
        rectangle: "geo",
        ellipse: "geo",
        diamond: "geo",
        freedraw: "draw",
        magicframe: "frame",
        embeddable: "embed",
        iframe: "embed",
      }[nativeType] ||
      nativeType;
    // Card metadata contains a complete content snapshot, including property removals.
    const p = { ...(hint?.props || previous?.props || {}) };
    const origin = canonicalOrigin(element);
    const frame = element.frameId
      ? elements.find(
          (item) =>
            item.id === element.frameId &&
            ["frame", "magicframe"].includes(item.type),
        )
      : undefined;
    let x = origin.x;
    let y = origin.y;
    let rotation = origin.rotation;
    let parentId = pageId;
    if (frame && ids.get(frame.id) !== id) {
      const parent = canonicalOrigin(frame);
      const dx = origin.x - parent.x;
      const dy = origin.y - parent.y;
      x = dx * Math.cos(-parent.rotation) - dy * Math.sin(-parent.rotation);
      y = dx * Math.sin(-parent.rotation) + dy * Math.cos(-parent.rotation);
      rotation -= parent.rotation;
      parentId = ids.get(frame.id)!;
    }
    Object.assign(p, {
      w: Math.max(1, element.width),
      h: Math.max(1, element.height),
      excalidraw: withoutTransientMetadata(element),
    });
    if (!isCustomElement({ type, props: p } as CanvasShape)) {
      Object.assign(p, {
        color: element.strokeColor,
        fill: element.backgroundColor === "transparent" ? "none" : "solid",
        dash:
          element.strokeStyle === "dotted"
            ? "dotted"
            : element.strokeStyle === "dashed"
              ? "dashed"
              : "solid",
      });
    }
    if (nativeType === "text")
      Object.assign(p, {
        text: element.text,
        richText: richText(element.text),
        fontSize: element.fontSize,
        textAlign:
          element.textAlign === "center"
            ? "middle"
            : element.textAlign === "right"
              ? "end"
              : "start",
      });
    if (
      type === "geo" &&
      ["rectangle", "ellipse", "diamond"].includes(nativeType)
    )
      p.geo = nativeType;
    if (nativeType === "frame" || nativeType === "magicframe")
      p.name = element.name || t("canvas.frame");
    if (nativeType === "embeddable" && !hint) p.url = element.link || "";
    if (nativeType === "image")
      p.assetId =
        previous?.props.excalidraw?.fileId === element.fileId ||
        (!previous?.props.excalidraw && previous?.props.assetId)
          ? previous.props.assetId
          : `asset:excalidraw:${element.fileId}`;
    if (nativeType === "freedraw")
      p.segments = [
        {
          type: "free",
          points: (element.points || []).map((point: number[], i: number) => ({
            x: point[0],
            y: point[1],
            z: element.pressures?.[i] ?? 0.5,
          })),
        },
      ];
    if (nativeType === "arrow" || nativeType === "line") {
      const points = element.points || [
        [0, 0],
        [element.width, element.height],
      ];
      Object.assign(p, {
        start: { x: points[0][0], y: points[0][1] },
        end: { x: points.at(-1)[0], y: points.at(-1)[1] },
        arrowheadStart: element.startArrowhead || "none",
        arrowheadEnd: element.endArrowhead || "none",
        points: Object.fromEntries(
          points.map((point: number[], i: number) => [
            `p${i}`,
            { id: `p${i}`, index: `a${i}`, x: point[0], y: point[1] },
          ]),
        ),
      });
    }
    const label = elements.find(
      (item) =>
        item.customData?.huayuLabelFor && item.containerId === element.id,
    );
    if (label)
      Object.assign(p, {
        text: label.text,
        richText: richText(label.text),
        excalidrawLabel: withoutTransientMetadata(label),
      });
    else if (
      p.excalidrawLabel &&
      !isCustomElement({ type, props: p } as CanvasShape)
    ) {
      // A deleted or unbound caption must not reappear on the next editor update.
      p.text = "";
      p.richText = richText("");
      delete p.excalidrawLabel;
    }
    p.excalidrawStyle = {
      color: p.color,
      fill: p.fill,
      dash: p.dash,
      size: p.size,
    };
    records.push({
      id,
      typeName: "shape",
      type,
      x,
      y,
      rotation,
      parentId,
      opacity: element.opacity / 100,
      isLocked: element.locked,
      index: `b${String(index).padStart(12, "0")}`,
      meta: previous?.meta || {},
      props: p,
    });
    active.add(id);
  }
  for (const element of elements.filter((item) => item.type === "arrow")) {
    const fromId = ids.get(element.id)!;
    for (const terminal of ["start", "end"] as const) {
      const binding = element[`${terminal}Binding`];
      const target = binding && ids.get(binding.elementId);
      if (!target) continue;
      const previous = editor
        .getBindingsFromShape(fromId, "arrow")
        .find((item) => item.props.terminal === terminal);
      const id = previous?.id || `binding:${fromId}:${terminal}`;
      records.push({
        id,
        typeName: "binding",
        type: "arrow",
        fromId,
        toId: target,
        props: {
          terminal,
          normalizedAnchor: binding.fixedPoint
            ? { x: binding.fixedPoint[0], y: binding.fixedPoint[1] }
            : (previous?.toId === target &&
                previous.props.normalizedAnchor) || {
                x: terminal === "start" ? 1 : 0,
                y: 0.5,
              },
          isExact: false,
          isPrecise:
            !!binding.fixedPoint ||
            (previous?.toId === target && !!previous.props.isPrecise),
        },
        meta: previous?.meta || {},
      });
      active.add(id);
    }
  }
  const removed = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type !== "group" && !active.has(shape.id))
    .map((shape) => shape.id);
  for (const record of editor.store.allRecords())
    if (
      record.typeName === "binding" &&
      (removed.includes(record.fromId) ||
        removed.includes(record.toId) ||
        (ids.size &&
          editor.pageOf(record.fromId) === pageId &&
          !active.has(record.id)))
    )
      removed.push(record.id);
  editor.store.batch(() => {
    editor.store.put(records);
    editor.store.remove(removed);
  });
}
