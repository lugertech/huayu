import { t } from "@/i18n";
import type { Editor } from "@/canvas/editor";
import { downloadBlob } from "@/api/client";
import { blobForSource } from "@/api/backend";
import { createDocumentBlob } from "@/ai/documents";
import type { NodeData } from "@/workflow/execute";

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
export function collectDownloadableFiles(editor: Editor): DownloadableFile[] {
  const files: DownloadableFile[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    const props = shape.props as NodeData;
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
    else if (shape.type === "ai-image" && props.src)
      files.push({
        id: shape.id,
        shapeId: shape.id,
        fileName: /\.(png|jpe?g|gif|webp)$/i.test(props.name || "")
          ? props.name
          : `${props.name || t("common.image")}.png`,
        fileType: "png",
        source: "image",
        sourceLabel: t("canvas.imageStep"),
        downloadUrl: props.src,
      });
    else if (shape.type === "speech" && props.src)
      files.push({
        id: shape.id,
        shapeId: shape.id,
        fileName: /\.(mp3|wav|webm|m4a|flac)$/i.test(props.name || "")
          ? props.name
          : `${props.name || t("common.speech")}.mp3`,
        fileType: "mp3",
        source: "speech",
        sourceLabel: t("canvas.audioStep"),
        downloadUrl: props.src,
      });
  }
  return files;
}
export async function downloadFile(file: DownloadableFile) {
  // Preserve original binary bytes for PDF, DOCX, images, and audio.
  const blob = file.downloadUrl
    ? await blobForSource(file.downloadUrl)
    : await createDocumentBlob(file.content || "", file.fileType);
  downloadBlob(blob, file.fileName);
}
export function formatFileSize(bytes = 0) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
