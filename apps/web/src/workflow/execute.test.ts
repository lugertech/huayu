import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  Editor,
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
} from "@/canvas/editor";
import { connectShapes } from "@/utils/connectionParser";
import { setLanguage } from "@/i18n";
const mocks = vi.hoisted(() => ({ instruction: vi.fn(), image: vi.fn() }));
vi.mock("@/api/backend", () => ({
  instructionAPI: mocks.instruction,
  imageAPI: mocks.image,
  audioGenerateAPI: vi.fn(),
  websiteAPI: vi.fn(),
  documentGenerateAPI: vi.fn(),
  blobAsDataURL: vi.fn(async () => "data:image/png;base64,local-context"),
  extractAPIData: (response: any) => response,
}));
import {
  inputForShape,
  inputsForShapes,
  nodeExecution,
  runProjectWorkflow,
  runStaleWorkflow,
  runWorkflow,
  stopAllExecutions,
} from "./execute";
import { resultIsStale } from "./freshness";
const value = (text: string) => ({ name: "生成内容", description: "", text });
function board() {
  return new Editor(createCanvasStore());
}
function node(editor: Editor, id: string, type: string, text = "") {
  editor.createShape({ id, type, props: { w: 320, h: 220, text } });
}
beforeEach(() => {
  mocks.instruction.mockReset();
  mocks.image.mockReset();
  mocks.instruction.mockResolvedValue(value("新的生成结果"));
});
describe("workflow execution parity", () => {
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
  it("keeps a manually edited image unchanged when running the rest of its workflow", async () => {
    const editor = board();
    node(editor, "shape:original", "ai-image");
    editor.updateShape({
      id: "shape:original",
      props: { src: "/api/assets/original", isUploaded: true },
    });
    node(editor, "shape:cropped", "ai-image");
    editor.updateShape({
      id: "shape:cropped",
      props: { src: "/api/assets/cropped", isUploaded: true },
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
  it("keeps a generated image fresh after replacing an uploaded reference and restores its status on reload", async () => {
    const editor = board();
    node(editor, "shape:image", "ai-image", "画一片安静的山谷");
    editor.updateShape({
      id: "shape:image",
      props: { src: "data:image/png;base64,reference", isUploaded: true },
    });
    mocks.image.mockResolvedValue({
      src: "data:image/png;base64,result",
      text: "山谷",
      name: "山谷",
    });
    await runWorkflow(editor, "shape:image");
    expect(mocks.image.mock.calls[0][0]).toContainEqual({
      type: "image",
      src: "data:image/png;base64,reference",
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
    node(editor, "shape:outside", "ai-text", "画框外未选择的内容");
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
