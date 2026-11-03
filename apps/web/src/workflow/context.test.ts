import { describe, expect, it } from "vite-plus/test";
import { createCanvasStore, Editor } from "@/canvas/editor";
import {
  createConnectedComponent,
  connectedShapes,
} from "@/utils/connectionParser";
import { hasVisibleContent, materialShapes } from "./context";

const board = () => new Editor(createCanvasStore());
describe("contextual creation", () => {
  it("combines materials into one step without changing their content and undoes the step atomically", () => {
    const editor = board();
    editor.createShape({
      id: "shape:a",
      type: "ai-text",
      props: { text: "第一份素材" },
    });
    editor.createShape({
      id: "shape:b",
      type: "instruction",
      y: 300,
      props: { text: "旧的要求", result: "已经确认的作品" },
    });
    const before = JSON.stringify(editor.getShape("shape:b"));
    const id = createConnectedComponent(
      editor,
      ["shape:a", "shape:b", "shape:a"],
      "instruction",
      "新方向",
    )!;
    expect(
      connectedShapes(editor, id, "previous").map((shape) => shape.id),
    ).toEqual(["shape:a", "shape:b"]);
    expect(JSON.stringify(editor.getShape("shape:b"))).toBe(before);
    editor.undo();
    expect(editor.getShape(id)).toBeUndefined();
    expect(editor.getBindingsToShape("shape:a", "arrow")).toHaveLength(0);
    expect(editor.getShape("shape:a")).toBeDefined();
    expect(editor.getShape("shape:b")).toBeDefined();
  });
  it("avoids existing cards and creates before nested content using page coordinates", () => {
    const editor = board();
    editor.createShape({
      id: "shape:frame",
      type: "frame",
      x: 900,
      y: 300,
      props: { w: 800, h: 800 },
    });
    editor.createShape({
      id: "shape:source",
      type: "ai-text",
      parentId: "shape:frame",
      x: 100,
      y: 100,
      props: { w: 320, h: 200 },
    });
    editor.createShape({
      id: "shape:obstacle",
      type: "ai-text",
      x: 1400,
      y: 400,
      props: { w: 320, h: 200 },
    });
    const right = createConnectedComponent(
      editor,
      ["shape:source"],
      "instruction",
      "右侧",
    )!;
    expect(editor.getShape(right).y).toBeGreaterThan(600);
    const left = createConnectedComponent(
      editor,
      ["shape:source"],
      "ai-text",
      "输入",
      "left",
    )!;
    expect(editor.getShape(left).x).toBe(600);
    expect(connectedShapes(editor, "shape:source", "previous")[0].id).toBe(
      left,
    );
  });
  it("expands groups, respects selected frames and ignores stale or other-page selections", () => {
    const editor = board();
    editor.createShape({ id: "shape:frame", type: "frame" });
    editor.createShape({
      id: "shape:inside",
      type: "geo",
      parentId: "shape:frame",
    });
    editor.createShape({ id: "shape:group", type: "group" });
    editor.createShape({
      id: "shape:text",
      type: "text",
      parentId: "shape:group",
    });
    editor.createShape({ id: "shape:arrow", type: "arrow" });
    const second = editor.createPage("另一个页面");
    editor.createShape({
      id: "shape:elsewhere",
      type: "ai-text",
      parentId: second,
    });
    editor.setCurrentPage("page:page");
    expect(
      materialShapes(editor, [
        "shape:frame",
        "shape:inside",
        "shape:group",
        "shape:arrow",
        "shape:missing",
        "shape:elsewhere",
      ]).map((shape) => shape.id),
    ).toEqual(["shape:frame", "shape:text"]);
    expect(
      createConnectedComponent(
        editor,
        ["shape:elsewhere"],
        "instruction",
        "无关内容",
      ),
    ).toBeNull();
  });
  it("detects an empty viewport even when its off-screen content remains selected", () => {
    const editor = board();
    editor.createShape({ id: "shape:a", type: "ai-text", x: 50000, y: 50000 });
    editor.select("shape:a");
    expect(hasVisibleContent(editor)).toBe(false);
    editor.zoomToFit();
    expect(hasVisibleContent(editor)).toBe(true);
  });
});
