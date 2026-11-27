import { describe, expect, it } from "vite-plus/test";
import { Editor } from "@/features/canvas/engine/editor";
import { createCanvasStore } from "@/features/canvas/engine/store";
import { componentAtDropPoint } from "./image-drop";

describe("component image drop targeting", () => {
  it("hits the same component at overview zoom even when its DOM content is inert", () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:image",
      type: "ai-image",
      x: 200,
      y: 100,
      props: { w: 400, h: 300 },
    });
    editor.setViewport({ x: 40, y: 20, zoom: 0.4 });
    expect(componentAtDropPoint(editor, { x: 200, y: 100 })?.id).toBe(
      "shape:image",
    );
    expect(componentAtDropPoint(editor, { x: 320, y: 200 })).toBeUndefined();
  });
  it("respects rotation and returns a locked or incompatible top component instead of dropping behind it", () => {
    const editor = new Editor(createCanvasStore());
    editor.setViewport({ x: 0, y: 0, zoom: 1 });
    editor.createShape({
      id: "shape:image",
      type: "ai-image",
      x: 100,
      y: 100,
      props: { w: 400, h: 300 },
    });
    editor.createShape({
      id: "shape:text",
      index: "z1",
      type: "ai-text",
      x: 300,
      y: 100,
      rotation: Math.PI / 2,
      props: { w: 100, h: 100, isLocked: true },
    });
    expect(componentAtDropPoint(editor, { x: 250, y: 150 })?.id).toBe(
      "shape:text",
    );
    expect(componentAtDropPoint(editor, { x: 350, y: 150 })?.id).toBe(
      "shape:image",
    );
  });
});
