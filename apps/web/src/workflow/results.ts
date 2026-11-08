import { LocalizedError } from "@/i18n/errors";
import { t } from "@/i18n";
import type { CanvasShape, Editor } from "@/features/canvas/editor";
import { createConnectedComponent } from "@/features/canvas/connection-parser";
import { nodeIsBusy } from "./execute";

export type ResultKind = "text" | "image" | "website";
export const IMAGE_RATIOS = [
  "1:1",
  "3:2",
  "4:3",
  "16:9",
  "21:9",
  "2:3",
  "3:4",
  "9:16",
];
export function imageRatio(width: number, height: number) {
  if (!(width > 0 && height > 0)) return "1:1";
  return [...IMAGE_RATIOS].sort((a, b) => {
    const ratio = (value: string) => {
      const [w, h] = value.split(":").map(Number);
      return Math.abs(Math.log(w / h / (width / height)));
    };
    return ratio(a) - ratio(b);
  })[0];
}
export function resultKind(shape: CanvasShape): ResultKind | null {
  if (
    shape.type === "ai-text" ||
    (shape.type === "instruction" && typeof shape.props.result === "string")
  )
    return "text";
  if (
    ["ai-image", "image"].includes(shape.type) &&
    (shape.props.src || shape.props.assetId)
  )
    return "image";
  if (shape.type === "website" && typeof shape.props.htmlContent === "string")
    return "website";
  return null;
}
export function resultText(shape: CanvasShape): string {
  return String(
    shape.type === "website"
      ? (shape.props.htmlContent ?? "")
      : (shape.props.result ?? shape.props.text ?? ""),
  );
}
export function resultSource(editor: Editor, shape: CanvasShape): string {
  return (
    shape.props.src || editor.store.get(shape.props.assetId)?.props?.src || ""
  );
}
function editable(editor: Editor, id: string) {
  const shape = editor.getShape(id);
  if (!shape || editor.pageOf(id) !== editor.getCurrentPageId())
    throw new LocalizedError({ key: "workflow.thisWorkIsNoLongerOnTheCanvas" });
  if (shape.isLocked || shape.props.isLocked)
    throw new LocalizedError({ key: "workflow.unlockThisWorkBeforeEditing" });
  if (nodeIsBusy(editor, id))
    throw new LocalizedError({ key: "workflow.thisWorkIsBeingGenerated" });
  return shape;
}

/** Edit the output field, keeping the request and all downstream links intact. */
export function saveResultEdit(
  editor: Editor,
  id: string,
  base: string,
  content: string,
) {
  const shape = editable(editor, id);
  if (resultText(shape) !== base)
    throw new LocalizedError({ key: "workflow.thisWorkWasUpdatedElsewhere" });
  if (resultKind(shape) === "image" || !resultKind(shape))
    throw new LocalizedError({
      key: "workflow.textCannotBeEditedDirectlyForThisTypeOfWork",
    });
  if (base === content) return;
  editor.run(() =>
    editor.updateShape({
      id,
      meta: { ...shape.meta, editedAt: Date.now() },
      props:
        shape.type === "website"
          ? { htmlContent: content, result: content }
          : shape.type === "instruction"
            ? { result: content }
            : { text: content, result: undefined, generation: undefined },
    }),
  );
}

export function resultVersions(editor: Editor, shape: CanvasShape) {
  let root = shape;
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    seen.add(root.id);
    const parent = previousRevision(editor, root);
    if (!parent || seen.has(parent.id)) break;
    root = parent;
  }
  const versions = new Map<string, CanvasShape>([[root.id, root]]);
  const candidates = editor
    .getCurrentPageShapes()
    .filter((item) => resultKind(item))
    .sort(
      (a, b) =>
        Number(a.meta.revisionCreatedAt || 0) -
          Number(b.meta.revisionCreatedAt || 0) ||
        a.index.localeCompare(b.index),
    );
  for (let i = 0; i < candidates.length; i++) {
    const before = versions.size;
    for (const item of candidates)
      if (
        typeof item.meta.revisionOf === "string" &&
        versions.has(item.meta.revisionOf)
      )
        versions.set(item.id, item);
    if (versions.size === before) break;
  }
  const steps = new Set(
    [...versions.values()].map((item) => item.meta.creationStep),
  );
  return [...versions.values()].filter(
    (item) => item.id === shape.id || !steps.has(item.id),
  );
}
export function previousRevision(
  editor: Editor,
  shape: CanvasShape,
): CanvasShape | undefined {
  const id = shape.meta.revisionOf;
  return typeof id === "string" &&
    id !== shape.id &&
    editor.pageOf(id) === editor.getCurrentPageId()
    ? editor.getShape(id)
    : undefined;
}
export function createImageRevision(
  editor: Editor,
  sourceId: string,
  src: string,
  width: number,
  height: number,
) {
  const source = editor.getShape(sourceId);
  if (!source || editor.pageOf(sourceId) !== editor.getCurrentPageId())
    throw new LocalizedError({
      key: "workflow.theOriginalImageIsNoLongerOnTheCanvas",
    });
  let id: string | null = null;
  editor.run(() => {
    id = createConnectedComponent(editor, [sourceId], "ai-image", "");
    if (!id) throw new LocalizedError({ key: "workflow.cannotSaveANewImage" });
    editor.updateShape({
      id,
      meta: {
        revisionOf: sourceId,
        editedAt: Date.now(),
        revisionCreatedAt: Date.now(),
      },
      props: {
        src,
        isUploaded: true,
        name: t("workflow.edited", {
          arg0: source.props.name || t("common.image"),
        }),
        description: `${width} × ${height}`,
        imageSize: imageRatio(width, height),
        h: Math.max(240, Math.min(520, (400 * height) / width + 36)),
      },
    });
  });
  return id!;
}

export interface ResultDraft {
  base: string;
  content: string;
}
export const resultDraftKey = (project: string, page: string, id: string) =>
  `huayu:result:v1:${encodeURIComponent(project)}:${encodeURIComponent(page)}:${encodeURIComponent(id)}`;
export function readResultDraft(
  raw: string | null,
  shape: CanvasShape,
): ResultDraft {
  const empty = {
    base: resultText(shape),
    content: resultText(shape),
  };
  try {
    const value = JSON.parse(raw || "null");
    if (
      value?.version !== 1 ||
      !["base", "content"].every((key) => typeof value[key] === "string")
    )
      return empty;
    return {
      base: value.base,
      content: value.content,
    };
  } catch {
    return empty;
  }
}
