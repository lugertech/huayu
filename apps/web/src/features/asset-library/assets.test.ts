import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { importLibraryFile } from "./assets";

afterEach(() => vi.unstubAllGlobals());

describe("uploading to the independent asset library", () => {
  it.each([
    ["cover.png", "image/png", 640, 360],
    ["notes.txt", "text/plain", 0, 0],
  ] as const)(
    "adds %s to the selected folder with its original metadata",
    async (name, type, width, height) => {
      vi.stubGlobal(
        "Image",
        class {
          naturalWidth = 640;
          naturalHeight = 360;
          async decode() {}
        },
      );
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ id: "new-asset" }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetch);

      await importLibraryFile(new File(["file"], name, { type }), "folder");

      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/assets",
        "/api/library/assets",
      ]);
      expect(fetch.mock.calls[0][1].body.get("file").name).toBe(name);
      expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
        asset_id: "new-asset",
        name,
        width,
        height,
        folder_id: "folder",
        trashed: false,
      });
    },
  );
});
