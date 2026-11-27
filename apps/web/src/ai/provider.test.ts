import { setLanguage } from "@/i18n";
import { errorText } from "@/i18n/errors";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  chat,
  listLanguageModels,
  parseModelJSON,
  readChatStream,
  testModelOperation,
} from "./provider";
import { defaultSettings, newLanguageConnection } from "./settings";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=";
const json = (body: unknown, status = 200) => Response.json(body, { status });
const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    {
      headers: { "Content-Type": "text/event-stream" },
    },
  );

function configuredLanguage() {
  return {
    ...newLanguageConnection(),
    baseUrl: "https://models.example/v1",
    model: "test-model",
    apiKey: "test-only",
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5861" } });
  setLanguage("zh-CN");
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage("zh-CN");
});

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

  it("rejects empty or malformed model responses", async () => {
    await expect(
      readChatStream(new Response("data: [DONE]\n")),
    ).rejects.toThrow("空内容");
    expect(() => parseModelJSON("not json")).toThrow("格式");
    expect(parseModelJSON('```json\n{"text":"内容"}\n```')).toEqual({
      text: "内容",
    });
  });

  it("sends Responses requests with the chosen protocol, structured output, and stateless content", async () => {
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      json({
        status: "completed",
        output: [
          { type: "reasoning", content: [{ type: "text", text: "hidden" }] },
          {
            type: "message",
            content: [{ type: "output_text", text: '{"ok":true}' }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const connection = {
      ...configuredLanguage(),
      protocol: "responses" as const,
      baseUrl: "https://models.example/api",
    };
    await expect(
      chat(
        [
          { role: "system", content: "Return JSON." },
          {
            role: "user",
            content: [
              { type: "text", text: "Read this." },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64," + PNG },
              },
            ],
          },
        ],
        { capability: "vision", connection, json: true },
      ),
    ).resolves.toBe('{"ok":true}');
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://models.example/api/responses");
    expect(JSON.parse(String(request.body))).toMatchObject({
      store: false,
      stream: false,
      model: connection.model,
      input: [
        { role: "system", content: "Return JSON." },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Read this." },
            { type: "input_image", image_url: "data:image/png;base64," + PNG },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
    });
  });

  it("streams Responses deltas and uses the complete event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse([
          { type: "response.output_text.delta", delta: "你好" },
          { type: "response.output_text.delta", delta: "世界" },
          { type: "response.completed", response: { output_text: "你好世界" } },
        ]),
      ),
    );
    const connection = {
      ...configuredLanguage(),
      protocol: "responses" as const,
    };
    const onDelta = vi.fn();
    await expect(
      chat([{ role: "user", content: "Hello." }], { connection, onDelta }),
    ).resolves.toBe("你好世界");
    expect(onDelta.mock.calls).toEqual([["你好"], ["世界"]]);
  });

  it.each(["response.failed", "response.incomplete", "missing terminal event"])(
    "rejects partial Responses output after %s",
    async (type) => {
      const events = [{ type: "response.output_text.delta", delta: "partial" }];
      if (type !== "missing terminal event") events.push({ type, delta: "" });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => sse(events)),
      );
      const connection = {
        ...configuredLanguage(),
        protocol: "responses" as const,
      };
      const onDelta = vi.fn();
      await expect(
        chat([{ role: "user", content: "Hello." }], { connection, onDelta }),
      ).rejects.toMatchObject({
        translation: { key: "models.connection.invalidResponse" },
      });
      expect(onDelta.mock.calls).toEqual([["partial"]]);
    },
  );
});

describe("connection tests", () => {
  it.each(["text", "image"] as const)(
    "cancels a pending %s connection test",
    async (operation) => {
      const controller = new AbortController();
      const fetchMock = vi.fn(
        (_url: string, request: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Cancelled", "AbortError")),
              { once: true },
            );
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const pending = testModelOperation(
        operation,
        {
          ...(operation === "text"
            ? configuredLanguage()
            : defaultSettings().images["gpt-image"]),
          apiKey: "test-only",
        },
        controller.signal,
      );
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const requestSignal = fetchMock.mock.calls[0][1].signal;
      expect(requestSignal?.aborted).toBe(false);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(requestSignal?.aborted).toBe(true);
    },
  );

  it("reports a request failure in the display language without retaining provider output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("provider details")),
    );
    const error: unknown = await testModelOperation("image", {
      ...defaultSettings().images["gpt-image"],
      apiKey: "test-only",
    }).catch((failure: unknown) => failure);
    expect(error).toMatchObject({
      translation: { key: "models.connection.network" },
    });
    expect(errorText(error, "zh-CN")).toMatch(/\p{Script=Han}/u);
    expect(errorText(error, "en")).toContain("Image generation");
    expect(errorText(error, "en")).not.toContain("provider details");
  });

  it("gets available model IDs even before choosing a model", async () => {
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) =>
      json({ data: [{ id: "model-b" }, { id: "model-a" }, { id: "model-b" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      listLanguageModels({
        ...configuredLanguage(),
        model: "",
      }),
    ).resolves.toEqual(["model-a", "model-b"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://models.example/v1/models");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
  });

  it("does not send a key anywhere when the API URL has not been entered", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const connection = { ...configuredLanguage(), baseUrl: "" };
    await expect(listLanguageModels(connection)).rejects.toMatchObject({
      translation: { key: "models.connection.missingBaseUrl" },
    });
    await expect(
      chat([{ role: "user", content: "Hello." }], { connection }),
    ).rejects.toMatchObject({
      translation: { key: "models.connection.missingBaseUrl" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies the digits only when the model reads the actual supplied image", async () => {
    const draw = vi.fn<(text: string, x: number, y: number) => void>();
    const image = "data:image/png;base64," + PNG;
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ fillRect() {}, fillText: draw }),
        toDataURL: () => image,
      }),
    });
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      expect(body.messages[0].content[1]).toEqual({
        type: "image_url",
        image_url: { url: image },
      });
      const digits = draw.mock.calls[0][0];
      expect(body.messages[0].content[0].text).not.toContain(digits);
      return json({ choices: [{ message: { content: digits } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const connection = configuredLanguage();
    await expect(testModelOperation("vision", connection)).resolves.toEqual({
      status: "verified",
    });

    fetchMock.mockResolvedValueOnce(
      json({ choices: [{ message: { content: "not an answer" } }] }),
    );
    await expect(
      testModelOperation("vision", connection),
    ).rejects.toMatchObject({
      translation: { key: "models.connection.unexpectedTestOutput" },
    });

    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: {
            code: "unsupported_image_input",
            message: "This model does not support image inputs.",
          },
        },
        400,
      ),
    );
    await expect(testModelOperation("vision", connection)).resolves.toEqual({
      status: "unsupported",
    });

    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: {
            code: "invalid_image_format",
            message:
              "Unsupported image format. Only PNG and JPEG are accepted.",
          },
        },
        400,
      ),
    );
    await expect(
      testModelOperation("vision", connection),
    ).rejects.toMatchObject({
      translation: { key: "models.connection.rejected" },
    });

    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "invalid_api_key" } }, 401),
    );
    await expect(
      testModelOperation("vision", connection),
    ).rejects.toMatchObject({
      translation: { key: "models.connection.unauthorized" },
    });
  });
});
