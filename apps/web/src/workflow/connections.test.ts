import { describe, expect, it } from "vite-plus/test";
import { Editor, createCanvasStore } from "@/canvas/editor";
import { applyNativeScene, sceneFromEditor } from "@/canvas/excalidraw/scene";
import {
  connectedShapes,
  createConnectedComponent,
} from "@/utils/connectionParser";
import {
  connectionPort,
  connectionProblem,
  connectionTarget,
  linkWorkflow,
} from "./connections";

function board() {
  const editor = new Editor(createCanvasStore());
  [
    {
      id: "shape:source",
      type: "ai-text",
      props: { w: 320, h: 160, text: "素材" },
    },
    {
      id: "shape:task",
      type: "instruction",
      x: 480,
      props: { w: 320, h: 160, text: "整理" },
    },
    {
      id: "shape:next",
      type: "instruction",
      x: 960,
      props: { w: 320, h: 160 },
    },
  ].forEach((shape) => editor.createShape(shape));
  return editor;
}
describe("workflow connection gestures", () => {
  it("allows a manual run gate but rejects embedded pages and drawing boxes as processing targets", () => {
    const editor = board();
    for (const type of ["start", "interactive-web", "ai-draw"]) {
      editor.createShape({
        id: `shape:${type}`,
        type,
        x: 1400,
        props: { w: 300, h: 200 },
      });
    }
    expect(connectionProblem(editor, "shape:source", "shape:start")).toBeNull();
    expect(linkWorkflow(editor, "shape:source", "shape:start")).toBeDefined();
    for (const type of ["interactive-web", "ai-draw"]) {
      expect(
        connectionProblem(editor, "shape:source", `shape:${type}`),
      ).not.toBeNull();
    }
  });
  it("creates an unlabelled connection and removes the arrow and both bindings in one undo", () => {
    const editor = board();
    const id = linkWorkflow(editor, "shape:source", "shape:task")!;
    expect(editor.getShape(id).props.text).toBe("");
    expect(editor.getShape(id).props).toMatchObject({
      color: "black",
      size: "m",
      arrowheadStart: "none",
      arrowheadEnd: "triangle",
    });
    expect(
      sceneFromEditor(editor).find((element) => element.id === id),
    ).toMatchObject({
      strokeColor: "#000000",
      strokeWidth: 2,
      endArrowhead: "triangle",
    });
    expect(editor.getBindingsFromShape(id, "arrow")).toHaveLength(2);
    expect(
      connectedShapes(editor, "shape:task", "previous").map(
        (shape) => shape.id,
      ),
    ).toEqual(["shape:source"]);
    editor.undo();
    expect(editor.getShape(id)).toBeUndefined();
    expect(editor.getBindingsToShape("shape:task", "arrow")).toHaveLength(0);
    expect(editor.getShape("shape:source").props.text).toBe("素材");
    editor.redo();
    expect(editor.getBindingsFromShape(id, "arrow")).toHaveLength(2);
  });
  it("rejects duplicates, self connections, cycles and missing targets without modifying the board", () => {
    const editor = board();
    linkWorkflow(editor, "shape:source", "shape:task");
    linkWorkflow(editor, "shape:task", "shape:next");
    const version = editor.getVersion();
    expect(connectionProblem(editor, "shape:task", "shape:task")).toContain(
      "另一张",
    );
    expect(() => linkWorkflow(editor, "shape:source", "shape:task")).toThrow(
      "已经连接",
    );
    expect(() => linkWorkflow(editor, "shape:next", "shape:task")).toThrow(
      "循环",
    );
    expect(() => linkWorkflow(editor, "shape:source", "shape:missing")).toThrow(
      "当前页面",
    );
    expect(editor.getVersion()).toBe(version);
    editor.store.put([
      {
        id: "page:other",
        typeName: "page",
        name: "另一页",
        index: "a2",
        meta: {},
      },
    ]);
    editor.updateShape({ id: "shape:next", parentId: "page:other" });
    expect(connectionProblem(editor, "shape:source", "shape:next")).toContain(
      "当前页面",
    );
  });
  it("keeps ports on rotated cards inside a frame and resolves the same card while snapping", () => {
    const editor = board();
    editor.createShape({
      id: "shape:frame",
      type: "frame",
      x: 50,
      y: 80,
      rotation: Math.PI / 6,
      props: { w: 900, h: 700 },
    });
    editor.updateShape({
      id: "shape:task",
      parentId: "shape:frame",
      x: 300,
      y: 150,
      rotation: Math.PI / 4,
    });
    const id = linkWorkflow(editor, "shape:source", "shape:task")!;
    const port = connectionPort(editor, "shape:task", "left");
    expect(editor.arrowPoints(editor.getShape(id)).end.x).toBeCloseTo(port.x);
    expect(editor.arrowPoints(editor.getShape(id)).end.y).toBeCloseTo(port.y);
    expect(
      connectionTarget(editor, "shape:source", "right", port, 12)?.id,
    ).toBe("shape:task");
    applyNativeScene(editor, sceneFromEditor(editor));
    expect(editor.arrowPoints(editor.getShape(id)).end.x).toBeCloseTo(port.x);
    expect(editor.arrowPoints(editor.getShape(id)).end.y).toBeCloseTo(port.y);
    editor.updateShape({ id: "shape:task", x: 400 });
    expect(editor.arrowPoints(editor.getShape(id)).end.x).toBeCloseTo(
      connectionPort(editor, "shape:task", "left").x,
    );
  });
  it("keeps a frame as one material source while its contents and output binding move together", () => {
    const editor = board();
    editor.createShape({
      id: "shape:frame",
      type: "frame",
      x: 50,
      y: 300,
      props: { w: 800, h: 500 },
    });
    editor.createShape({
      id: "shape:child",
      type: "ai-text",
      x: 100,
      y: 350,
      props: { text: "画框内的素材" },
    });
    const id = linkWorkflow(editor, "shape:frame", "shape:task")!;
    expect(editor.getShape(id).props.text).toBe("");
    expect(editor.getShape("shape:child").parentId).toBe("shape:frame");
    applyNativeScene(editor, sceneFromEditor(editor));
    expect(
      connectedShapes(editor, "shape:task", "previous").map(
        (shape) => shape.id,
      ),
    ).toEqual(["shape:frame"]);
    const child = editor.getShapePageBounds("shape:child")!.point;
    const end = editor.arrowPoints(editor.getShape(id)).end;
    editor.updateShape({ id: "shape:frame", x: 170, y: 360 });
    const scene = sceneFromEditor(editor);
    applyNativeScene(editor, scene);
    expect(editor.getShapePageBounds("shape:child")!.point).toEqual({
      x: child.x + 120,
      y: child.y + 60,
    });
    const arrow = editor.arrowPoints(editor.getShape(id));
    expect(arrow.start).toEqual(connectionPort(editor, "shape:frame", "right"));
    expect(arrow.end).toEqual(end);
    expect(
      connectedShapes(editor, "shape:task", "previous").map(
        (shape) => shape.id,
      ),
    ).toEqual(["shape:frame"]);
  });
  it("places a new connected step near the drop without overlapping existing content and undoes it atomically", () => {
    const editor = board();
    const id = createConnectedComponent(
      editor,
      ["shape:source"],
      "instruction",
      "",
      "right",
      { x: 480, y: 0 },
    )!;
    expect(editor.getShapePageBounds(id)!.y).toBeGreaterThan(
      editor.getShapePageBounds("shape:task")!.maxY,
    );
    expect(connectedShapes(editor, id, "previous")[0].id).toBe("shape:source");
    editor.undo();
    expect(editor.getShape(id)).toBeUndefined();
    expect(connectedShapes(editor, "shape:source", "next")).toHaveLength(0);
  });
});
