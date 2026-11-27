import { api, downloadBlob } from "@/api/client";
import { blobForSource } from "@/api/resources";
import { createDocumentBlob } from "@/ai/documents";
import { t } from "@/i18n";
import { LocalizedError } from "@/i18n/errors";

export const LIBRARY_KINDS = ["image", "document", "audio"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export interface LibraryItem {
  project_id: string;
  project_name: string;
  shape_id: string;
  name: string;
  kind: LibraryKind;
  extension: string;
  size: number | null;
  updated_at: string;
  url: string | null;
  excerpt: string;
  content?: string;
}
type ProjectAttachment =
  | LibraryItem
  | (Omit<LibraryItem, "kind"> & { kind: "website" });

export async function listLibraryItems(signal: AbortSignal) {
  const attachments = await api<ProjectAttachment[]>("/api/library", {
    signal,
  });
  return attachments.filter((item) => item.kind !== "website");
}

export function libraryItemKey(item: LibraryItem) {
  return `${item.project_id}/${item.shape_id}`;
}
export function libraryItemName(item: LibraryItem) {
  return (
    item.name ||
    item.excerpt
      .trim()
      .split("\n")[0]
      ?.replace(/^[#>\s*-]+/, "")
      .slice(0, 60) ||
    t(`library.kind.${item.kind}`)
  );
}
export async function libraryItemDetail(
  item: LibraryItem,
  signal?: AbortSignal,
) {
  const detail = await api<ProjectAttachment>(
    `/api/projects/${encodeURIComponent(item.project_id)}/attachments/${encodeURIComponent(item.shape_id)}`,
    { signal },
  );
  if (detail.kind === "website") {
    throw new LocalizedError({ key: "library.removed" });
  }
  return detail;
}
export function libraryItemUrl(item: LibraryItem) {
  const source = item.url || "";
  // Project payloads may be imported or edited by a collaborator. Never turn script URLs into links.
  if (/^https?:\/\//i.test(source) || /^\/api\/assets\/[^/?#]+$/.test(source))
    return source;
  if (
    ["image", "audio"].includes(item.kind) &&
    /^data:(image|audio)\//i.test(source)
  )
    return source;
  return undefined;
}
export function filterLibraryItems(
  items: LibraryItem[],
  search: string,
  kind: LibraryKind | "all",
  project: string,
  sort: "newest" | "oldest" | "name",
) {
  const query = search.trim().toLocaleLowerCase();
  return items
    .filter(
      (item) =>
        (kind === "all" || item.kind === kind) &&
        (!project || item.project_id === project) &&
        (!query ||
          `${libraryItemName(item)} ${item.project_name} ${item.excerpt}`
            .toLocaleLowerCase()
            .includes(query)),
    )
    .sort((a, b) =>
      sort === "name"
        ? libraryItemName(a).localeCompare(libraryItemName(b))
        : (sort === "newest" ? -1 : 1) *
          a.updated_at.localeCompare(b.updated_at),
    );
}
export function groupLibraryItems(items: LibraryItem[]) {
  const projects = new Map<
    string,
    { id: string; name: string; updatedAt: string; items: LibraryItem[] }
  >();
  for (const item of items) {
    let project = projects.get(item.project_id);
    if (!project) {
      project = {
        id: item.project_id,
        name: item.project_name,
        updatedAt: item.updated_at,
        items: [],
      };
      projects.set(project.id, project);
    }
    project.items.push(item);
  }
  return [...projects.values()];
}
export async function downloadLibraryItem(item: LibraryItem) {
  const current = await libraryItemDetail(item);
  const url = libraryItemUrl(current);
  const blob = url
    ? await blobForSource(url)
    : await createDocumentBlob(current.content || "", current.extension);
  const name = libraryItemName(current);
  downloadBlob(
    blob,
    name.toLowerCase().endsWith(`.${current.extension}`)
      ? name
      : `${name}.${current.extension}`,
  );
}
