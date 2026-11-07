import { t, type Locale } from "@/i18n";
import type { CanvasShape, Editor } from "@/canvas/editor";
import { connectedShapes } from "@/utils/connectionParser";
import { drawingShapes } from "./context";

export interface GenerationInfo {
  fingerprint: string;
  completedAt: number;
  durationMs: number;
}

const contentKeys = [
  "text",
  "result",
  "query",
  "src",
  "htmlContent",
  "chartData",
  "url",
  "webpageContent",
  "fileName",
  "name",
  "description",
  "richText",
  "geo",
  "color",
  "fill",
  "dash",
  "size",
  "segments",
  "points",
  "isUploaded",
];
const cache = new WeakMap<
  Editor,
  { version: number; values: Map<string, string> }
>();
function hash(value: unknown) {
  const text = JSON.stringify(value);
  let result = 2166136261;
  for (let i = 0; i < text.length; i++)
    result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16).padStart(8, "0");
}
function content(editor: Editor, shape: CanvasShape, visual = false): unknown {
  const props = Object.fromEntries(
    contentKeys.map((key) => [key, shape.props[key]]),
  );
  if (shape.props.assetId)
    props.src =
      shape.props.src || editor.store.get(shape.props.assetId)?.props?.src;
  return {
    type: shape.type,
    props,
    ...(visual
      ? {
          x: shape.x,
          y: shape.y,
          rotation: shape.rotation,
          opacity: shape.opacity,
          w: shape.props.w,
          h: shape.props.h,
        }
      : {}),
    ...(shape.type === "frame"
      ? {
          children: editor
            .descendants(shape.id)
            .map((child) => content(editor, child, true)),
        }
      : {}),
  };
}
function materialFingerprint(
  editor: Editor,
  id: string,
  seen = new Set<string>(),
): string {
  let current = cache.get(editor);
  if (current?.version !== editor.getVersion()) {
    current = { version: editor.getVersion(), values: new Map() };
    cache.set(editor, current);
  }
  if (current.values.has(id)) return current.values.get(id)!;
  if (seen.has(id) || seen.size > 100) return id;
  const shape = editor.getShape(id);
  if (!shape) return "missing";
  const next = new Set(seen).add(id);
  const value = hash({
    content: content(
      editor,
      shape,
      ["geo", "draw", "line", "arrow", "note", "frame"].includes(shape.type),
    ),
    sources: (shape.props.isLocked
      ? []
      : connectedShapes(editor, id, "previous")
    )
      .map((source) => [
        source.id,
        materialFingerprint(editor, source.id, next),
      ])
      .sort(),
  });
  current.values.set(id, value);
  return value;
}

/** Only canvas content contributes; model connections and credentials never enter this record. */
export function generationFingerprint(editor: Editor, id: string): string {
  const shape = editor.getShape(id);
  if (!shape) return "missing";
  const props = shape.props;
  const manualImage =
    shape.type === "ai-image" &&
    (props.isUploaded === true ||
      (props.isUploaded === undefined && !props.result));
  return hash({
    type: shape.type,
    prompt: props.text || props.query || "",
    options: {
      imageSize: props.imageSize,
      useWebSearch: props.useWebSearch,
      chartType: props.chartType,
      url: props.url,
    },
    ...(manualImage ? { reference: props.src } : {}),
    sources: connectedShapes(editor, id, "previous")
      .map((source) => [source.id, materialFingerprint(editor, source.id)])
      .sort(),
    ...(shape.type === "ai-draw"
      ? {
          page: drawingShapes(editor, shape)
            .map((item) => [item.id, content(editor, item, true)])
            .sort(),
        }
      : {}),
  });
}

export function generationInfo(
  shape?: CanvasShape,
): GenerationInfo | undefined {
  const value = shape?.props.generation;
  return value &&
    typeof value.fingerprint === "string" &&
    Number.isFinite(value.completedAt) &&
    Number.isFinite(value.durationMs)
    ? value
    : undefined;
}

export function resultIsStale(editor: Editor, id: string) {
  const info = generationInfo(editor.getShape(id));
  if (!info) return false;
  const seen = new Set<string>();
  function changed(current: string): boolean {
    if (seen.has(current) || seen.size > 100) return false;
    seen.add(current);
    const shape = editor.getShape(current);
    if (!shape || (current !== id && shape.props.isLocked)) return false;
    const generation = generationInfo(shape);
    return (
      (!!generation &&
        generation.fingerprint !== generationFingerprint(editor, current)) ||
      connectedShapes(editor, current, "previous").some((source) =>
        changed(source.id),
      )
    );
  }
  return changed(id);
}

export function formatElapsed(milliseconds: number, locale?: Locale) {
  const seconds = Math.max(0, milliseconds) / 1000;
  return seconds < 60
    ? t(
        "common.duration.seconds",
        { arg0: seconds < 10 ? seconds.toFixed(1) : Math.floor(seconds) },
        locale,
      )
    : t(
        "common.duration.minutesSeconds",
        {
          arg0: Math.floor(seconds / 60),
          arg1: Math.floor(seconds % 60),
        },
        locale,
      );
}
