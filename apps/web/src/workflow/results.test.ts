import { describe, expect, it } from "vite-plus/test";
import {
  Editor,
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
} from "@/canvas/editor";
import { connectedShapes, connectShapes } from "@/utils/connectionParser";
import { generationFingerprint, resultIsStale } from "./freshness";
import {
  completedRevision,
  createImageRevision,
  createResultRevision,
  imageRatio,
  previousRevision,
  readResultDraft,
  resultDraftKey,
  resultText,
  resultVersions,
  pendingRevision,
  saveResultEdit,
} from "./results";

function board() {
  return new Editor(createCanvasStore());
}
function node(
  editor: Editor,
  id: string,
  type: string,
  props: Record<string, unknown>,
) {
  editor.createShape({ id, type, props: { w: 360, h: 240, ...props } });
}
describe("editing and continuing generated work", () => {
  it("finds the unfinished revision after closing and reopening without reusing finished work", () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", { text: "原作" });
    const id = createResultRevision(
      editor,
      "shape:source",
      "website",
      "继续修改",
    );
    expect(pendingRevision(editor, "shape:source", "website", "继续修改")).toBe(
      id,
    );
    expect(
      pendingRevision(editor, "shape:source", "instruction", "继续修改"),
    ).toBeNull();
    editor.updateShape({ id, props: { htmlContent: "<p>已完成</p>" } });
    expect(
      pendingRevision(editor, "shape:source", "website", "继续修改"),
    ).toBeNull();
  });
  it("edits the instruction output without replacing its request and can undo the complete edit", () => {
    const editor = board();
    node(editor, "shape:task", "instruction", {
      text: "保留原要求",
      result: "生成的文字",
    });
    saveResultEdit(editor, "shape:task", "生成的文字", "亲手修改的正文");
    expect(editor.getShape("shape:task").props).toMatchObject({
      text: "保留原要求",
      result: "亲手修改的正文",
    });
    editor.undo();
    expect(resultText(editor.getShape("shape:task"))).toBe("生成的文字");
  });
  it("keeps website source and output consistent and marks downstream work outdated", () => {
    const editor = board();
    node(editor, "shape:web", "website", {
      text: "原网页要求",
      htmlContent: "<h1>原版</h1>",
      result: "<h1>原版</h1>",
    });
    node(editor, "shape:next", "instruction", { text: "继续优化" });
    connectShapes(editor, "shape:web", "shape:next");
    editor.updateShape({
      id: "shape:next",
      props: {
        generation: {
          fingerprint: generationFingerprint(editor, "shape:next"),
          durationMs: 1,
          completedAt: 1,
        },
      },
    });
    saveResultEdit(editor, "shape:web", "<h1>原版</h1>", "<h1>新版</h1>");
    expect(editor.getShape("shape:web").props).toMatchObject({
      text: "原网页要求",
      htmlContent: "<h1>新版</h1>",
      result: "<h1>新版</h1>",
    });
    expect(resultIsStale(editor, "shape:next")).toBe(true);
  });
  it("preserves a dirty draft when the saved output changed elsewhere, and rejects locked edits", () => {
    const editor = board();
    node(editor, "shape:text", "ai-text", { text: "其他窗口的修改" });
    expect(() =>
      saveResultEdit(editor, "shape:text", "旧正文", "我的草稿"),
    ).toThrow("草稿已保留");
    expect(resultText(editor.getShape("shape:text"))).toBe("其他窗口的修改");
    editor.updateShape({ id: "shape:text", props: { isLocked: true } });
    expect(() =>
      saveResultEdit(editor, "shape:text", "其他窗口的修改", "改动"),
    ).toThrow("解锁");
  });
  it("allows intentionally clearing output without resurrecting the creation prompt", () => {
    const editor = board();
    node(editor, "shape:task", "instruction", {
      text: "生成要求",
      result: "正文",
    });
    saveResultEdit(editor, "shape:task", "正文", "");
    expect(resultText(editor.getShape("shape:task"))).toBe("");
  });
  it.each(["instruction", "ai-image", "website"] as const)(
    "creates a %s revision without altering its source, and undoes the branch atomically",
    (type) => {
      const editor = board();
      node(editor, "shape:source", "website", {
        htmlContent: "<h1>亲手修改的页面</h1>",
        text: "旧要求",
      });
      const original = structuredClone(editor.getShape("shape:source"));
      const id = createResultRevision(editor, "shape:source", type, "新的要求");
      expect(editor.getShape("shape:source")).toEqual(original);
      expect(
        connectedShapes(editor, id, "previous").map((shape) => shape.id),
      ).toEqual(["shape:source"]);
      expect(previousRevision(editor, editor.getShape(id))?.id).toBe(
        "shape:source",
      );
      editor.undo();
      expect(editor.getShape(id)).toBeUndefined();
      expect(connectedShapes(editor, "shape:source", "next")).toHaveLength(0);
    },
  );
  it("keeps image edits as a new local picture and remembers the original across reloads", () => {
    const editor = board();
    node(editor, "shape:image", "ai-image", {
      src: "/api/assets/original",
      text: "原图要求",
      imageSize: "4:3",
    });
    const id = createImageRevision(
      editor,
      "shape:image",
      "/api/assets/cropped",
      600,
      800,
    );
    expect(editor.getShape("shape:image").props.src).toBe(
      "/api/assets/original",
    );
    expect(editor.getShape(id).props).toMatchObject({
      src: "/api/assets/cropped",
      isUploaded: true,
      text: "",
      imageSize: "3:4",
    });
    const restored = board();
    loadSnapshot(restored.store, getSnapshot(editor.store));
    expect(previousRevision(restored, restored.getShape(id))?.id).toBe(
      "shape:image",
    );
    expect(
      editor.getShape(
        createResultRevision(editor, "shape:image", "ai-image", "调整光线"),
      ).props.imageSize,
    ).toBe("4:3");
  });
  it("points a generated text result back to the original version", () => {
    const editor = board();
    node(editor, "shape:source", "ai-text", { text: "原作" });
    const id = createResultRevision(
      editor,
      "shape:source",
      "instruction",
      "改写",
    );
    node(editor, "shape:output", "ai-text", { result: "改写后的作品" });
    connectShapes(editor, id, "shape:output");
    expect(completedRevision(editor, id)).toBe("shape:output");
    expect(previousRevision(editor, editor.getShape("shape:output"))?.id).toBe(
      "shape:source",
    );
    expect(
      resultVersions(editor, editor.getShape("shape:source")).map(
        (shape) => shape.id,
      ),
    ).toEqual(["shape:source", "shape:output"]);
  });
  it("restores only editing content, keeps drafts scoped to project and card, and defaults the output type to the current medium", () => {
    const editor = board();
    node(editor, "shape:web", "website", { htmlContent: "<p>正文</p>" });
    const draft = readResultDraft(
      JSON.stringify({
        version: 1,
        base: "<p>正文</p>",
        content: "<p>修改</p>",
        prompt: "继续修改",
        type: "website",
        apiKey: "not-retained",
        endpoint: "not-retained",
      }),
      editor.getShape("shape:web"),
    );
    expect(draft).toEqual({
      base: "<p>正文</p>",
      content: "<p>修改</p>",
      prompt: "继续修改",
      type: "website",
    });
    expect(readResultDraft("broken", editor.getShape("shape:web")).type).toBe(
      "website",
    );
    expect(resultDraftKey("a", "page", "1")).not.toBe(
      resultDraftKey("b", "page", "1"),
    );
    expect(resultDraftKey("a", "page", "1")).not.toBe(
      resultDraftKey("a", "page", "2"),
    );
    expect(imageRatio(1200, 800)).toBe("3:2");
  });
});
