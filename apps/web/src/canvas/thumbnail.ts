const PNG_PREFIX = "data:image/png;base64,";
const RENDERER_VERSION = 6;

export function thumbnailStamp(cover: string, revision = 0) {
  let hash = 2166136261;
  for (let i = 0; i < cover.length; i++)
    hash = Math.imul(hash ^ cover.charCodeAt(i), 16777619);
  return `${RENDERER_VERSION}:${revision}:${hash >>> 0}`;
}

export function needsThumbnailRefresh(
  cover: string | null,
  width: number,
  height: number,
  stamp: string | null,
  revision = 0,
) {
  if (!cover) return true;
  if (!cover.startsWith(PNG_PREFIX)) return false;
  return (
    stamp !== thumbnailStamp(cover, revision) ||
    needsSharperThumbnail(cover, width, height)
  );
}

export function thumbnailScale(width: number, height: number) {
  return Math.min(2, 960 / Math.max(1, width, height));
}

export function needsSharperThumbnail(
  cover: string | null,
  width: number,
  height: number,
) {
  if (!cover) return true;
  if (!cover.startsWith(PNG_PREFIX)) return false;
  try {
    const header = atob(cover.slice(PNG_PREFIX.length, PNG_PREFIX.length + 44));
    if (header.length < 24 || header.slice(1, 4) !== "PNG") return true;
    const view = new DataView(
      Uint8Array.from(header, (value) => value.charCodeAt(0)).buffer,
    );
    const longest = Math.max(view.getUint32(16), view.getUint32(20));
    const target = Math.max(width, height) * thumbnailScale(width, height);
    return longest < Math.min(560, target * 0.75);
  } catch {
    return true;
  }
}
