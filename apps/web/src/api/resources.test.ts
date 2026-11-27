import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { setLanguage } from "@/i18n";
import { blobForSource } from "./resources";

describe("asset resource requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["/api/assets/note", "same-origin", true],
    ["/covers/note.png", "same-origin", false],
    ["https://images.example/api/note", "omit", false],
    ["data:text/plain,hello", "omit", false],
  ] as const)(
    "reads %s with the appropriate request scope",
    async (src, credentials, localAPI) => {
      const location = new URL(
        "https://workspace.example/drawing/project?share=example",
      );
      vi.stubGlobal("window", { location });
      vi.stubGlobal("location", location);
      setLanguage("en");
      const fetchResource = vi.fn().mockResolvedValue(new Response("content"));
      vi.stubGlobal("fetch", fetchResource);
      const signal = new AbortController().signal;
      const blob = await blobForSource(src, signal);
      expect(await blob.text()).toBe("content");
      expect(fetchResource).toHaveBeenCalledWith(
        new URL(src, location.origin),
        {
          credentials,
          referrerPolicy: "no-referrer",
          signal,
          headers: localAPI
            ? {
                "Accept-Language": "en",
                "X-Huayu-Canvas": "project",
                "X-Huayu-Share": "example",
              }
            : undefined,
        },
      );
    },
  );
});
