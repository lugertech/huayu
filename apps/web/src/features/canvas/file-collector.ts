import { mediaFileName } from "@/lib/file-name";
import { getTranslator, getLocale, type Locale } from "@/i18n";
import type { Editor } from "@/features/canvas/editor";
import { downloadBlob } from "@/api/client";
import { blobForSource } from "@/api/resources";
import { createDocumentBlob } from "@/ai/documents";
import type { NodeData } from "@/workflow/execute";
import { resultSource } from "@/workflow/results";

export interface DownloadableFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  source: "file" | "website" | "image" | "speech";
  sourceLabel: string;
  downloadUrl?: string;
  content?: string;
  shapeId: string;
}
export function collectDownloadableFiles(
  editor: Editor,
  locale: Locale = getLocale(),
): DownloadableFile[] {
  const t = getTranslator(locale);
  const files: DownloadableFile[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    const props = shape.props as NodeData;
    const imageAsset =
      shape.type === "image"
        ? editor.store.get(String(shape.props.assetId))
        : undefined;
    const imageName =
      props.name ||
      (imageAsset?.typeName === "asset"
        ? String(imageAsset.props.name || "")
        : "") ||
      t("common.image");
    if (shape.type === "file" && (props.src || props.result || props.text))
      files.push({
        id: shape.id,
        shapeId: shape.id,
        fileName: props.fileName || props.name || t("canvas.documentTxt"),
        fileType:
          props.fileExtension || props.fileName?.split(".").pop() || "txt",
        source: "file",
        sourceLabel: t("canvas.fileStep"),
        downloadUrl: props.src,
        content: props.result || props.text,
        fileSize: props.fileSize,
      });
    else if (shape.type === "website" && props.htmlContent)
      files.push({
        id: shape.id,
        shapeId: shape.id,
        fileName: `${props.name || t("common.webPage")}.html`,
        fileType: "html",
        source: "website",
        sourceLabel: t("canvas.websiteStep"),
        content: props.htmlContent,
      });
    else if (["ai-image", "image", "speech"].includes(shape.type)) {
      const url = resultSource(editor, shape);
      if (!url) continue;
      const audio = shape.type === "speech";
      const name =
        props.fileName ||
        (audio ? props.name || t("common.speech") : imageName);
      const mime =
        (imageAsset?.typeName === "asset" && imageAsset.props.mimeType) ||
        /^data:([^;,]+)/i.exec(url)?.[1];
      files.push({
        id: shape.id,
        shapeId: shape.id,
        fileName: mediaFileName(name, mime),
        fileType: audio ? "mp3" : "png",
        source: audio ? "speech" : "image",
        sourceLabel: t(audio ? "canvas.audioStep" : "canvas.imageStep"),
        downloadUrl: url,
      });
    }
  }
  return files;
}
export async function downloadFile(file: DownloadableFile) {
  // Preserve original binary bytes for PDF, DOCX, images, and audio.
  const blob = file.downloadUrl
    ? await blobForSource(file.downloadUrl)
    : await createDocumentBlob(file.content || "", file.fileType);
  const name =
    file.source === "image" || file.source === "speech"
      ? mediaFileName(file.fileName, blob.type)
      : file.fileName;
  downloadBlob(blob, name);
}
