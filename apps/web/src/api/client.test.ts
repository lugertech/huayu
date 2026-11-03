import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "./client";
import { setLanguage } from "@/i18n";

describe("local API connection errors", () => {
  it("localizes a known server message through its semantic key", async () => {
    setLanguage("en");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "VALIDATION_ERROR",
            message: "名称应包含 1 至 120 个字符",
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(api("/api/projects")).rejects.toMatchObject({
      message: "Names must contain 1–120 characters",
      code: "VALIDATION_ERROR",
    });
  });
  it("preserves unknown server details as text", async () => {
    setLanguage("en");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "保留原始错误详情" }), {
          status: 400,
        }),
      ),
    );
    await expect(api("/api/projects")).rejects.toMatchObject({
      message: "保留原始错误详情",
    });
  });
  it("uses a readable fallback for a non-text server error", async () => {
    setLanguage("en");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { detail: "invalid" } }), {
          status: 400,
        }),
      ),
    );
    await expect(api("/api/projects")).rejects.toMatchObject({
      message: "Something went wrong. Please try again.",
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers a readable recovery message when the local connection drops", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(api("/api/projects")).rejects.toMatchObject({
      message: "连接暂时中断，请稍后重试",
      status: 0,
      code: "NETWORK_ERROR",
    });
  });

  it("keeps intentional cancellation distinct from a failed connection", async () => {
    const controller = new AbortController();
    const cancelled = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancelled));
    controller.abort();
    await expect(
      api("/api/projects", { signal: controller.signal }),
    ).rejects.toBe(cancelled);
  });
});
