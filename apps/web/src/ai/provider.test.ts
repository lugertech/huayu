import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readChatStream, parseModelJSON, testConnection } from "./provider";
import { defaultSettings } from "./settings";

describe("provider response handling", () => {
  it("decodes UTF-8 and SSE lines split at every byte, including a final line without newline", async () => {
    const text =
      'data: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"测试"}}]}\n\ndata: [DONE]';
    const bytes = new TextEncoder().encode(text);
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const value of bytes)
            controller.enqueue(new Uint8Array([value]));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const deltas: string[] = [];
    expect(await readChatStream(response, (value) => deltas.push(value))).toBe(
      "中文测试",
    );
    expect(deltas).toEqual(["中文", "测试"]);
  });
  it("rejects empty or malformed model responses without fabricating successful content", async () => {
    await expect(
      readChatStream(new Response("data: [DONE]\n")),
    ).rejects.toThrow("空内容");
    expect(() => parseModelJSON("not json")).toThrow("格式");
    expect(parseModelJSON('```json\n{"text":"内容"}\n```')).toEqual({
      text: "内容",
    });
  });
});

describe("connection tests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["text", "image"] as const)(
    "cancels a pending %s test when its settings change",
    async (capability) => {
      vi.stubGlobal("window", {
        location: { origin: "http://127.0.0.1:5861" },
      });
      const controller = new AbortController();
      const fetchMock = vi.fn(
        (_url, options) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Cancelled", "AbortError")),
              { once: true },
            );
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const pending = testConnection(
        capability,
        {
          ...defaultSettings().connections[capability],
          apiKey: "test-only-key",
        },
        controller.signal,
      );
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const requestSignal = fetchMock.mock.calls[0][1].signal;
      expect(requestSignal.aborted).toBe(false);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(requestSignal.aborted).toBe(true);
    },
  );

  it("distinguishes reaching the service from finding the chosen model", async () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5861" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "another-model" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await testConnection("image", {
      ...defaultSettings().connections.image,
      apiKey: "test-only-key",
    });
    expect(result.status).toBe("warning");
    expect(result.message).toContain("未找到此模型");
  });
});
