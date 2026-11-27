import { limitName } from "@/lib/file-name";
import { v4 as uuid } from "uuid";
import { LocalizedError } from "@/i18n/errors";
import { api, uploadAsset } from "@/api/client";
import { nodeIsBusy } from "@/workflow/execution-state";
import { createShapeId, type VecLike } from "@/features/canvas/engine/model";
import type { Editor } from "@/features/canvas/engine/editor";

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

/** Replace only the image content; keep the component's identity and connections. */
export function applyLibraryImage(
  editor: Editor,
  shapeId: string,
  asset: LibraryAsset,
) {
  const shape = editor.getShape(shapeId);
  if (!shape || !["ai-image", "image"].includes(shape.type))
    throw new LocalizedError({ key: "assets.imageTargetRequired" });
  if (shape.isLocked || shape.props.isLocked || nodeIsBusy(editor, shapeId))
    throw new LocalizedError({ key: "assets.targetUnavailable" });
  editor.run(() => {
    if (shape.type === "image") {
      const assetId = `asset:${uuid()}`;
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
      const scale = Math.min(
        Number(shape.props.w) / asset.width,
        Number(shape.props.h) / asset.height,
      );
      editor.updateShape({
        id: shapeId,
        props: {
          assetId,
          src: undefined,
          name: asset.name,
          w: asset.width * scale,
          h: asset.height * scale,
        },
      });
    } else {
      editor.updateShape({
        id: shapeId,
        props: {
          src: assetUrl(asset),
          name: asset.name,
          description: asset.name,
          result: asset.name,
          isUploaded: true,
          generation: undefined,
        },
      });
    }
  });
}

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
  const assetId = `asset:${uuid()}`;
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

/** Balance insertion columns by the images' aspect ratios. */
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
