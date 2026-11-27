import { describe, expect, it } from "vite-plus/test";
import {
  Editor,
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
} from "@/features/canvas/editor";
import { connectShapes } from "@/features/canvas/connection-parser";
import { imageRatio } from "./image-size";
import { generationFingerprint, resultIsStale } from "./freshness";
import {
  createImageRevision,
  previousRevision,
  readResultDraft,
  resultDraftKey,
  resultText,
  resultVersions,
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
describe("editing generated work", () => {
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
  });
  it("restores text edits from legacy drafts without keeping creation instructions or model settings", () => {
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
    });
    expect(readResultDraft("broken", editor.getShape("shape:web"))).toEqual({
      base: "<p>正文</p>",
      content: "<p>正文</p>",
    });
    expect(
      readResultDraft(
        JSON.stringify({
          version: 1,
          base: "<p>正文</p>",
          content: "<p>编辑</p>",
        }),
        editor.getShape("shape:web"),
      ),
    ).toEqual({ base: "<p>正文</p>", content: "<p>编辑</p>" });
    expect(resultDraftKey("a", "page", "1")).not.toBe(
      resultDraftKey("b", "page", "1"),
    );
    expect(resultDraftKey("a", "page", "1")).not.toBe(
      resultDraftKey("a", "page", "2"),
    );
    expect(imageRatio(1200, 800)).toBe("3:2");
  });
  it("keeps existing versions navigable after reloading their canvas", () => {
    const editor = board();
    node(editor, "shape:original", "ai-text", { text: "原作" });
    node(editor, "shape:version", "ai-text", { text: "已有版本" });
    editor.updateShape({
      id: "shape:version",
      meta: { revisionOf: "shape:original", revisionCreatedAt: 1 },
    });
    const restored = board();
    loadSnapshot(restored.store, getSnapshot(editor.store));
    expect(
      previousRevision(restored, restored.getShape("shape:version"))?.id,
    ).toBe("shape:original");
    expect(
      resultVersions(restored, restored.getShape("shape:version")).map(
        (shape) => shape.id,
      ),
    ).toEqual(["shape:original", "shape:version"]);
  });
});
