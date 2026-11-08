import { describe, expect, it } from "vite-plus/test";
import { Editor, createCanvasStore } from "@/features/canvas/editor";
import { connectShapes } from "@/features/canvas/connection-parser";
import { generationFingerprint, resultIsStale } from "./freshness";

function board() {
  const editor = new Editor(createCanvasStore());
  for (const [id, type, text] of [
    ["source", "ai-text", "原始素材"],
    ["task", "instruction", "整理素材"],
    ["output", "ai-text", ""],
    ["other", "instruction", "独立创作"],
  ]) {
    editor.createShape({
      id: `shape:${id}`,
      type,
      props: {
        w: 320,
        h: 160,
        text,
        result: type === "instruction" ? "已完成" : "",
      },
    });
  }
  connectShapes(editor, "shape:source", "shape:task");
  connectShapes(editor, "shape:task", "shape:output");
  for (const id of ["task", "output", "other"]) stamp(editor, `shape:${id}`);
  return editor;
}
function stamp(editor: Editor, id: string) {
  editor.updateShape({
    id,
    props: {
      generation: {
        fingerprint: generationFingerprint(editor, id),
        durationMs: 1200,
        completedAt: Date.now(),
      },
    },
  });
}
describe("generated result freshness", () => {
  it("marks only the affected branch when its material changes and ignores card movement", () => {
    const editor = board();
    editor.updateShape({ id: "shape:source", x: 200, y: 300 });
    expect(resultIsStale(editor, "shape:task")).toBe(false);
    editor.updateShape({ id: "shape:source", props: { text: "新的素材" } });
    expect(resultIsStale(editor, "shape:task")).toBe(true);
    expect(resultIsStale(editor, "shape:output")).toBe(true);
    expect(resultIsStale(editor, "shape:other")).toBe(false);
  });
  it("does not let a freshly stamped descendant hide an outdated parent result", () => {
    const editor = board();
    editor.updateShape({ id: "shape:source", props: { text: "运行期间改动" } });
    stamp(editor, "shape:output");
    expect(resultIsStale(editor, "shape:output")).toBe(true);
  });
  it("reuses a locked cached result without making downstream work depend on later upstream edits", () => {
    const editor = board();
    editor.updateShape({ id: "shape:task", props: { isLocked: true } });
    stamp(editor, "shape:output");
    editor.updateShape({ id: "shape:source", props: { text: "下一轮的素材" } });
    expect(resultIsStale(editor, "shape:task")).toBe(true);
    expect(resultIsStale(editor, "shape:output")).toBe(false);
  });
  it("includes layout changes inside a frame used as visual material", () => {
    const editor = board();
    editor.createShape({
      id: "shape:frame",
      type: "frame",
      props: { w: 500, h: 300 },
    });
    editor.createShape({
      id: "shape:visual",
      type: "geo",
      parentId: "shape:frame",
      props: { w: 100, h: 50, text: "按钮" },
    });
    connectShapes(editor, "shape:frame", "shape:task");
    stamp(editor, "shape:task");
    editor.updateShape({ id: "shape:visual", x: 100 });
    expect(resultIsStale(editor, "shape:task")).toBe(true);
  });
  it("does not mutate legacy documents while reading status", () => {
    const editor = board();
    const version = editor.getVersion();
    expect(resultIsStale(editor, "shape:source")).toBe(false);
    expect(resultIsStale(editor, "shape:missing")).toBe(false);
    expect(editor.getVersion()).toBe(version);
  });
});
