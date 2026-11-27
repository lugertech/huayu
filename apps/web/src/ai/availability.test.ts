import {
  ALIYUN_ASR_MODEL,
  ALIYUN_TTS_MODEL,
  defaultSettings,
  newLanguageConnection,
} from "./model-config";
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
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=";

async function configured() {
  const { saveSettings } = await import("./settings");
  const value = defaultSettings();
  const connection = {
    ...newLanguageConnection(),
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
  };
  value.language.push(connection);
  value.selection.text = connection.id;
  saveSettings(value);
  return connection;
}

describe("capability availability", () => {
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
  it("applies a model's generated content to the workflow node", async () => {
    await configured();
    const generated = {
      name: "Outline",
      text: "First step",
      description: "Summary",
    };
    const completion = (content: string) =>
      json({ choices: [{ message: { content } }] });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(completion("{}"))
        .mockResolvedValueOnce(completion(JSON.stringify(generated))),
    );
    const { Editor } = await import("@/features/canvas/engine/editor");
    const { createCanvasStore } =
      await import("@/features/canvas/engine/store");
    const { runWorkflow } = await import("@/workflow/execute");
    const editor = new Editor(createCanvasStore());
    const id = "shape:instruction";
    editor.createShape({
      id,
      type: "instruction",
      props: { text: "Outline the plan" },
    });

    await runWorkflow(editor, id);

    expect(editor.getShape(id)?.props).toMatchObject({
      name: generated.name,
      result: generated.text,
      description: generated.description,
    });
  });
  it.each([true, false])(
    "checks optional search/image requirements before paying for instruction planning: search=%s",
    async (search) => {
      await configured();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { runInstruction } = await import("@/workflow/generation");
      await expect(
        runInstruction(
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

describe("image request sizes", () => {
  it.each([
    ["gpt-image-1.5", "2048x2048", "1024x1024", false],
    ["gpt-image-1.5", "2496x1664", "1536x1024", false],
    ["gpt-image-1.5", "1664x2496", "1024x1536", false],
    ["gpt-image-1.5", "2048x2048", "1024x1024", true],
    ["gpt-image-1.5", "2496x1664", "1536x1024", true],
    ["gpt-image-1.5", "1664x2496", "1024x1536", true],
    ["gpt-image-1", "2048x2048", "1024x1024", false],
    ["gpt-image-1-mini", "2496x1664", "1536x1024", false],
    ["gpt-image-1.5-2025-12-16", "1664x2496", "1024x1536", false],
    ["gpt-image-1.5", "auto", "auto", false],
    ["gpt-image-2", "2496x1664", "2496x1664", false],
    ["gpt-image-2.6-flare", "3024x1296", "3024x1296", true],
    ["gpt-image-2.6-sunburst", "2048x2048", "2048x2048", true],
  ])(
    "sends %s size %s as %s (editing=%s)",
    async (model, size, expected, editing) => {
      const { saveSettings } = await import("./settings");
      const value = defaultSettings();
      const connection = value.images["gpt-image"];
      connection.model = model;
      connection.apiKey = "test-only";
      connection.enabled = true;
      saveSettings(value);
      const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
        json({ data: [{ b64_json: PNG }] }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { generateImage } = await import("./provider");
      await generateImage(
        "draw",
        size,
        editing
          ? [
              new Blob(
                [
                  Uint8Array.from(atob(PNG), (character) =>
                    character.charCodeAt(0),
                  ),
                ],
                { type: "image/png" },
              ),
            ]
          : [],
      );
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe(
        editing
          ? "https://api.openai.com/v1/images/edits"
          : "https://api.openai.com/v1/images/generations",
      );
      const { getSettings } = await import("./settings");
      expect(
        getSettings().images["gpt-image"].checks[
          editing ? "image-edit" : "image"
        ],
      ).toEqual({ status: "verified" });
      const body = request.body;
      expect(
        body instanceof FormData
          ? body.get("size")
          : JSON.parse(String(body)).size,
      ).toBe(expected);
    },
  );
});

describe("Model transport errors and bounded tests", () => {
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
    const { testModelOperation } = await import("./provider");
    vi.useFakeTimers();
    const pending = testModelOperation("text", connection);
    const assertion = expect(pending).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("does not report a model list or invalid bytes as successful image generation", async () => {
    const connection = {
      ...defaultSettings().images["gpt-image"],
      apiKey: "test-only",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: "local-model" }] }))
      .mockResolvedValueOnce(
        json({ data: [{ b64_json: btoa("not an image") }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { testModelOperation } = await import("./provider");
    await expect(testModelOperation("image", connection)).rejects.toMatchObject(
      {
        translation: { key: "models.theModelReturnedNoImage" },
      },
    );
    await expect(testModelOperation("image", connection)).rejects.toMatchObject(
      {
        translation: { key: "models.connection.invalidResponse" },
      },
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/images/generations",
      "https://api.openai.com/v1/images/generations",
    ]);
  });

  it("tests draft Tavily credentials without saving them or transferring them in the search body", async () => {
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      json({
        results: [
          {
            title: "Huayu",
            url: "https://example.test/article",
            content: "description",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSettings } = await import("./settings");
    const connection = {
      ...defaultSettings().search,
      apiKey: "test-search-key",
    };
    const { testModelOperation } = await import("./provider");
    expect(await testModelOperation("search", connection)).toEqual({
      status: "verified",
    });
    expect(getSettings().search).toEqual(defaultSettings().search);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(String(request.body))).toEqual({
      query: "Huayu",
      max_results: 6,
      search_depth: "basic",
    });
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer test-search-key",
    );
  });

  it("uses Ark's documented base64 image inputs and output", async () => {
    const connection = {
      ...defaultSettings().images.seedream,
      apiKey: "test-only",
    };
    const reference = new Blob(
      [Uint8Array.from(atob(PNG), (character) => character.charCodeAt(0))],
      {
        type: "image/png",
      },
    );
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      json({ data: [{ b64_json: PNG }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { generateImage } = await import("./provider");
    const output = await generateImage(
      "Draw",
      "2048x2048",
      [reference],
      undefined,
      connection,
    );
    expect(output.type).toBe("image/png");
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    );
    expect(JSON.parse(String(request.body))).toEqual({
      model: connection.model,
      prompt: "Draw",
      size: "2048x2048",
      response_format: "b64_json",
      image: "data:image/png;base64," + PNG,
    });
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer test-only",
    );
  });

  it("preserves multipart image editing and accepts multiple reference files", async () => {
    const connection = {
      ...defaultSettings().images["gpt-image"],
      apiKey: "test-only",
    };
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      json({ data: [{ b64_json: PNG }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { generateImage } = await import("./provider");
    const reference = new Blob(
      [Uint8Array.from(atob(PNG), (character) => character.charCodeAt(0))],
      {
        type: "image/png",
      },
    );
    await generateImage(
      "edit",
      "1024x1024",
      [reference, reference],
      undefined,
      connection,
    );
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/edits");
    expect(request.body).toBeInstanceOf(FormData);
    if (!(request.body instanceof FormData)) throw new Error("Missing form");
    expect(request.body.getAll("image[]")).toMatchObject([
      { name: "image-0.png" },
      { name: "image-1.png" },
    ]);
  });

  it("collects DashScope synthesis bytes in wire order and requires a completed stream", async () => {
    const connection = {
      ...defaultSettings().speech,
      workspaceId: "llm-example",
      apiKey: "test-only",
    };
    const stream = (finished: boolean) => {
      const outputs: unknown[] = [
        { type: "sentence-begin" },
        { type: "sentence-synthesis", audio: { data: btoa("ID3-first") } },
        { type: "sentence-synthesis", audio: { data: btoa("-second") } },
      ];
      if (finished)
        outputs.push({ finish_reason: "stop", audio: { data: "" } });
      return new Response(
        outputs
          .map(
            (output) =>
              "event:result\ndata:" + JSON.stringify({ output }) + "\n\n",
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      stream(true),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(window.addEventListener).mockClear();
    const { requestSpeech } = await import("./aliyun-speech");
    const output = await requestSpeech("Read aloud", connection);
    expect(window.addEventListener).not.toHaveBeenCalledWith(
      "storage",
      expect.any(Function),
    );
    expect(output.type).toBe("audio/mpeg");
    expect(await output.text()).toBe("ID3-first-second");
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://llm-example.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
    );
    const headers = new Headers(request.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-only");
    expect(headers.get("X-DashScope-SSE")).toBe("enable");
    expect(JSON.parse(String(request.body))).toEqual({
      model: ALIYUN_TTS_MODEL,
      input: { text: "Read aloud", voice: connection.voice, format: "mp3" },
    });
    fetchMock.mockResolvedValueOnce(stream(false));
    const { synthesizeSpeech } = await import("./provider");
    await expect(
      synthesizeSpeech("Read aloud", undefined, connection),
    ).rejects.toMatchObject({
      translation: { key: "models.connection.invalidResponse" },
    });
  });

  it("keeps final DashScope sentences and converts millisecond offsets exactly once", async () => {
    const connection = {
      ...defaultSettings().transcription,
      workspaceId: "llm-example",
      apiKey: "test-only",
    };
    const first = {
      sentence_id: 1,
      sentence_end: true,
      text: "Hello",
      begin_time: 100,
      end_time: 950,
    };
    const second = {
      sentence_id: 2,
      sentence_end: true,
      text: "World",
      begin_time: 1050,
      end_time: 2150,
      speaker_id: 1,
    };
    const outputs = [
      { text: "Hel", sentence: { ...first, sentence_end: false } },
      { text: "Hello", sentence: first },
      { text: "Hello wor", sentence: { ...second, sentence_end: false } },
      { text: "Hello World", sentences: [first, second] },
    ];
    const stream = (values: unknown[]) =>
      new Response(
        values
          .map(
            (output) =>
              "event:result\ndata:" + JSON.stringify({ output }) + "\n\n",
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      stream(outputs),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeDetailed } = await import("./provider");
    const audio = new Blob(["test audio bytes"], { type: "audio/wav" });
    await expect(
      transcribeDetailed(audio, "recording.wav", undefined, connection),
    ).resolves.toEqual({
      text: "Hello World",
      segments: [
        { text: "Hello", start: 0.1, end: 0.95 },
        { text: "World", start: 1.05, end: 2.15, speaker: "1" },
      ],
    });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://llm-example.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    );
    expect(new Headers(request.headers).get("X-DashScope-SSE")).toBe("enable");
    expect(JSON.parse(String(request.body))).toEqual({
      model: ALIYUN_ASR_MODEL,
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: "data:audio/wav;base64," + btoa("test audio bytes"),
                },
              },
            ],
          },
        ],
      },
      parameters: { format: "wav" },
    });
    fetchMock.mockResolvedValueOnce(stream(outputs.slice(0, 3)));
    await expect(
      transcribeDetailed(audio, "recording.wav", undefined, connection),
    ).rejects.toMatchObject({
      translation: { key: "models.connection.invalidResponse" },
    });
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
    await vi.waitFor(() => expect(delta).toHaveBeenCalledWith("partial"));
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
  });
});
