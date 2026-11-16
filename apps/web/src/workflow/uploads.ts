import { LocalizedError } from "@/i18n/errors";
import {
  audioRecognizeAPI,
  documentUploadAPI,
  extractAPIData,
  uploadFileAPI,
} from "@/api/backend";
import { validateFile } from "@/api/canvas-components";
import type { NodeData } from "./execute";
import { nodeIsBusy } from "./execute";
import type { Editor } from "@/features/canvas/editor";

/** The target may have been locked, removed, or started while its file was processing. */
export function applyComponentUpload(
  editor: Editor,
  id: string,
  props: Partial<NodeData>,
) {
  const shape = editor.getShape(id);
  if (!shape || editor.pageOf(id) !== editor.getCurrentPageId())
    throw new LocalizedError({ key: "workflow.thisWorkIsNoLongerOnTheCanvas" });
  if (shape.isLocked || shape.props.isLocked)
    throw new LocalizedError({ key: "workflow.unlockThisWorkBeforeEditing" });
  if (nodeIsBusy(editor, id))
    throw new LocalizedError({ key: "workflow.thisWorkIsBeingGenerated" });
  editor.updateShape({ id, type: shape.type, props });
}

/** Return a complete upload result so failed parsing never replaces the current node. */
export async function uploadComponentFile(
  type: "ai-image" | "speech" | "file",
  file: File,
): Promise<Partial<NodeData>> {
  const validation = validateFile(file);
  if (validation.valid === false) throw validation.error;
  if (type === "file") {
    const value = extractAPIData(await documentUploadAPI(file));
    return {
      src: value.src,
      text: value.text,
      result: value.text,
      name: value.name,
      description: value.description,
      fileName: file.name,
      fileExtension: file.name.split(".").pop()?.toLowerCase(),
      fileSize: file.size,
      isUploaded: true,
      generation: undefined,
    };
  }
  if (type === "ai-image" && !file.type.startsWith("image/"))
    throw new LocalizedError({ key: "canvas.chooseAnImageFile" });
  if (
    type === "speech" &&
    !file.type.startsWith("audio/") &&
    !file.type.startsWith("video/")
  )
    throw new LocalizedError({ key: "canvas.chooseAnAudioFile" });
  const value = await uploadFileAPI(file);
  const transcript =
    type === "speech"
      ? (await audioRecognizeAPI(value.data.file_path)).data
      : undefined;
  return {
    src: value.data.file_path,
    text: "",
    name: transcript?.name || file.name,
    description: transcript?.description || file.name,
    result: transcript?.text ?? file.name,
    isUploaded: true,
    generation: undefined,
  };
}
