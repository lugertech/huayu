import { t, type Locale } from "@/i18n";
import { Bounds } from "@/features/canvas/engine/bounds";
import { plainText, type CanvasShape } from "@/features/canvas/engine/model";
import type { Editor } from "@/features/canvas/engine/editor";
import {
  COMPONENT_CONFIGS,
  componentConfig,
  type ComponentType,
} from "@/config/components";

export const INSPECT_EVENT = "huayu:inspect-content";
export function requestInspection(editor: Editor, id: string) {
  editor.container?.dispatchEvent(
    new CustomEvent(INSPECT_EVENT, {
      detail: id,
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

/** AI drawing edits the native shapes contained in its own selection box. */
export function drawingShapes(editor: Editor, drawing: CanvasShape) {
  const bounds = editor.getShapePageBounds(drawing)!;
  return editor.getCurrentPageShapes().filter((shape) => {
    if (shape.type in COMPONENT_CONFIGS || shape.type === "group") return false;
    const box = editor.getShapePageBounds(shape);
    return (
      box &&
      box.x >= bounds.x &&
      box.y >= bounds.y &&
      box.maxX <= bounds.maxX &&
      box.maxY <= bounds.maxY
    );
  });
}

export function materialLabel(shape: CanvasShape, locale?: Locale): string {
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
    (locale
      ? componentConfig(shape.type as ComponentType, locale)
      : COMPONENT_CONFIGS[shape.type as ComponentType]
    )?.displayName ||
    {
      image: t("common.image", undefined, locale),
      draw: t("workflow.drawing", undefined, locale),
      geo: t("workflow.shape", undefined, locale),
      note: t("workflow.stickyNote", undefined, locale),
      text: t("common.text", undefined, locale),
      line: t("workflow.line", undefined, locale),
    }[shape.type] ||
    t("workflow.canvasContent", undefined, locale)
  );
}

export function focusShapes(editor: Editor, ids: string[]) {
  const bounds = ids
    .map((id) => editor.getShapePageBounds(id))
    .filter(Boolean) as Bounds[];
  if (bounds.length) editor.zoomToBounds(Bounds.union(bounds));
}
