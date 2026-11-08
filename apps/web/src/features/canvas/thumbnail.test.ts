import { describe, expect, it } from "vite-plus/test";
import {
  needsSharperThumbnail,
  thumbnailScale,
  needsThumbnailRefresh,
  thumbnailStamp,
} from "./thumbnail";

function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe("project preview resolution", () => {
  it("refreshes previews from an older renderer once and notices a replaced cover", () => {
    const cover = png(960, 303);
    const stamp = thumbnailStamp(cover);
    expect(needsThumbnailRefresh(cover, 1520, 480, null)).toBe(true);
    expect(
      needsThumbnailRefresh(cover, 1520, 480, stamp.replace(/^\d+:/, "1:")),
    ).toBe(true);
    expect(needsThumbnailRefresh(cover, 1520, 480, stamp)).toBe(false);
    expect(needsThumbnailRefresh(png(960, 304), 1520, 480, stamp)).toBe(true);
    expect(
      needsThumbnailRefresh("/api/assets/custom-cover", 1520, 480, null),
    ).toBe(false);
  });
  it("refreshes an older document preview even when its resolution and renderer are current", () => {
    const cover = png(960, 303);
    const stamp = thumbnailStamp(cover, 4);
    expect(needsThumbnailRefresh(cover, 1520, 480, stamp, 4)).toBe(false);
    expect(needsThumbnailRefresh(cover, 1520, 480, stamp, 5)).toBe(true);
  });
  it("replaces the old small preview while keeping a sharp existing preview", () => {
    expect(needsSharperThumbnail(png(274, 87), 1520, 480)).toBe(true);
    expect(needsSharperThumbnail(png(960, 303), 1520, 480)).toBe(false);
    expect(needsSharperThumbnail(png(600, 190), 1520, 480)).toBe(false);
  });
  it("bounds a large board and avoids enlarging small content beyond double resolution", () => {
    expect(thumbnailScale(12000, 8000) * 12000).toBe(960);
    expect(thumbnailScale(320, 200)).toBe(2);
    expect(needsSharperThumbnail(png(160, 100), 80, 50)).toBe(false);
  });
  it("recovers a missing or invalid preview and preserves local asset covers", () => {
    expect(needsSharperThumbnail(null, 1000, 500)).toBe(true);
    expect(
      needsSharperThumbnail("data:image/png;base64,broken", 1000, 500),
    ).toBe(true);
    expect(needsSharperThumbnail("/api/assets/cover", 1000, 500)).toBe(false);
  });
});
