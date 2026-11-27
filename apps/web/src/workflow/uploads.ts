import { LocalizedError } from "@/i18n/errors";
import { t } from "@/i18n";
import { transcribeSource } from "./transcription";
import { api, uploadAsset, type Asset } from "@/api/client";
import type { NodeData } from "./execute";

/** Return a complete upload result so failed parsing never replaces the current node. */
export async function uploadComponentFile(
  type: "ai-image" | "speech" | "file",
  file: File,
): Promise<Partial<NodeData>> {
  if (file.size > 10 * 1024 * 1024)
    throw new LocalizedError({ key: "api.fileExceedsTheSizeLimit" });
  if (type === "file") {
    const body = new FormData();
    body.append("file", file);
    const { asset, text } = await api<{ asset: Asset; text: string }>(
      "/api/documents/parse",
      { method: "POST", body },
    );
    return {
      src: asset.url,
      text,
      result: text,
      name: file.name,
      description: t("api.documentContent"),
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
  const asset = await uploadAsset(file);
  const transcript =
    type === "speech" ? await transcribeSource(asset.url) : undefined;
  return {
    src: asset.url,
    text: "",
    name: type === "speech" ? t("api.transcription") : file.name,
    description: file.name,
    result: transcript ?? file.name,
    isUploaded: true,
    generation: undefined,
  };
}
