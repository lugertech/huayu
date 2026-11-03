import { t } from "@/i18n";
import type { CanvasShape, Editor } from "@/canvas/editor";
import {
  connectedShapes,
  createConnectedComponent,
} from "@/utils/connectionParser";
import { nodeExecution } from "./execute";

export type ResultKind = "text" | "image" | "website";
export type RevisionType = "instruction" | "ai-image" | "website";
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
export function revisionType(shape: CanvasShape): RevisionType {
  return resultKind(shape) === "image"
    ? "ai-image"
    : resultKind(shape) === "website"
      ? "website"
      : "instruction";
}
export function pendingRevision(
  editor: Editor,
  sourceId: string,
  type: RevisionType,
  prompt: string,
) {
  if (!prompt.trim()) return null;
  return (
    editor
      .getCurrentPageShapes()
      .filter(
        (item) =>
          item.meta.revisionOf === sourceId &&
          item.type === type &&
          item.props.text === prompt.trim() &&
          !resultKind(item),
      )
      .sort(
        (a, b) =>
          Number(b.meta.revisionCreatedAt || 0) -
          Number(a.meta.revisionCreatedAt || 0),
      )[0]?.id || null
  );
}
function editable(editor: Editor, id: string) {
  const shape = editor.getShape(id);
  if (!shape || editor.pageOf(id) !== editor.getCurrentPageId())
    throw new Error(t("workflow.thisWorkIsNoLongerOnTheCanvas"));
  if (shape.isLocked || shape.props.isLocked)
    throw new Error(t("workflow.unlockThisWorkBeforeEditing"));
  if (["running", "queued"].includes(nodeExecution(editor, id).status))
    throw new Error(t("workflow.thisWorkIsBeingGenerated"));
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
    throw new Error(t("workflow.thisWorkWasUpdatedElsewhere"));
  if (resultKind(shape) === "image" || !resultKind(shape))
    throw new Error(t("workflow.textCannotBeEditedDirectlyForThisTypeOfWork"));
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

/** Revisions are new branches: making another version never reruns or replaces its source. */
export function createResultRevision(
  editor: Editor,
  sourceId: string,
  type: RevisionType,
  prompt: string,
  options: { imageSize?: string } = {},
) {
  const source = editor.getShape(sourceId);
  if (!source || editor.pageOf(sourceId) !== editor.getCurrentPageId())
    throw new Error(t("workflow.theOriginalWorkIsNoLongerOnTheCanvas"));
  if (!prompt.trim())
    throw new Error(t("workflow.describeWhatYoudLikeToChangeFirst"));
  let id: string | null = null;
  editor.run(() => {
    id = createConnectedComponent(editor, [sourceId], type, prompt.trim());
    if (!id) throw new Error(t("workflow.cannotCreateANewVersion"));
    editor.updateShape({
      id,
      meta: {
        ...editor.getShape(id).meta,
        revisionOf: sourceId,
        revisionCreatedAt: Date.now(),
      },
      ...(type === "ai-image"
        ? {
            props: {
              imageSize: IMAGE_RATIOS.includes(options.imageSize || "")
                ? options.imageSize
                : source.props.imageSize || "1:1",
            },
          }
        : {}),
    });
  });
  return id!;
}
export function completedRevision(editor: Editor, id: string): string {
  const shape = editor.getShape(id);
  if (!shape) throw new Error(t("workflow.theNewVersionWasRemoved"));
  const output =
    shape.type === "instruction"
      ? connectedShapes(editor, id, "next").find(
          (item) => item.type === "ai-text",
        )
      : undefined;
  if (output && typeof shape.meta.revisionOf === "string")
    editor.updateShape({
      id: output.id,
      props: { name: output.props.name || shape.props.name },
      meta: {
        ...output.meta,
        revisionOf: shape.meta.revisionOf,
        creationStep: id,
        revisionCreatedAt: shape.meta.revisionCreatedAt,
      },
    });
  return output?.id || id;
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
    throw new Error(t("workflow.theOriginalImageIsNoLongerOnTheCanvas"));
  let id: string | null = null;
  editor.run(() => {
    id = createConnectedComponent(editor, [sourceId], "ai-image", "");
    if (!id) throw new Error(t("workflow.cannotSaveANewImage"));
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
  prompt: string;
  type: RevisionType;
  imageSize?: string;
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
    prompt: "",
    type: revisionType(shape),
  };
  try {
    const value = JSON.parse(raw || "null");
    if (
      value?.version !== 1 ||
      !["base", "content", "prompt"].every(
        (key) => typeof value[key] === "string",
      ) ||
      !["instruction", "ai-image", "website"].includes(value.type)
    )
      return empty;
    return {
      base: value.base,
      content: value.content,
      prompt: value.prompt,
      type: value.type,
      ...(IMAGE_RATIOS.includes(value.imageSize)
        ? { imageSize: value.imageSize }
        : {}),
    };
  } catch {
    return empty;
  }
}
