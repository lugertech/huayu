import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("window", {
    location: { origin: "http://127.0.0.1:5864" },
    addEventListener: vi.fn(),
  });
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  const { setLanguage } = await import("@/i18n");
  setLanguage("zh-CN");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function configured(
  capability: import("./settings").Capability = "text",
) {
  const settings = await import("./settings");
  const value = settings.defaultSettings();
  value.connections[capability] = {
    ...value.connections[capability],
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
  };
  settings.saveSettings(value);
  return value.connections[capability];
}

describe("capability availability", () => {
  it("distinguishes defaults from configured capabilities and allows keyless local models", async () => {
    const { CAPABILITIES, connectionIssue } = await import("./settings");
    for (const capability of CAPABILITIES)
      expect(connectionIssue(capability)?.field).toBe("apiKey");
    const connection = await configured();
    expect(connectionIssue("text", connection)).toBeUndefined();
    expect(connectionIssue("image")?.field).toBe("apiKey");
    expect(connectionIssue("text", { ...connection, baseUrl: "" })?.field).toBe(
      "baseUrl",
    );
    expect(connectionIssue("text", { ...connection, model: "" })?.field).toBe(
      "model",
    );
    expect(
      connectionIssue("text", { ...connection, baseUrl: "file:///secret" })
        ?.field,
    ).toBe("baseUrl");
  });
  it("does not make model requests when any of the six requested capabilities is unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = await import("./provider");
    const requests = [
      provider.chat([{ role: "user", content: "write" }]),
      provider.chat([{ role: "user", content: "read image" }], {
        capability: "vision",
      }),
      provider.generateImage("image", "1024x1024"),
      provider.synthesizeSpeech("speech"),
      provider.transcribeDetailed(new Blob(["audio"])),
      provider.searchWeb("search"),
    ];
    for (const result of await Promise.allSettled(requests)) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({
          name: "ModelConnectionError",
          code: "configuration",
        });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps text usable without image, speech, transcription or search settings", async () => {
    await configured();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ choices: [{ message: { content: "文字可用" } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { chat } = await import("./provider");
    expect(await chat([{ role: "user", content: "test" }])).toBe("文字可用");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.credentials).toBe("omit");
    expect(request.headers.get("Authorization")).toBeNull();
    expect(
      [...request.headers.keys()].some((name: string) =>
        name.startsWith("x-stainless-"),
      ),
    ).toBe(false);
  });
  it.each([true, false])(
    "checks optional search/image requirements before paying for instruction planning: search=%s",
    async (search) => {
      await configured();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { instructionAPI } = await import("@/api/backend");
      await expect(
        instructionAPI(
          "write",
          search
            ? []
            : [{ type: "image", src: "data:image/png;base64,example" }],
          search,
        ),
      ).rejects.toMatchObject({ capability: search ? "search" : "vision" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("SDK transport errors and bounded tests", () => {
  it.each([
    [401, "invalid_api_key", "密钥"],
    [403, "permission_denied", "权限"],
    [404, "model_not_found", "未找到"],
    [429, "insufficient_quota", "额度不足"],
    [429, "rate_limit", "频繁"],
    [500, "server_error", "暂时不可用"],
    [400, "bad_request", "HTTP 400"],
  ])(
    "explains HTTP %s without leaking provider responses or silently retrying",
    async (status, code, expected) => {
      const connection = await configured();
      connection.apiKey = "test-private-key";
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          json(
            { error: { code, message: "provider echoed test-private-key" } },
            status as number,
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      const { chat } = await import("./provider");
      const error = await chat([{ role: "user", content: "test" }], {
        connection,
      }).catch((error) => error);
      expect(error).toMatchObject({
        name: "ModelConnectionError",
        capability: "text",
      });
      expect(error.message).toContain(expected);
      expect(error.message).not.toContain("test-private-key");
      expect(error.message).not.toContain("provider echoed");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("uses readable English errors in English mode", async () => {
    const connection = await configured();
    const { setLanguage } = await import("@/i18n");
    setLanguage("en");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { message: "no" } }, 401)),
    );
    const { chat } = await import("./provider");
    await expect(
      chat([{ role: "user", content: "test" }], { connection }),
    ).rejects.toThrow("invalid or expired");
    setLanguage("zh-CN");
  });
  it("expires a hanging connection test and aborts its underlying request", async () => {
    const connection = await configured();
    const fetchMock = vi.fn(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { testConnection } = await import("./provider");
    vi.useFakeTimers();
    const pending = testConnection("text", connection);
    const assertion = expect(pending).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("does not report a model-list check as proven image-generation support", async () => {
    const connection = await configured("image");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ data: [{ id: "local-model" }] })),
    );
    const { testConnection } = await import("./provider");
    const result = await testConnection("image", connection);
    expect(result.status).toBe("warning");
    expect(result.message).toContain("仍需实际生成");
  });
  it("tests search with the unsaved connection instead of the saved text service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { defaultSettings } = await import("./settings");
    const connection = {
      ...defaultSettings().connections.search,
      apiKey: "test-search-key",
    };
    const { testConnection } = await import("./provider");
    expect((await testConnection("search", connection)).status).toBe("success");
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(request.body)).toMatchObject({
      api_key: "test-search-key",
      query: "Huayu",
    });
    expect(request.headers.get("Authorization")).toBeNull();
  });
  it("preserves multipart image editing, speech and timestamped transcription through the SDK", async () => {
    const settings = await import("./settings");
    const value = settings.defaultSettings();
    for (const capability of ["image", "speech", "transcription"] as const)
      value.connections[capability] = {
        ...value.connections[capability],
        baseUrl: "http://localhost:11434/v1",
        model: "local-model",
      };
    settings.saveSettings(value);
    const fetchMock = vi.fn(async (url, _options) => {
      if (String(url).includes("/images/edits"))
        return json({ data: [{ b64_json: "aW1hZ2U=" }] });
      if (String(url).startsWith("data:"))
        return new Response(new Blob(["image"], { type: "image/png" }));
      if (String(url).includes("/audio/speech"))
        return new Response(new Blob(["audio"], { type: "audio/mpeg" }));
      return json({
        text: "转写",
        segments: [{ start: 1, end: 2, text: "转写", speaker: "发言人" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = await import("./provider");
    expect(
      (
        await provider.generateImage("edit", "1024x1024", [
          new Blob(["reference"], { type: "image/png" }),
        ])
      ).type,
    ).toBe("image/png");
    const edit = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/images/edits"),
    )![1];
    expect(edit.body).toBeInstanceOf(FormData);
    expect(edit.body.get("image").name).toBe("image-0.png");
    expect((await provider.synthesizeSpeech("read")).type).toBe("audio/mpeg");
    expect(
      await provider.transcribeDetailed(
        new Blob(["audio"], { type: "audio/wav" }),
        "recording.wav",
      ),
    ).toEqual({
      text: "转写",
      segments: [{ start: 1, end: 2, text: "转写", speaker: "发言人" }],
    });
    const transcription = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/audio/transcriptions"),
    )![1];
    expect(transcription.body.get("file").name).toBe("recording.wav");
    expect(transcription.body.get("response_format")).toBe("verbose_json");
  });
  it("accepts compatible services that return JSON even when streaming was requested", async () => {
    await configured();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ choices: [{ message: { content: "complete" } }] }),
        ),
    );
    const { chat } = await import("./provider");
    const delta = vi.fn();
    expect(
      await chat([{ role: "user", content: "test" }], { onDelta: delta }),
    ).toBe("complete");
    expect(delta).toHaveBeenCalledWith("complete");
  });
  it("times out a stream stalled after the first response without treating partial output as success", async () => {
    await configured();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url, options) =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
                  ),
                );
                options.signal.addEventListener(
                  "abort",
                  () =>
                    controller.error(new DOMException("Aborted", "AbortError")),
                  { once: true },
                );
              },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
          ),
      ),
    );
    const { chat } = await import("./provider");
    const delta = vi.fn();
    vi.useFakeTimers();
    const pending = chat([{ role: "user", content: "test" }], {
      onDelta: delta,
    });
    const assertion = expect(pending).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(0);
    expect(delta).toHaveBeenCalledWith("partial");
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
  });
});
