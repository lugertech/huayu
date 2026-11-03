import { t } from "@/i18n";
import { exportToCanvas, exportToSvg } from "@excalidraw/excalidraw";
import type { BinaryFiles, AppState } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/excalidraw/element/types";
import type { Editor } from "@/canvas/editor";
import { createCanvasStore } from "@/canvas/engine/store";
import { Editor as SnapshotEditor } from "@/canvas/engine/editor";
import { exportPNG as legacyExportPNG } from "@/canvas/engine/export";
import { shapeIdForElement, isCustomElement } from "./scene";
import { blobAsDataURL } from "@/api/backend";

export async function exportScene(
  editor: Editor,
  all: readonly ExcalidrawElement[],
  inputFiles: BinaryFiles,
  ids: string[],
) {
  const wanted = new Set(ids);
  for (const id of ids)
    for (const child of editor.descendants(id)) wanted.add(child.id);
  const selected = all.filter(
    (element) =>
      !element.isDeleted &&
      (wanted.has(shapeIdForElement(editor, element)) ||
        wanted.has(element.customData?.huayuLabelFor)),
  );
  const files: BinaryFiles = {};
  for (const element of selected)
    if (element.type === "image") {
      if (!element.fileId || !inputFiles[element.fileId])
        throw new Error(t("canvas.imagesAreStillLoading"));
      files[element.fileId] = inputFiles[element.fileId];
    }
  const elements: ExcalidrawElement[] = [];
  for (const element of selected) {
    const shape = editor.getShape(shapeIdForElement(editor, element));
    if (!shape || !isCustomElement(shape)) {
      elements.push(element);
      continue;
    }
    const isolated = new SnapshotEditor(createCanvasStore());
    isolated.theme = editor.theme;
    isolated.store.put(
      editor.store.allRecords().filter((record) => record.typeName === "asset"),
    );
    isolated.createShape({
      ...shape,
      x: 0,
      y: 0,
      rotation: 0,
      parentId: isolated.getCurrentPageId(),
    });
    const snapshot = await legacyExportPNG(isolated, [shape.id], {
      padding: 0,
      scale: 2,
    });
    if (!snapshot) throw new Error(t("canvas.cardPreviewsCannotBeGenerated"));
    const fileId = `snapshot-${element.id}` as ExcalidrawImageElement["fileId"];
    const dataURL = await blobAsDataURL(snapshot.blob);
    files[fileId] = {
      id: fileId,
      dataURL: dataURL as BinaryFiles[string]["dataURL"],
      mimeType: "image/png",
      created: Date.now(),
    };
    elements.push({
      ...element,
      type: "image",
      fileId,
      status: "saved",
      scale: [1, 1],
      crop: null,
      roundness: null,
    } as ExcalidrawImageElement);
  }
  return { elements, files };
}

export function nativeExporter(
  editor: Editor,
  getScene: () => Promise<{
    elements: readonly ExcalidrawElement[];
    files: BinaryFiles;
    appState: Partial<AppState>;
  }>,
) {
  return {
    async exportSVG(
      ids: string[],
      options: { background?: boolean; padding?: number } = {},
    ) {
      const current = await getScene();
      const scene = await exportScene(
        editor,
        current.elements,
        current.files,
        ids,
      );
      if (!scene.elements.length) return undefined;
      const svg = await exportToSvg({
        ...scene,
        appState: {
          ...current.appState,
          exportBackground: !!options.background,
          exportWithDarkMode: editor.theme === "dark",
          viewBackgroundColor:
            current.appState.viewBackgroundColor || "#ffffff",
        },
        exportPadding: options.padding ?? 24,
      });
      return {
        svg: svg.outerHTML,
        width: Number(svg.getAttribute("width")),
        height: Number(svg.getAttribute("height")),
      };
    },
    async exportPNG(
      ids: string[],
      options: { background?: boolean; padding?: number; scale?: number } = {},
    ) {
      const current = await getScene();
      const scene = await exportScene(
        editor,
        current.elements,
        current.files,
        ids,
      );
      if (!scene.elements.length)
        throw new Error(t("canvas.theresNothingOnTheCanvasToExportYet"));
      const canvas = await exportToCanvas({
        ...scene,
        appState: {
          ...current.appState,
          exportBackground: !!options.background,
          exportWithDarkMode: editor.theme === "dark",
          viewBackgroundColor:
            current.appState.viewBackgroundColor || "#ffffff",
        },
        exportPadding: options.padding ?? 24,
        getDimensions: (width, height) => {
          const scale = Math.min(
            options.scale ?? 1,
            Math.sqrt(32000000 / (width * height)),
          );
          return {
            width: Math.max(1, width * scale),
            height: Math.max(1, height * scale),
            scale,
          };
        },
      });
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error(t("canvas.imageExportFailed"))),
          "image/png",
        ),
      );
      return { blob, width: canvas.width, height: canvas.height };
    },
  };
}
