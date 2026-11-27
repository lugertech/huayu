import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  deleteAsset,
  getAssetGroups,
  getAssets,
  updateAsset,
} from "./library-api";
import type { LibraryAsset } from "./assets";

afterEach(() => vi.unstubAllGlobals());
const item: LibraryAsset = {
  id: "poster",
  name: "Summer.svg",
  folder_id: "brand",
  width: 400,
  height: 600,
  mime: "image/svg+xml",
  size: 100,
  trashed: false,
  created_at: "2026-11-03T00:00:00Z",
};

describe("local asset explorer adapter", () => {
  it("keeps the unfiled root, search across folders, and trash queries distinct", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ assets: [], total: 75 })),
      );
    vi.stubGlobal("fetch", fetch);
    const filters = {
      folder_id: null,
      keyword: "",
      sort: "newest" as const,
      trash: false,
      unfiled: true,
    };
    const page = await getAssets({ ...filters, page: 2 });
    let query = new URL(String(fetch.mock.calls[0][0]), "http://localhost")
      .searchParams;
    expect(query.get("unfiled")).toBe("true");
    expect(query.get("offset")).toBe("50");
    expect(page.pagination).toEqual({
      current_page: 2,
      last_page: 2,
      total: 75,
    });
    await getAssets({ ...filters, unfiled: false, keyword: "poster" });
    query = new URL(String(fetch.mock.calls[1][0]), "http://localhost")
      .searchParams;
    expect(query.get("search")).toBe("poster");
    expect(query.has("unfiled")).toBe(false);
    expect(query.has("folder_id")).toBe(false);
    await getAssets({ ...filters, folder_id: "brand", trash: true });
    query = new URL(String(fetch.mock.calls[2][0]), "http://localhost")
      .searchParams;
    expect(query.get("trash")).toBe("true");
    expect(query.has("folder_id")).toBe(false);
    expect(query.has("unfiled")).toBe(false);
  });
  it("preserves asset metadata while moving, deleting, and restoring", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 204 })),
      );
    vi.stubGlobal("fetch", fetch);
    await updateAsset(item, { folder_id: "campaign" });
    await deleteAsset(item);
    await updateAsset({ ...item, trashed: true }, { trashed: false });
    expect(
      fetch.mock.calls.map(([, request]) => JSON.parse(request.body)),
    ).toEqual([
      { name: "Summer.svg", folder_id: "campaign", trashed: false },
      { name: "Summer.svg", folder_id: "brand", trashed: true },
      { name: "Summer.svg", folder_id: "brand", trashed: false },
    ]);
    expect(
      fetch.mock.calls.every(([url]) =>
        String(url).startsWith("/api/library/"),
      ),
    ).toBe(true);
  });
  it("adapts folder UUIDs and counts to the original tree structure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          {
            id: "campaign",
            name: "Campaign",
            parent_id: "brand",
            asset_count: 4,
          },
          { id: "brand", name: "Brand", parent_id: null, asset_count: 0 },
        ]),
      ),
    );
    const result = await getAssetGroups();
    expect(result.groups[0].children[0]).toMatchObject({
      id: "campaign",
      asset_count: 4,
      children: [],
    });
  });
});
