import { describe, expect, it } from "vite-plus/test";
import { Editor, createCanvasStore, getSnapshot } from "./editor";
import { ComponentDrag, createCanvasShape } from "./component-creation";
import { COMPONENT_CONFIGS, type ComponentType } from "@/config/components";

describe("pointer component creation", () => {
  it("waits for an intentional drag and previews a full card without changing the document", () => {
    const editor = new Editor(createCanvasStore());
    editor.setViewport({ x: 0, y: 0, zoom: 1 });
    editor.setCurrentTool("draw");
    const before = getSnapshot(editor.store);
    const drag = new ComponentDrag(editor, "ai-text", { x: 20, y: 100 });
    drag.move({ x: 24, y: 103 });
    expect(drag.preview).toBeNull();
    drag.move({ x: 400, y: 240 });
    const preview = drag.preview!;
    const card = preview.getCurrentPageShapes()[0];
    expect(card).toMatchObject({
      type: "ai-text",
      x: 240,
      y: 220,
      props: { w: 320, h: 220 },
    });
    drag.move({ x: 530, y: 310 });
    expect(preview.getShape(card.id)).toMatchObject({ x: 370, y: 290 });
    expect(getSnapshot(editor.store)).toEqual(before);
    expect(editor.getCurrentToolId()).toBe("draw");
  });

  it("keeps the pointer over the card header through canvas offsets, pan and zoom", () => {
    const editor = new Editor(createCanvasStore());
    editor.mount({
      container: {
        getBoundingClientRect: () => ({
          left: 100,
          top: 50,
          width: 1000,
          height: 700,
        }),
      } as HTMLElement,
      setViewport: () => {},
    });
    editor.setViewport({ x: 120, y: -80, zoom: 2 });
    const drag = new ComponentDrag(editor, "ai-text", { x: 120, y: 200 });
    drag.move({ x: 700, y: 300 });
    const id = drag.finish({ x: 780, y: 330 }, true)!;
    const shape = editor.getShape(id)!;
    const camera = editor.session.camera;
    expect((shape.x + shape.props.w / 2 + camera.x) * camera.z + 100).toBe(780);
    expect((shape.y + 20 + camera.y) * camera.z + 50).toBe(330);
    expect(editor.getSelectedShapeIds()).toEqual([id]);
  });

  it("commits once at release, including when the final pointer position has not moved before", () => {
    const editor = new Editor(createCanvasStore());
    editor.setViewport({ x: 0, y: 0, zoom: 1 });
    let writes = 0;
    editor.store.listen(() => writes++, { scope: "document" });
    const drag = new ComponentDrag(editor, "instruction", { x: 20, y: 100 });
    drag.move({ x: 400, y: 240 });
    expect(writes).toBe(0);
    const id = drag.finish({ x: 600, y: 360 }, true)!;
    expect(editor.getShape(id)).toMatchObject({ x: 430, y: 340 });
    expect(writes).toBe(1);
    expect(drag.finish({ x: 800, y: 400 }, true)).toBeUndefined();
    expect(editor.getCurrentPageShapes()).toHaveLength(1);
  });

  it("cancels and rejects drops outside the canvas without leaving records or undo steps", () => {
    for (const cancel of [true, false]) {
      const editor = new Editor(createCanvasStore());
      const before = getSnapshot(editor.store);
      const drag = new ComponentDrag(editor, "ai-image", { x: 20, y: 100 });
      drag.move({ x: 400, y: 240 });
      if (cancel) drag.cancel();
      else drag.finish({ x: 20, y: 100 }, false);
      expect(drag.preview).toBeNull();
      expect(drag.finish({ x: 700, y: 300 }, true)).toBeUndefined();
      expect(getSnapshot(editor.store)).toEqual(before);
      expect(editor.store.canUndo).toBe(false);
    }
  });

  it("undoes only the placed component and redoes its final position", () => {
    const editor = new Editor(createCanvasStore());
    const previous = createCanvasShape(editor, "ai-text");
    const drag = new ComponentDrag(editor, "website", { x: 20, y: 100 });
    drag.move({ x: 400, y: 240 });
    const id = drag.finish({ x: 700, y: 400 }, true)!;
    const placed = structuredClone(editor.getShape(id));
    editor.undo();
    expect(editor.getShape(previous)).toBeDefined();
    expect(editor.getShape(id)).toBeUndefined();
    editor.redo();
    expect(editor.getShape(id)).toEqual(placed);
  });

  it("retains defaults for every existing component, including native frames", () => {
    for (const type of Object.keys(COMPONENT_CONFIGS) as ComponentType[]) {
      const editor = new Editor(createCanvasStore());
      editor.theme = "dark";
      const drag = new ComponentDrag(editor, type, { x: 20, y: 100 });
      drag.move({ x: 400, y: 240 });
      expect(drag.preview!.theme).toBe("dark");
      const props = drag.preview!.getCurrentPageShapes()[0].props;
      const id = drag.finish({ x: 600, y: 300 }, true)!;
      expect(editor.getShape(id)!.props).toEqual(props);
    }
  });
});
