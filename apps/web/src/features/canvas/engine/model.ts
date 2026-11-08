import { LocalizedError } from "@/i18n/errors";
import { t } from "@/i18n";
/** Application-owned records. Legacy document records remain readable without their original SDK. */
export type ShapeId = string;
export interface VecLike {
  x: number;
  y: number;
}
export interface BaseShape<
  Type extends string = string,
  Props = Record<string, any>,
> {
  id: ShapeId;
  typeName: "shape";
  type: Type;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  parentId: string;
  index: string;
  isLocked: boolean;
  meta: Record<string, unknown>;
  props: Props;
}
export type CanvasShape = BaseShape;
export interface ArrowBinding {
  id: string;
  typeName: "binding";
  type: "arrow";
  fromId: string;
  toId: string;
  props: {
    terminal: "start" | "end";
    normalizedAnchor: VecLike;
    isExact?: boolean;
    isPrecise?: boolean;
  };
  meta?: Record<string, unknown>;
}
export interface OtherRecord {
  id: string;
  typeName: "document" | "page" | "asset";
  [key: string]: any;
}
export type CanvasRecord = CanvasShape | ArrowBinding | OtherRecord;
export interface DocumentSnapshot<T = CanvasRecord> {
  store: Record<string, T>;
  schema: unknown;
}
export interface CanvasSession {
  version: 1;
  currentPageId: string;
  camera: { x: number; y: number; z: number };
  selectedShapeIds: string[];
  pageStates?: Array<{
    pageId: string;
    camera: { x: number; y: number; z: number };
    selectedShapeIds?: string[];
  }>;
}
export const createShapeId = (id: string = crypto.randomUUID()) =>
  id.startsWith("shape:") ? id : `shape:${id}`;
export const createBindingId = () => `binding:${crypto.randomUUID()}`;
export const SCHEMA = { schemaVersion: 1, sequences: { "huayu.canvas": 1 } };
export const EMPTY_TEXT = { type: "doc", content: [{ type: "paragraph" }] };
export function richText(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
export function plainText(value: any): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (value.text) return String(value.text);
  return (value.content || [])
    .map(plainText)
    .join(value.type === "doc" ? "\n" : "");
}
export function defaultProps(type: string): Record<string, any> {
  const style = {
    color: "black",
    fill: "none",
    dash: "solid",
    size: "m",
    font: "sans",
    textAlign: "middle",
    verticalAlign: "middle",
    richText: EMPTY_TEXT,
  };
  if (type === "arrow")
    return {
      ...style,
      start: { x: 0, y: 0 },
      end: { x: 160, y: 0 },
      bend: 0,
      arrowheadStart: "none",
      arrowheadEnd: "triangle",
      text: "",
    };
  if (type === "line")
    return {
      ...style,
      points: {
        a1: { id: "a1", index: "a1", x: 0, y: 0 },
        a2: { id: "a2", index: "a2", x: 160, y: 80 },
      },
    };
  if (type === "draw" || type === "highlight")
    return { ...style, segments: [], isComplete: true, isPen: false, scale: 1 };
  if (type === "text")
    return {
      ...style,
      w: 240,
      h: 40,
      autoSize: true,
      scale: 1,
      textAlign: "start",
    };
  if (type === "note")
    return {
      ...style,
      w: 200,
      h: 200,
      color: "yellow",
      fill: "solid",
      scale: 1,
      growY: 0,
    };
  if (type === "geo")
    return { ...style, w: 180, h: 120, geo: "rectangle", growY: 0 };
  if (type === "frame" || type === "group")
    return {
      w: 600,
      h: 400,
      name: type === "frame" ? t("canvas.frame") : t("canvas.group"),
    };
  if (type === "image" || type === "video")
    return { w: 360, h: 240, assetId: null, url: "", playing: false };
  if (type === "embed") return { w: 640, h: 400, url: "" };
  if (type === "bookmark") return { w: 320, h: 180, url: "", assetId: null };
  return { w: 350, h: 180 };
}
export function normalizeRecord(value: unknown, key?: string): CanvasRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LocalizedError({ key: "canvas.invalidCanvasRecordFormat" });
  const record = structuredClone(value) as Record<string, any>;
  if (typeof record.id !== "string" || !record.id || (key && record.id !== key))
    throw new LocalizedError({ key: "canvas.invalidCanvasRecordId" });
  if (
    !["document", "page", "shape", "binding", "asset"].includes(record.typeName)
  )
    throw new LocalizedError({
      key: "canvas.theProjectFileContainsInvalidRecords",
    });
  if (record.typeName === "shape") {
    if (
      typeof record.type !== "string" ||
      !record.props ||
      typeof record.props !== "object" ||
      Array.isArray(record.props)
    )
      throw new LocalizedError({ key: "canvas.invalidShapeData" });
    for (const field of ["x", "y", "rotation"])
      if (
        record[field] !== undefined &&
        (!Number.isFinite(record[field]) || Math.abs(record[field]) > 1e9)
      )
        throw new LocalizedError({ key: "canvas.invalidShapeCoordinates" });
    for (const field of ["w", "h"])
      if (
        record.props[field] !== undefined &&
        (!Number.isFinite(record.props[field]) ||
          record.props[field] <= 0 ||
          record.props[field] > 1e7)
      )
        throw new LocalizedError({ key: "canvas.invalidShapeDimensions" });
    Object.assign(record, {
      x: record.x || 0,
      y: record.y || 0,
      rotation: record.rotation || 0,
      opacity: Number.isFinite(record.opacity)
        ? Math.max(0, Math.min(1, record.opacity))
        : 1,
      parentId: record.parentId || "page:page",
      index: record.index || "a1",
      isLocked: !!record.isLocked,
      meta: record.meta || {},
      props: { ...defaultProps(record.type), ...record.props },
    });
  }
  if (
    record.typeName === "binding" &&
    (typeof record.fromId !== "string" ||
      typeof record.toId !== "string" ||
      !["start", "end"].includes(record.props?.terminal))
  )
    throw new LocalizedError({ key: "canvas.invalidConnectionBinding" });
  return record as CanvasRecord;
}
