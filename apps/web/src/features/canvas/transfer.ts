import { t } from "@/i18n";
import { LocalizedError } from "@/i18n/errors";
import {
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
  type DocumentSnapshot,
  type CanvasRecord,
  Editor,
} from "@/features/canvas/editor";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyNativeScene } from "./excalidraw/scene";
import {
  api,
  uploadAsset,
  downloadBlob,
  type CanvasDocument,
  type Project,
} from "@/api/client";
import { blobAsDataURL, blobForSource } from "@/api/backend";
import { sanitizedRecord } from "./sync";
import {
  generationFingerprint,
  generationInfo,
  resultIsStale,
} from "@/workflow/freshness";

interface ProjectFile {
  format: "huayu";
  version: 1;
  name: string;
  document: CanvasDocument;
}

const MAX_PROJECT_FILE_BYTES = 128 * 1024 * 1024;

function assertProjectFileSize(size: number) {
  if (size > MAX_PROJECT_FILE_BYTES)
    throw new LocalizedError({ key: "canvas.projectFilesCannotExceed128Mb" });
}

function resourceRecords(
  document: CanvasDocument,
): Array<{ props: Record<string, unknown> }> {
  return Object.values(document.store).filter((record) => {
    if (!record || typeof record !== "object" || !("props" in record))
      return false;
    return (
      (record["typeName"] === "asset" &&
        ["image", "video"].includes(record["type"])) ||
      (record["typeName"] === "shape" &&
        ["ai-image", "speech", "file", "video"].includes(record["type"]))
    );
  }) as Array<{ props: Record<string, unknown> }>;
}

/** Re-address unchanged attachments without making completed results look outdated. */
export async function rewriteProjectResources(
  source: CanvasDocument,
  rewrite: (src: string) => Promise<string>,
): Promise<CanvasDocument> {
  const document = structuredClone(source);
  const resources = new Map<string, string>();
  function read(value: CanvasDocument) {
    const store = createCanvasStore();
    loadSnapshot(store, {
      document: structuredClone(value) as DocumentSnapshot<CanvasRecord>,
    });
    return new Editor(store);
  }
  const before = read(source);
  const fresh = new Set<string>();
  for (const page of before.pages) {
    before.setCurrentPage(page.id);
    for (const shape of before.getCurrentPageShapes())
      if (generationInfo(shape) && !resultIsStale(before, shape.id))
        fresh.add(shape.id);
  }
  for (const record of resourceRecords(document)) {
    const src = record.props.src;
    if (typeof src !== "string" || !src) continue;
    if (!resources.has(src)) resources.set(src, await rewrite(src));
    record.props.src = resources.get(src);
  }
  const after = read(document);
  for (const page of after.pages) {
    after.setCurrentPage(page.id);
    for (const shape of after.getCurrentPageShapes()) {
      const info = generationInfo(shape);
      if (info && fresh.has(shape.id)) {
        const record = document.store[shape.id] as CanvasRecord;
        if (record.typeName === "shape")
          record.props.generation = {
            ...info,
            fingerprint: generationFingerprint(after, shape.id),
          };
      }
    }
  }
  return document;
}

export async function exportProject(name: string, source: CanvasDocument) {
  const document = await rewriteProjectResources(source, async (src) =>
    src.startsWith("data:") ? src : blobAsDataURL(await blobForSource(src)),
  );
  document.store = Object.fromEntries(
    Object.entries(document.store).map(([id, record]) => [
      id,
      sanitizedRecord(record as CanvasRecord),
    ]),
  );
  const file: ProjectFile = { format: "huayu", version: 1, name, document };
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  assertProjectFileSize(blob.size);
  downloadBlob(blob, `${name.replace(/[\\/]/g, "_")}.huayu.json`);
}

export function parseProjectFile(value: unknown): {
  name: string;
  document: CanvasDocument;
} {
  if (!value || typeof value !== "object")
    throw new LocalizedError({ key: "canvas.invalidProjectFileFormat" });
  const object = value as Record<string, unknown>;
  if (object.type === "excalidraw") {
    if (
      !Array.isArray(object.elements) ||
      object.elements.some(
        (element) =>
          !element ||
          typeof element.id !== "string" ||
          typeof element.type !== "string" ||
          ![element.x, element.y, element.width, element.height].every(
            Number.isFinite,
          ),
      )
    )
      throw new LocalizedError({
        key: "canvas.theExcalidrawFileHasNoValidCanvasContent",
      });
    const store = createCanvasStore();
    const editor = new Editor(store);
    const files =
      object.files && typeof object.files === "object"
        ? Object.values(object.files)
        : [];
    store.put(
      files
        .filter(
          (file) =>
            file &&
            typeof file.id === "string" &&
            typeof file.dataURL === "string" &&
            file.dataURL.startsWith("data:image/"),
        )
        .map((file) => ({
          id: `asset:excalidraw:${file.id}`,
          typeName: "asset",
          type: "image",
          props: {
            src: file.dataURL,
            mimeType: file.mimeType,
            name: t("canvas.importedImage"),
          },
          meta: {},
        })),
    );
    applyNativeScene(editor, object.elements as ExcalidrawElement[]);
    return {
      name:
        typeof object.name === "string"
          ? object.name.trim().slice(0, 120) || t("canvas.importedCanvas")
          : t("canvas.importedCanvas"),
      document: getSnapshot(store).document,
    };
  }
  if (object.format && (object.format !== "huayu" || object.version !== 1))
    throw new LocalizedError({
      key: "canvas.thisProjectFileVersionIsntSupported",
    });
  let document = (object.document || object) as Record<string, unknown>;
  if (document["document"])
    document = document["document"] as Record<string, unknown>;
  if (Array.isArray(document.records))
    document = {
      store: Object.fromEntries(
        document.records.map((record) => [record.id, record]),
      ),
      schema: document.schema,
    };
  if (
    !document.store ||
    !document.schema ||
    typeof document.store !== "object" ||
    Array.isArray(document.store)
  )
    throw new LocalizedError({
      key: "canvas.theProjectFileIsMissingCanvasData",
    });
  const store = createCanvasStore();
  try {
    loadSnapshot(store, {
      document: document as unknown as DocumentSnapshot<CanvasRecord>,
    });
  } catch {
    throw new LocalizedError({ key: "canvas.cannotReadCanvasData" });
  }
  const name =
    typeof object.name === "string" && object.name.trim()
      ? object.name.trim().slice(0, 120)
      : t("canvas.importedProject");
  return { name, document: getSnapshot(store).document };
}

export async function importProject(file: File): Promise<Project> {
  assertProjectFileSize(file.size);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new LocalizedError({ key: "canvas.theProjectFileIsntValidJson" });
  }
  const { name, document: source } = parseProjectFile(parsed);
  const document = await rewriteProjectResources(source, async (src) => {
    if (src.startsWith("data:")) {
      const blob = await blobForSource(src);
      const extension =
        blob.type.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
      return (await uploadAsset(blob, `import.${extension}`)).url;
    }
    return src;
  });
  return api<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, document }),
  });
}
