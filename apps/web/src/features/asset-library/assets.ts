import { limitName } from "@/lib/file-name";
import { LocalizedError } from "@/i18n/errors";
import { api, uploadAsset } from "@/api/client";

export interface LibraryAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  folder_id: string | null;
  trashed: boolean;
  created_at: string;
}
export const assetUrl = (asset: Pick<LibraryAsset, "id">) =>
  `/api/assets/${asset.id}`;

export async function importLibraryFile(file: File, folderId: string | null) {
  let width = 0;
  let height = 0;
  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      width = image.naturalWidth;
      height = image.naturalHeight;
      if (!width || !height)
        throw new LocalizedError({ key: "assets.imageRequired" });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const asset = await uploadAsset(file);
  await api("/api/library/assets", {
    method: "POST",
    body: JSON.stringify({
      asset_id: asset.id,
      name: limitName(file.name),
      width,
      height,
      folder_id: folderId,
      trashed: false,
    }),
  });
}
