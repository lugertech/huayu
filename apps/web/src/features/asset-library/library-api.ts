import { api } from "@/api/client";
import {
  folderTree,
  importLibraryImage,
  type AssetFolder,
  type LibraryAsset,
} from "./assets";

export type AssetItem = LibraryAsset;
export type { AssetFolderBranch as AssetGroupItem } from "./assets";
export const ASSET_PAGE_SIZE_MAX = 50;
export async function getAssets({
  folder_id,
  unfiled,
  keyword,
  page = 1,
  per_page = 50,
  sort,
  trash,
  signal,
}: {
  folder_id: string | null;
  unfiled: boolean;
  keyword: string;
  page?: number;
  per_page?: number;
  sort: "newest" | "oldest";
  trash: boolean;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({
    search: keyword,
    offset: String((page - 1) * per_page),
    limit: String(per_page),
    sort,
    trash: String(trash),
  });
  if (folder_id && !trash) query.set("folder_id", folder_id);
  if (unfiled && !trash) query.set("unfiled", "true");
  const result = await api<{ assets: LibraryAsset[]; total: number }>(
    `/api/library/assets?${query}`,
    { signal },
  );
  return {
    assets: result.assets,
    pagination: {
      current_page: page,
      last_page: Math.max(1, Math.ceil(result.total / per_page)),
      total: result.total,
    },
  };
}
export async function getAssetGroups(signal?: AbortSignal) {
  return {
    groups: folderTree(
      await api<AssetFolder[]>("/api/library/folders", { signal }),
    ),
  };
}
export function uploadAsset({
  file,
  folder_id,
}: {
  file: File;
  name?: string;
  folder_id: string | null;
}) {
  return importLibraryImage(file, folder_id);
}
export function updateAsset(
  asset: LibraryAsset,
  changes: Partial<Pick<LibraryAsset, "name" | "folder_id" | "trashed">>,
) {
  return api(`/api/library/assets/${asset.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: asset.name,
      folder_id: asset.folder_id,
      trashed: asset.trashed,
      ...changes,
    }),
  });
}
export function deleteAsset(asset: LibraryAsset) {
  return updateAsset(asset, { trashed: true });
}
export function createAssetGroup(payload: {
  name: string;
  parent_id: string | null;
}) {
  return api<AssetFolder>("/api/library/folders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateAssetGroup(id: string, payload: { name: string }) {
  return api(`/api/library/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
export function deleteAssetGroup(id: string) {
  return api(`/api/library/folders/${id}`, { method: "DELETE" });
}
