import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  Editor,
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
} from "@/features/canvas/editor";
import { connectShapes } from "@/features/canvas/connection-parser";
import { setLanguage } from "@/i18n";
const mocks = vi.hoisted(() => ({
  instruction: vi.fn(),
  image: vi.fn(),
  speech: vi.fn(),
  website: vi.fn(),
  file: vi.fn(),
  chart: vi.fn(),
  agent: vi.fn(),
}));
vi.mock("@/api/backend", () => ({
  instructionAPI: mocks.instruction,
  imageAPI: mocks.image,
  audioGenerateAPI: mocks.speech,
  websiteAPI: mocks.website,
  documentGenerateAPI: mocks.file,
  blobAsDataURL: vi.fn(async () => "data:image/png;base64,local-context"),
  extractAPIData: (response: any) => response,
}));
vi.mock("@/api/canvas-components", () => ({ generateChart: mocks.chart }));
vi.mock("@/features/canvas/agent-sse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/canvas/agent-sse")>()),
  callAgentSSE: mocks.agent,
}));
import {
  inputForShape,
  inputsForShapes,
  inputsForNode,
  nodeExecution,
  nodeIsBusy,
  runProjectWorkflow,
  runStaleWorkflow,
  runWorkflow,
  stopAllExecutions,
} from "./execute";
import { resultIsStale } from "./freshness";
import { saveResultEdit } from "./results";
const value = (text: string) => ({ name: "生成内容", description: "", text });
function board() {
  return new Editor(createCanvasStore());
}
function node(editor: Editor, id: string, type: string, text = "") {
  editor.createShape({ id, type, props: { w: 320, h: 220, text } });
}
beforeEach(() => {
  setLanguage("zh-CN");
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.instruction.mockResolvedValue(value("新的生成结果"));
  mocks.image.mockResolvedValue({
    ...value("图片说明"),
    src: "/api/assets/generated-image",
  });
  mocks.website.mockResolvedValue({
    ...value("<h1>网站</h1>"),
    description: "网站摘要",
  });
  mocks.speech.mockResolvedValue({
    ...value("朗读内容"),
    src: "/api/assets/speech",
    description: "语音摘要",
  });
  mocks.file.mockResolvedValue({
    ...value("文件正文"),
    src: "/api/assets/file",
    name: "report.txt",
    description: "文件摘要",
  });
  mocks.chart.mockResolvedValue({
    content: "根节点",
    children: [],
    name: "图表标题",
    description: "图表摘要",
  });
  mocks.agent.mockResolvedValue([]);
});
describe("workflow execution parity", () => {
  it("retranslates a failed node for the canvas language and later language switches", async () => {
    const editor = board();
    node(editor, "shape:empty", "instruction");
    await expect(runWorkflow(editor, "shape:empty")).rejects.toThrow(
      "请输入指令或连接素材",
    );
    expect(nodeExecution(editor, "shape:empty", "en").message).toBe(
      "Write instructions or connect materials",
    );
    setLanguage("en");
    expect(nodeExecution(editor, "shape:empty").message).toBe(
      "Write instructions or connect materials",
    );
    editor.updateShape({ id: "shape:empty", props: { text: "继续执行" } });
    await runWorkflow(editor, "shape:empty");
    expect(nodeExecution(editor, "shape:empty", "en").message).toBe(
      "Completed",
    );
  });
  it.each(["ai-image", "speech", "file"])(
    "stops an empty %s before triggering downstream generation",
    async (type) => {
      const editor = board();
      node(editor, "shape:empty", type);
      node(editor, "shape:next", "instruction", "不应自动执行");
      connectShapes(editor, "shape:empty", "shape:next");
      await expect(runWorkflow(editor, "shape:empty")).rejects.toThrow(
        "请连接前置组件",
      );
      expect(mocks.instruction).not.toHaveBeenCalled();
    },
  );
  it("reads older Huayu chart titles without forwarding the previously duplicated JSON result", async () => {
    const editor = board();
    const data = JSON.stringify({
      content: "根节点",
      children: [],
      name: "图表标题",
    });
    node(editor, "shape:chart", "chart");
    editor.updateShape({
      id: "shape:chart",
      props: { result: data, chartData: data, name: "图表标题" },
    });
    for (const type of [
      "ai-text",
      "instruction",
      "website",
      "speech",
      "file",
    ]) {
      expect(
        await inputsForNode(editor, type, [editor.getShape("shape:chart")]),
      ).toEqual([expect.objectContaining({ type: "text", text: "图表标题" })]);
    }
  });
  it("replaces text with upstream outputs, using website summaries instead of HTML", async () => {
    const editor = board();
    node(editor, "shape:first", "instruction", "原要求");
    editor.updateShape({ id: "shape:first", props: { result: "第一段" } });
    node(editor, "shape:web", "website");
    editor.updateShape({
      id: "shape:web",
      props: { result: "<h1>HTML</h1>", description: "网站摘要" },
    });
    node(editor, "shape:text", "ai-text", "不应追加的旧正文");
    connectShapes(editor, "shape:first", "shape:text");
    connectShapes(editor, "shape:web", "shape:text");
    await runWorkflow(editor, "shape:text");
    expect(editor.getShape("shape:text").props).toMatchObject({
      text: "第一段\n网站摘要",
      result: "第一段\n网站摘要",
    });
    expect(mocks.instruction).not.toHaveBeenCalled();
    editor.deleteShape("shape:first");
    editor.deleteShape("shape:web");
    await runWorkflow(editor, "shape:text");
    expect(editor.getShape("shape:text").props.result).toBe("第一段\n网站摘要");
  });
  it("generates a website from the latest upstream output and renders its HTML", async () => {
    const editor = board();
    node(editor, "shape:task", "instruction", "编写网站内容");
    node(editor, "shape:web", "website", "不应作为独立提示词的旧内容");
    node(editor, "shape:summary", "ai-text");
    connectShapes(editor, "shape:task", "shape:web");
    connectShapes(editor, "shape:web", "shape:summary");
    await runWorkflow(editor, "shape:task");
    expect(mocks.website.mock.calls[0][0]).toEqual([
      expect.objectContaining({ type: "text", text: "新的生成结果" }),
    ]);
    expect(editor.getShape("shape:web").props).toMatchObject({
      htmlContent: "<h1>网站</h1>",
      result: "<h1>网站</h1>",
      description: "网站摘要",
    });
    expect(editor.getShape("shape:summary").props.text).toBe("网站摘要");
  });
  it("requires an upstream website input even if an old local prompt is stored", async () => {
    const editor = board();
    node(editor, "shape:web", "website", "旧的本地要求");
    await expect(runWorkflow(editor, "shape:web")).rejects.toThrow(
      "请连接前置组件",
    );
    expect(mocks.website).not.toHaveBeenCalled();
  });
  it("passes a connected frame as one snapshot without separately collecting its children", async () => {
    const editor = board();
    node(editor, "shape:frame", "frame");
    editor.createShape({
      id: "shape:child",
      type: "ai-text",
      parentId: "shape:frame",
      props: { text: "不应单独传入的内部文字" },
    });
    const capture = vi.spyOn(editor, "toImage").mockResolvedValue({
      blob: new Blob(["snapshot"]),
      width: 100,
      height: 100,
    });
    for (const type of [
      "instruction",
      "ai-image",
      "website",
      "speech",
      "file",
    ]) {
      expect(
        await inputsForNode(editor, type, [editor.getShape("shape:frame")]),
      ).toEqual([
        expect.objectContaining({
          type: "image",
          src: "data:image/png;base64,local-context",
        }),
      ]);
    }
    expect(
      capture.mock.calls.every(
        ([ids]) => ids.length === 1 && ids[0] === "shape:frame",
      ),
    ).toBe(true);
    expect(
      await inputsForNode(editor, "ai-text", [editor.getShape("shape:frame")]),
    ).toEqual([{ type: "text", text: "画框" }]);
    expect(capture).toHaveBeenCalledTimes(5);
  });
  it("uses only text, images and frame snapshots as image generation inputs", async () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", "新的图片要求");
    node(editor, "shape:audio", "speech");
    editor.updateShape({
      id: "shape:audio",
      props: { result: "不应作为图片输入的语音", src: "/api/assets/audio" },
    });
    node(editor, "shape:image", "ai-image");
    editor.updateShape({
      id: "shape:image",
      props: { isUploaded: true, src: "/api/assets/old", imageSize: "3:2" },
    });
    connectShapes(editor, "shape:source", "shape:image");
    connectShapes(editor, "shape:audio", "shape:image");
    await runWorkflow(editor, "shape:image");
    expect(mocks.image.mock.calls[0][0]).toEqual([
      expect.objectContaining({ type: "text", text: "新的图片要求" }),
    ]);
    expect(mocks.image.mock.calls[0][1]).toMatchObject({ size: "2496x1664" });
    expect(editor.getShape("shape:image").props).toMatchObject({
      src: "/api/assets/generated-image",
      isUploaded: false,
    });
  });
  it.each(["speech", "file"])(
    "regenerates an uploaded %s from upstream text and passes its new content onward",
    async (type) => {
      const editor = board();
      node(editor, "shape:source", "instruction");
      editor.updateShape({
        id: "shape:source",
        props: { result: "最新内容", description: "素材说明" },
      });
      node(editor, "shape:output", type);
      editor.updateShape({
        id: "shape:output",
        props: { src: "/api/assets/old", isUploaded: true, result: "旧内容" },
      });
      node(editor, "shape:text", "ai-text");
      connectShapes(editor, "shape:source", "shape:output");
      connectShapes(editor, "shape:output", "shape:text");
      await runWorkflow(editor, "shape:output");
      const call = type === "speech" ? mocks.speech : mocks.file;
      expect(call.mock.calls[0][0]).toEqual([
        expect.objectContaining({
          type: "text",
          text: "最新内容",
          description: "素材说明",
        }),
      ]);
      expect(editor.getShape("shape:output").props).toMatchObject({
        isUploaded: false,
        description: type === "speech" ? "语音摘要" : "文件摘要",
      });
      expect(editor.getShape("shape:text").props.text).toBe(
        type === "speech" ? "朗读内容" : "文件正文",
      );
    },
  );
  it.each(["ai-image", "speech", "file"])(
    "passes an existing %s without regeneration when it has no upstream input",
    async (type) => {
      const editor = board();
      node(editor, "shape:asset", type);
      editor.updateShape({
        id: "shape:asset",
        props: {
          src: "/api/assets/uploaded",
          result: "上传内容",
          isUploaded: true,
        },
      });
      node(editor, "shape:task", "instruction", "读取内容");
      connectShapes(editor, "shape:asset", "shape:task");
      await runWorkflow(editor, "shape:asset");
      expect(mocks.image).not.toHaveBeenCalled();
      expect(mocks.speech).not.toHaveBeenCalled();
      expect(mocks.file).not.toHaveBeenCalled();
      expect(mocks.instruction.mock.calls[0][1]).toContainEqual(
        expect.objectContaining({ src: "/api/assets/uploaded" }),
      );
    },
  );
  it("stores chart structure separately and passes its title as the text output", async () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", '{"topic":"上游 JSON"}');
    node(editor, "shape:chart", "chart", "不应追加的旧输入");
    editor.updateShape({ id: "shape:chart", props: { chartType: "mindmap" } });
    node(editor, "shape:text", "ai-text");
    connectShapes(editor, "shape:source", "shape:chart");
    connectShapes(editor, "shape:chart", "shape:text");
    await runWorkflow(editor, "shape:chart");
    expect(mocks.chart.mock.calls[0][0]).toMatchObject({
      inputs: [{ type: "text", text: '{"topic":"上游 JSON"}' }],
      type: "mindmap",
    });
    expect(editor.getShape("shape:chart").props).toMatchObject({
      result: "图表标题",
      description: "图表摘要",
      chartData: JSON.stringify({
        content: "根节点",
        children: [],
        name: "图表标题",
        description: "图表摘要",
      }),
    });
    expect(editor.getShape("shape:text").props.text).toBe("图表标题");
  });
  it("stops at an intermediate start node until it is clicked, then reads through it", async () => {
    const editor = board();
    node(editor, "shape:task", "instruction", "生成网站内容");
    node(editor, "shape:gate", "start");
    node(editor, "shape:web", "website");
    connectShapes(editor, "shape:task", "shape:gate");
    connectShapes(editor, "shape:gate", "shape:web");
    await runWorkflow(editor, "shape:task");
    expect(mocks.website).not.toHaveBeenCalled();
    await runWorkflow(editor, "shape:gate");
    expect(mocks.website.mock.calls[0][0]).toEqual([
      expect.objectContaining({ text: "新的生成结果" }),
    ]);
    expect(mocks.instruction).toHaveBeenCalledTimes(1);
  });
  it("limits AI drawing context and screenshots to native shapes inside its own box", async () => {
    const editor = board();
    editor.createShape({
      id: "shape:drawing",
      type: "ai-draw",
      x: 100,
      y: 100,
      props: { w: 600, h: 400, query: "整理框内图形" },
    });
    editor.createShape({
      id: "shape:inside",
      type: "geo",
      x: 120,
      y: 120,
      props: { w: 100, h: 80, text: "框内" },
    });
    editor.createShape({
      id: "shape:outside",
      type: "geo",
      x: 900,
      y: 100,
      props: { w: 100, h: 80 },
    });
    editor.createShape({
      id: "shape:ai",
      type: "instruction",
      x: 300,
      y: 120,
      props: { w: 100, h: 80 },
    });
    const capture = vi.spyOn(editor, "toImage").mockResolvedValue({
      blob: new Blob(["snapshot"]),
      width: 100,
      height: 100,
    });
    await runWorkflow(editor, "shape:drawing");
    expect(capture.mock.calls[0]).toEqual([
      ["shape:inside"],
      { format: "png", background: false, padding: 10 },
    ]);
    expect(mocks.agent.mock.calls[0][0]).toMatchObject({
      query: "整理框内图形",
      viewport_bounds: { x: 100, y: 100, w: 600, h: 400 },
      shapes: [
        expect.objectContaining({ shapeId: "shape:inside", text: "框内" }),
      ],
    });
    editor.updateShape({ id: "shape:outside", props: { text: "框外变化" } });
    expect(resultIsStale(editor, "shape:drawing")).toBe(false);
    editor.updateShape({ id: "shape:inside", props: { text: "框内变化" } });
    expect(resultIsStale(editor, "shape:drawing")).toBe(true);
  });
  it("stops all active requests and skips queued steps even when a response arrives late", async () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", "用户输入");
    node(editor, "shape:active", "instruction", "第一条工作流");
    editor.updateShape({ id: "shape:active", props: { result: "已有结果" } });
    node(editor, "shape:queued", "instruction", "未开始的步骤");
    node(editor, "shape:independent", "instruction", "第二条工作流");
    connectShapes(editor, "shape:source", "shape:active");
    connectShapes(editor, "shape:active", "shape:queued");
    type Finish = (result: ReturnType<typeof value>) => void;
    const requests = new Map<string, { signal: AbortSignal; finish: Finish }>();
    mocks.instruction.mockImplementation(
      (query: string, _inputs, _search, signal: AbortSignal) =>
        new Promise<ReturnType<typeof value>>((finish) => {
          requests.set(query, { signal, finish });
        }),
    );
    const settled = Promise.allSettled([
      runWorkflow(editor, "shape:source"),
      runWorkflow(editor, "shape:independent"),
    ]);
    await vi.waitFor(() => expect(requests.size).toBe(2));
    expect(nodeExecution(editor, "shape:source").status).toBe("success");
    expect(nodeExecution(editor, "shape:queued").status).toBe("queued");

    stopAllExecutions(editor);
    expect([...requests.values()].every(({ signal }) => signal.aborted)).toBe(
      true,
    );
    expect(nodeExecution(editor, "shape:queued", "zh-CN")).toMatchObject({
      status: "cancelled",
      message: "未继续运行",
    });
    expect(nodeExecution(editor, "shape:queued", "en").message).toBe("Not run");
    expect(nodeIsBusy(editor, "shape:active")).toBe(true);
    expect(nodeIsBusy(editor, "shape:independent")).toBe(true);
    requests.get("第一条工作流")!.finish(value("迟到的结果"));
    await vi.waitFor(() =>
      expect(nodeIsBusy(editor, "shape:active")).toBe(false),
    );
    expect(nodeIsBusy(editor, "shape:independent")).toBe(true);
    expect(mocks.instruction).toHaveBeenCalledTimes(2);
    requests.get("第二条工作流")!.finish(value("迟到的结果"));
    for (const result of await settled)
      expect(result).toMatchObject({
        status: "rejected",
        reason: { name: "AbortError" },
      });

    expect(mocks.instruction).toHaveBeenCalledTimes(2);
    expect(nodeExecution(editor, "shape:active").status).toBe("cancelled");
    expect(nodeExecution(editor, "shape:independent").status).toBe("cancelled");
    expect(nodeExecution(editor, "shape:source").status).toBe("success");
    expect(editor.getShape("shape:active").props.result).toBe("已有结果");
    expect(editor.getShape("shape:independent").props.result).toBeUndefined();
    expect(nodeIsBusy(editor, "shape:queued")).toBe(false);
    expect(nodeIsBusy(editor, "shape:independent")).toBe(false);
  });

  it("stops an active AI drawing request and allows it to run again", async () => {
    const editor = board();
    editor.createShape({
      id: "shape:drawing",
      type: "ai-draw",
      props: { w: 600, h: 400, query: "画一个圆" },
    });
    let requestSignal: AbortSignal | undefined;
    mocks.agent.mockImplementationOnce(
      (_request, _onEvent, signal: AbortSignal) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    );
    const running = runWorkflow(editor, "shape:drawing");
    const cancelled = expect(running).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    await runWorkflow(editor, "shape:drawing");
    await cancelled;
    expect(requestSignal?.aborted).toBe(true);
    expect(nodeExecution(editor, "shape:drawing").status).toBe("cancelled");
    expect(editor.getShape("shape:drawing").props.generation).toBeUndefined();
    await runWorkflow(editor, "shape:drawing");
    expect(mocks.agent).toHaveBeenCalledTimes(2);
    expect(nodeExecution(editor, "shape:drawing").status).toBe("success");
  });
  it("does not execute an external link as an AI workflow step", async () => {
    const editor = board();
    node(editor, "shape:link", "interactive-web");
    editor.updateShape({
      id: "shape:link",
      props: {
        url: "https://example.com",
        webpageContent: "<h1>外部网站</h1>",
      },
    });
    node(editor, "shape:task", "instruction", "不应自动触发");
    connectShapes(editor, "shape:link", "shape:task");
    await runWorkflow(editor, "shape:link");
    expect(mocks.instruction).not.toHaveBeenCalled();
    expect(editor.getShape("shape:link").props.generation).toBeUndefined();
  });
  it("updates status labels when language changes without changing user content", async () => {
    const editor = board();
    node(editor, "shape:task", "instruction", "保留用户原文");
    let finish: (data: ReturnType<typeof value>) => void;
    mocks.instruction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = runWorkflow(editor, "shape:task");
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(nodeExecution(editor, "shape:task").message).toBe("正在处理");
    setLanguage("en");
    expect(nodeExecution(editor, "shape:task").message).toBe("Processing");
    finish!(value("保留生成结果"));
    await running;
    expect(nodeExecution(editor, "shape:task").message).toBe("Completed");
    setLanguage("zh-CN");
    expect(nodeExecution(editor, "shape:task").message).toBe("已完成");
    expect(editor.getShape("shape:task").props.text).toBe("保留用户原文");
    expect(editor.getShape("shape:task").props.result).toBe("保留生成结果");
  });
  it("preserves model errors instead of treating their text as translation keys", async () => {
    const editor = board();
    node(editor, "shape:task", "instruction", "保持错误详情");
    mocks.instruction.mockRejectedValueOnce(new Error("分享画布"));
    setLanguage("en");
    await expect(runWorkflow(editor, "shape:task")).rejects.toThrow("分享画布");
    expect(nodeExecution(editor, "shape:task").message).toBe("分享画布");
  });
  it("does not bring back a request after the generated text was intentionally cleared", async () => {
    const editor = board();
    node(editor, "shape:source", "instruction", "不应作为正文的原要求");
    editor.updateShape({ id: "shape:source", props: { result: "" } });
    expect(
      await inputForShape(editor, editor.getShape("shape:source"), new Set()),
    ).toEqual([]);
  });
  it("keeps a locked edited image unchanged when running the rest of its workflow", async () => {
    const editor = board();
    node(editor, "shape:original", "ai-image");
    editor.updateShape({
      id: "shape:original",
      props: { src: "/api/assets/original", isUploaded: true },
    });
    node(editor, "shape:cropped", "ai-image");
    editor.updateShape({
      id: "shape:cropped",
      props: { src: "/api/assets/cropped", isUploaded: true, isLocked: true },
    });
    node(editor, "shape:task", "instruction", "依据裁剪后的图片写配文");
    connectShapes(editor, "shape:original", "shape:cropped");
    connectShapes(editor, "shape:cropped", "shape:task");
    await runProjectWorkflow(editor);
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.instruction.mock.calls[0][1]).toContainEqual(
      expect.objectContaining({ type: "image", src: "/api/assets/cropped" }),
    );
    expect(editor.getShape("shape:cropped").props.src).toBe(
      "/api/assets/cropped",
    );
  });
  it("regenerates an uploaded image from connected references and restores its status on reload", async () => {
    const editor = board();
    node(editor, "shape:image", "ai-image", "画一片安静的山谷");
    editor.updateShape({
      id: "shape:image",
      props: { src: "data:image/png;base64,reference", isUploaded: true },
    });
    node(editor, "shape:reference", "ai-image");
    editor.updateShape({
      id: "shape:reference",
      props: { src: "data:image/png;base64,connected" },
    });
    connectShapes(editor, "shape:reference", "shape:image");
    mocks.image.mockResolvedValue({
      src: "data:image/png;base64,result",
      text: "山谷",
      name: "山谷",
    });
    await runWorkflow(editor, "shape:image");
    expect(mocks.image.mock.calls[0][0]).toContainEqual({
      type: "image",
      src: "data:image/png;base64,connected",
    });
    expect(editor.getShape("shape:image").props.isUploaded).toBe(false);
    expect(resultIsStale(editor, "shape:image")).toBe(false);
    const restored = board();
    loadSnapshot(restored.store, getSnapshot(editor.store));
    expect(resultIsStale(restored, "shape:image")).toBe(false);
    expect(
      Object.keys(restored.getShape("shape:image").props.generation).sort(),
    ).toEqual(["completedAt", "durationMs", "fingerprint"]);
    restored.updateShape({ id: "shape:image", props: { text: "画得更明亮" } });
    expect(resultIsStale(restored, "shape:image")).toBe(true);
  });
  it("retains the last successful result when a later request fails", async () => {
    const editor = board();
    node(editor, "shape:task", "instruction", "整理素材");
    await runWorkflow(editor, "shape:task");
    const previous = editor.getShape("shape:task").props;
    mocks.instruction.mockRejectedValue(new Error("连接暂时中断"));
    await expect(runWorkflow(editor, "shape:task")).rejects.toThrow(
      "连接暂时中断",
    );
    expect(editor.getShape("shape:task").props.result).toBe(previous.result);
    expect(editor.getShape("shape:task").props.generation).toEqual(
      previous.generation,
    );
  });
  it("updates only the outdated branch and preserves fresh work elsewhere", async () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", "素材");
    node(editor, "shape:task", "instruction", "整理");
    node(editor, "shape:other", "instruction", "独立创作");
    connectShapes(editor, "shape:source", "shape:task");
    await runProjectWorkflow(editor);
    editor.updateShape({ id: "shape:source", props: { text: "更新的素材" } });
    expect(resultIsStale(editor, "shape:task")).toBe(true);
    mocks.instruction.mockClear();
    await runStaleWorkflow(editor);
    expect(mocks.instruction.mock.calls.map((call) => call[0])).toEqual([
      "整理",
    ]);
    expect(resultIsStale(editor, "shape:task")).toBe(false);
    expect(resultIsStale(editor, "shape:other")).toBe(false);
  });
  it("keeps results visibly outdated when material changes during a request", async () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", "旧素材");
    node(editor, "shape:task", "instruction", "整理");
    connectShapes(editor, "shape:source", "shape:task");
    let finish: (data: ReturnType<typeof value>) => void;
    mocks.instruction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = runWorkflow(editor, "shape:task");
    await vi.waitFor(() => expect(finish).toBeDefined());
    editor.updateShape({ id: "shape:source", props: { text: "新素材" } });
    finish!(value("依据旧素材生成"));
    await running;
    expect(resultIsStale(editor, "shape:task")).toBe(true);
    const output = editor
      .getCurrentPageShapes()
      .find((shape) => shape.type === "ai-text" && shape.id !== "shape:source");
    expect(resultIsStale(editor, output.id)).toBe(true);
  });
  it("continues from an existing result without regenerating the source", async () => {
    const editor = board();
    node(editor, "shape:existing", "instruction", "旧要求");
    editor.updateShape({
      id: "shape:existing",
      props: { result: "已经确认的版本" },
    });
    node(editor, "shape:revision", "instruction", "写得更简洁");
    connectShapes(editor, "shape:existing", "shape:revision");
    await runWorkflow(editor, "shape:revision");
    expect(mocks.instruction).toHaveBeenCalledTimes(1);
    expect(mocks.instruction.mock.calls[0][1][0].text).toBe("已经确认的版本");
    expect(editor.getShape("shape:existing").props.result).toBe(
      "已经确认的版本",
    );
  });
  it("sends the selected visual composition with original HTML and excludes unrelated content", async () => {
    const editor = board();
    node(editor, "shape:sketch", "geo", "把按钮放在这里");
    node(editor, "shape:web", "website");
    editor.updateShape({
      id: "shape:web",
      props: { htmlContent: "<button>原来的按钮</button>" },
    });
    node(editor, "shape:private", "ai-text", "未选中的内容");
    const render = vi.spyOn(editor, "toImage").mockResolvedValue({
      blob: new Blob(["image"]),
      width: 100,
      height: 100,
    });
    const inputs = await inputsForShapes(editor, [
      editor.getShape("shape:sketch"),
      editor.getShape("shape:web"),
    ]);
    expect(render.mock.calls[0][0]).toEqual(["shape:sketch", "shape:web"]);
    expect(inputs).toContainEqual(
      expect.objectContaining({
        type: "website",
        text: "<button>原来的按钮</button>",
      }),
    );
    expect(inputs).toContainEqual(
      expect.objectContaining({
        type: "image",
        src: "data:image/png;base64,local-context",
      }),
    );
    expect(JSON.stringify(inputs)).not.toContain("未选中的内容");
  });
  it("cancels before contacting the model if stopped during a canvas snapshot", async () => {
    const editor = board();
    node(editor, "shape:sketch", "geo");
    node(editor, "shape:task", "instruction", "描述画面");
    connectShapes(editor, "shape:sketch", "shape:task");
    let complete: (value: {
      blob: Blob;
      width: number;
      height: number;
    }) => void;
    vi.spyOn(editor, "toImage").mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const running = runWorkflow(editor, "shape:task");
    stopAllExecutions(editor);
    await vi.waitFor(() => expect(complete).toBeDefined());
    complete!({ blob: new Blob(["image"]), width: 100, height: 100 });
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.instruction).not.toHaveBeenCalled();
    expect(editor.getShape("shape:task").props.result).toBeUndefined();
  });
  it("preserves the editable source of websites inside a selected frame", async () => {
    const editor = board();
    node(editor, "shape:frame", "frame");
    editor.createShape({
      id: "shape:web",
      type: "website",
      parentId: "shape:frame",
      props: { htmlContent: "<h1>画框中的网页</h1>" },
    });
    editor.createShape({
      id: "shape:start",
      type: "start",
      parentId: "shape:frame",
    });
    editor.createShape({
      id: "shape:outside",
      type: "ai-text",
      x: 1000,
      y: 500,
      props: { text: "画框外未选择的内容" },
    });
    connectShapes(editor, "shape:outside", "shape:start");
    vi.spyOn(editor, "toImage").mockResolvedValue({
      blob: new Blob(["image"]),
      width: 100,
      height: 100,
    });
    const inputs = await inputsForShapes(editor, [
      editor.getShape("shape:frame"),
    ]);
    expect(inputs).toContainEqual(
      expect.objectContaining({
        type: "website",
        text: "<h1>画框中的网页</h1>",
      }),
    );
    expect(inputs.filter((input) => input.type === "image")).toHaveLength(1);
    expect(JSON.stringify(inputs)).not.toContain("画框外未选择的内容");
  });
  it("accepts material-only instructions and creates an output from a start node", async () => {
    const editor = board();
    node(editor, "shape:start", "start");
    node(editor, "shape:source", "ai-text", "有价值的素材");
    node(editor, "shape:task", "instruction");
    connectShapes(editor, "shape:start", "shape:source");
    connectShapes(editor, "shape:source", "shape:task");
    await runWorkflow(editor, "shape:start");
    expect(mocks.instruction.mock.calls[0][1][0].text).toBe("有价值的素材");
    expect(
      editor.getCurrentPageShapes().filter((shape) => shape.type === "ai-text"),
    ).toHaveLength(2);
    const output = editor
      .getCurrentPageShapes()
      .find((shape) => shape.type === "ai-text" && shape.id !== "shape:source");
    expect(output.props.text).toBe("");
    expect(output.props.result).toBe("新的生成结果");
    await runWorkflow(editor, "shape:start");
    expect(editor.getShape(output.id).props.result).toBe("新的生成结果");
    expect(nodeExecution(editor, "shape:task").status).toBe("success");
  });
  it("runs a shared fan-in once after both branches finish", async () => {
    const editor = board();
    node(editor, "shape:start", "start");
    node(editor, "shape:left", "instruction", "左边");
    node(editor, "shape:right", "instruction", "右边");
    node(editor, "shape:merge", "instruction", "合并");
    connectShapes(editor, "shape:start", "shape:left");
    connectShapes(editor, "shape:start", "shape:right");
    connectShapes(editor, "shape:left", "shape:merge");
    connectShapes(editor, "shape:right", "shape:merge");
    mocks.instruction.mockImplementation(async (query: string) =>
      value(query + "完成"),
    );
    await runWorkflow(editor, "shape:start");
    expect(mocks.instruction).toHaveBeenCalledTimes(3);
    expect(
      mocks.instruction.mock.calls
        .find((call) => call[0] === "合并")[1]
        .map((input: any) => input.text)
        .sort(),
    ).toEqual(["右边完成", "左边完成"]);
  });
  it("stops sibling requests and never runs downstream nodes after a failure", async () => {
    const editor = board();
    node(editor, "shape:start", "start");
    node(editor, "shape:slow", "instruction", "慢分支");
    node(editor, "shape:failed", "instruction", "失败分支");
    node(editor, "shape:next", "instruction", "不应调用");
    connectShapes(editor, "shape:start", "shape:slow");
    connectShapes(editor, "shape:start", "shape:failed");
    connectShapes(editor, "shape:slow", "shape:next");
    mocks.instruction.mockImplementation(
      (query: string, _inputs: any, _search: any, signal: AbortSignal) =>
        query === "失败分支"
          ? Promise.reject(new Error("服务暂不可用"))
          : new Promise((_resolve, reject) =>
              signal.addEventListener(
                "abort",
                () => reject(new DOMException("Stopped", "AbortError")),
                { once: true },
              ),
            ),
    );
    await expect(runWorkflow(editor, "shape:start")).rejects.toThrow(
      "服务暂不可用",
    );
    expect(
      mocks.instruction.mock.calls.some((call) => call[0] === "不应调用"),
    ).toBe(false);
    expect(nodeExecution(editor, "shape:failed").status).toBe("error");
    expect(nodeExecution(editor, "shape:slow").status).toBe("cancelled");
  });
  it("keeps a completed upstream result reserved until the workflow finishes", async () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", "源内容");
    node(editor, "shape:next", "instruction", "处理源内容");
    connectShapes(editor, "shape:source", "shape:next");
    let finish!: (result: ReturnType<typeof value>) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.instruction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const running = runWorkflow(editor, "shape:source");
    await entered;
    expect(nodeExecution(editor, "shape:source").status).toBe("success");
    expect(nodeIsBusy(editor, "shape:source")).toBe(true);
    expect(() =>
      saveResultEdit(editor, "shape:source", "源内容", "提前修改"),
    ).toThrow("正在生成");
    expect(editor.getShape("shape:source").props.text).toBe("源内容");
    finish(value("完成"));
    await running;
    expect(nodeIsBusy(editor, "shape:source")).toBe(false);
    saveResultEdit(editor, "shape:source", "源内容", "完成后修改");
    expect(editor.getShape("shape:source").props.text).toBe("完成后修改");
  });
  it("keeps locked cached results and accepts native image and note inputs", async () => {
    const editor = board();
    node(editor, "shape:locked", "instruction", "不应重跑");
    editor.updateShape({
      id: "shape:locked",
      props: { isLocked: true, result: "已确认结果" },
    });
    node(editor, "shape:next", "instruction", "使用结果");
    connectShapes(editor, "shape:locked", "shape:next");
    await runProjectWorkflow(editor);
    expect(mocks.instruction.mock.calls[0][1][0].text).toBe("已确认结果");
    expect(mocks.instruction).toHaveBeenCalledTimes(1);
    editor.store.put([
      {
        id: "asset:image",
        typeName: "asset",
        type: "image",
        props: { src: "/api/assets/image" },
      },
    ]);
    editor.createShape({
      id: "shape:image",
      type: "image",
      props: { assetId: "asset:image", w: 200, h: 100 },
    });
    connectShapes(editor, "shape:image", "shape:next");
    expect(
      (
        await inputForShape(editor, editor.getShape("shape:image"), new Set())
      )[0],
    ).toMatchObject({ type: "image", src: "/api/assets/image" });
  });
});
