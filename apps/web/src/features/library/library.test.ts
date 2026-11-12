import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  filterLibraryItems,
  groupLibraryItems,
  libraryItemDetail,
  libraryItemKey,
  libraryItemUrl,
  listLibraryItems,
  type LibraryItem,
} from "./library";

afterEach(() => vi.unstubAllGlobals());

const file: LibraryItem = {
  project_id: "one",
  project_name: "春季活动",
  shape_id: "shape:shared-id",
  name: "活动方案.md",
  kind: "document",
  extension: "md",
  size: null,
  updated_at: "2026-11-05T10:00:00Z",
  url: null,
  excerpt: "安排摄影与现场采访",
};
const image: LibraryItem = {
  ...file,
  project_id: "two",
  project_name: "品牌设计",
  name: "活动海报.png",
  kind: "image",
  extension: "png",
  updated_at: "2026-11-06T10:00:00Z",
  url: "/api/assets/test-image",
  excerpt: "",
};
describe("project library catalogue", () => {
  it("excludes website attachments from the catalogue and item details", async () => {
    const website = {
      ...file,
      name: "活动页面",
      kind: "website",
      extension: "html",
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([file, website, image]))
        .mockResolvedValueOnce(Response.json(website)),
    );
    await expect(
      listLibraryItems(new AbortController().signal),
    ).resolves.toEqual([file, image]);
    await expect(libraryItemDetail(file)).rejects.toMatchObject({
      translation: { key: "library.removed" },
    });
  });
  it("keeps identical shape IDs in different projects separate", () => {
    expect(libraryItemKey(file)).not.toBe(libraryItemKey(image));
    expect(
      groupLibraryItems([file, image]).map((group) => group.items),
    ).toEqual([[file], [image]]);
  });
  it("combines project, type and search filters without changing the source order", () => {
    const items = [file, image];
    expect(
      filterLibraryItems(items, "  摄影  ", "document", "one", "newest"),
    ).toEqual([file]);
    expect(filterLibraryItems(items, "品牌", "all", "", "newest")).toEqual([
      image,
    ]);
    expect(filterLibraryItems(items, "活动", "image", "one", "newest")).toEqual(
      [],
    );
    expect(filterLibraryItems(items, "", "all", "", "newest")).toEqual([
      image,
      file,
    ]);
    expect(items).toEqual([file, image]);
  });
  it("does not turn imported script, file or protocol-relative URLs into links", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///private/file",
      "//example.com/file",
      "data:text/html,<script>1</script>",
    ]) {
      expect(libraryItemUrl({ ...image, url })).toBeUndefined();
    }
    expect(libraryItemUrl(image)).toBe(image.url);
    expect(
      libraryItemUrl({ ...image, url: "data:image/png;base64,AAAA" }),
    ).toBe("data:image/png;base64,AAAA");
  });
});
