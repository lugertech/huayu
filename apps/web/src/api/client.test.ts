import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api, PROJECTS_CHANGED_EVENT } from "./client";
import { setLanguage } from "@/i18n";
import { errorText } from "@/i18n/errors";

describe("local API connection errors", () => {
  it("keeps known server errors translatable after they have been received", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: "INVALID_NAME",
            message: "Server wording can change independently",
            params: { min: 1, max: 120 },
          },
          { status: 422 },
        ),
      ),
    );
    const error = await api("/api/projects").catch((reason: unknown) => reason);
    setLanguage("en");
    expect(errorText(error)).toBe("Names must contain 1–120 characters");
    expect(error).toMatchObject({ status: 422, code: "INVALID_NAME" });
  });
  it("uses the error code and parameters independently of the server message", async () => {
    setLanguage("en");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "INVALID_NAME",
            message: "Different server wording",
            params: { min: 2, max: 80 },
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(api("/api/projects")).rejects.toMatchObject({
      message: "Names must contain 2–80 characters",
      code: "INVALID_NAME",
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

  it("sends the selected application language on each request and allows an explicit override", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    setLanguage("en");
    await api("/api/projects");
    setLanguage("zh-CN");
    await api("/api/projects");
    await api("/api/projects", { headers: { "Accept-Language": "en" } });
    expect(
      fetch.mock.calls.map(([, options]) =>
        options.headers.get("Accept-Language"),
      ),
    ).toEqual(["en", "zh-CN", "en"]);
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

describe("project changes shared by the sidebar and open page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes the saved project so other views can rename it without reloading", async () => {
    const events = new EventTarget();
    const changed = vi.fn();
    events.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    vi.stubGlobal("window", events);
    const project = { id: "project-1", name: "Updated name" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(project)));

    await api("/api/projects/project-1", {
      method: "PATCH",
      body: JSON.stringify({ name: project.name }),
    });

    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail).toEqual({
      type: "updated",
      project,
    });
  });

  it("identifies a deleted project even when the API has no response body", async () => {
    const events = new EventTarget();
    const changed = vi.fn();
    events.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    vi.stubGlobal("window", events);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await api("/api/projects/project-1", { method: "DELETE" });

    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail).toEqual({
      type: "deleted",
      id: "project-1",
    });
  });

  it("does not remove a project from other views when deletion fails", async () => {
    const events = new EventTarget();
    const changed = vi.fn();
    events.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    vi.stubGlobal("window", events);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: "Delete failed" }, { status: 500 }),
        ),
    );

    await expect(
      api("/api/projects/project-1", { method: "DELETE" }),
    ).rejects.toThrow("Delete failed");
    expect(changed).not.toHaveBeenCalled();
  });
});
