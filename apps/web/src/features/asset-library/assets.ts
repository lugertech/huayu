import { api, uploadAsset } from "@/api/client";
import { t } from "@/i18n";
import { createShapeId, type Editor, type VecLike } from "@/canvas/editor";

export interface AssetFolder {
  id: string;
  name: string;
  parent_id: string | null;
  asset_count?: number;
}
export interface AssetFolderBranch extends AssetFolder {
  children: AssetFolderBranch[];
}
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
export const ASSET_DRAG_TYPE = "application/x-huayu-library-asset";
export const assetUrl = (asset: Pick<LibraryAsset, "id">) =>
  `/api/assets/${asset.id}`;

export async function importLibraryImage(file: File, folderId: string | null) {
  if (!file.type.startsWith("image/"))
    throw new Error(t("assets.imageRequired"));
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error(t("assets.imageRequired"));
    const asset = await uploadAsset(file);
    await api("/api/library/assets", {
      method: "POST",
      body: JSON.stringify({
        asset_id: asset.id,
        name: file.name.slice(0, 120),
        width: image.naturalWidth,
        height: image.naturalHeight,
        folder_id: folderId,
        trashed: false,
      }),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function insertLibraryImage(
  editor: Editor,
  asset: LibraryAsset,
  point?: VecLike,
) {
  const viewport = editor.getViewportPageBounds();
  const zoom = editor.session.camera.z;
  const scale = Math.min(
    1,
    640 / asset.width,
    640 / asset.height,
    ...(point
      ? []
      : [
          Math.max(40, viewport.w - 64 / zoom) / asset.width,
          Math.max(40, viewport.h - 160 / zoom) / asset.height,
        ]),
  );
  const w = asset.width * scale;
  const h = asset.height * scale;
  const center = point || viewport.center;
  const assetId = `asset:library:${asset.id}`;
  const id = createShapeId();
  editor.run(() => {
    editor.store.put([
      {
        id: assetId,
        typeName: "asset",
        type: "image",
        meta: {},
        props: {
          src: assetUrl(asset),
          name: asset.name,
          mimeType: asset.mime,
          w: asset.width,
          h: asset.height,
        },
      },
    ]);
    editor.createShape({
      id,
      type: "image",
      x: center.x - w / 2,
      y: center.y - h / 2,
      props: { assetId, w, h },
    });
    editor.select(id);
    editor.setCurrentTool("select");
  });
  return id;
}

export function folderRows(
  folders: AssetFolder[],
  parentId: string | null = null,
  depth = 0,
): Array<AssetFolder & { depth: number }> {
  return folders
    .filter((folder) => folder.parent_id === parentId)
    .flatMap((folder) => [
      { ...folder, depth },
      ...folderRows(folders, folder.id, depth + 1),
    ]);
}

export function folderTree(folders: AssetFolder[]): AssetFolderBranch[] {
  const branches = new Map(
    folders.map((folder) => [
      folder.id,
      { ...folder, children: [] } as AssetFolderBranch,
    ]),
  );
  const roots: AssetFolderBranch[] = [];
  for (const folder of branches.values()) {
    if (folder.parent_id) branches.get(folder.parent_id)!.children.push(folder);
    else roots.push(folder);
  }
  return roots;
}

/** Keep the same ratio-balanced insertion columns as pure-design's material drawer. */
export function assetMasonryColumns(
  assets: LibraryAsset[],
  columnCount: number,
) {
  const columns: LibraryAsset[][] = Array.from(
    { length: columnCount },
    () => [],
  );
  const heights = Array.from({ length: columnCount }, () => 0);
  for (const asset of assets) {
    let target = 0;
    for (let index = 1; index < heights.length; index++)
      if (heights[index] < heights[target]) target = index;
    columns[target].push(asset);
    heights[target] += asset.height / asset.width;
  }
  return columns;
}
