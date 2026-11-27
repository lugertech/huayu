import { describe, expect, it, vi } from "vite-plus/test";
import { Editor, loadSnapshot } from "./editor";
import { CanvasStore } from "./store";
import { richText, plainText } from "./model";

function canvas() {
  const store = new CanvasStore();
  const editor = new Editor(store);
  return { store, editor };
}
describe("application canvas compatibility and editing", () => {
  it("captures a detached camera and selection without enumerating document records", () => {
    const { store, editor } = canvas();
    editor.createShape({ id: "shape:a", type: "geo" });
    editor.select("shape:a");
    const serialize = vi.spyOn(store, "serialize");
    const view = store.getSessionSnapshot();
    expect(serialize).not.toHaveBeenCalled();
    editor.select();
    expect(view.selectedShapeIds).toEqual(["shape:a"]);
    view.camera.x += 1;
    expect(view.camera.x).not.toBe(editor.session.camera.x);
  });
  it("includes a curved arrow in its bounds for selection and export", () => {
    const { editor } = canvas();
    editor.createShape({
      id: "shape:curve",
      type: "arrow",
      x: 10,
      y: 20,
      props: { start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, bend: 140 },
    });
    const bounds = editor.getShapePageBounds("shape:curve")!;
    expect(bounds.maxY).toBeGreaterThanOrEqual(160);
    expect(bounds.minY).toBe(20);
  });
  it("rolls back a failed command before emitting or saving any records", () => {
    const { store, editor } = canvas();
    let writes = 0;
    store.listen(() => writes++, { source: "user", scope: "document" });
    expect(() =>
      editor.run(() => {
        editor.createShape({ id: "shape:first", type: "geo" });
        editor.createBinding({
          fromId: "shape:first",
          toId: "shape:missing",
          props: { terminal: "end", normalizedAnchor: { x: 0, y: 0 } },
        });
      }),
    ).toThrow();
    expect(editor.getCurrentPageShapes()).toHaveLength(0);
    expect(writes).toBe(0);
    expect(store.canUndo).toBe(false);
  });
  it("reads legacy records, hierarchy, rich text and arrow terminals without an SDK", () => {
    const { store, editor } = canvas();
    loadSnapshot(store, {
      document: {
        schema: { schemaVersion: 2, sequences: { "com.tldraw.shape.geo": 5 } },
        store: {
          "page:legacy": {
            id: "page:legacy",
            typeName: "page",
            name: "旧画布",
            index: "a1",
          },
          "shape:frame": {
            id: "shape:frame",
            typeName: "shape",
            type: "frame",
            x: 100,
            y: 200,
            rotation: 0,
            parentId: "page:legacy",
            props: { w: 600, h: 400 },
          },
          "shape:left": {
            id: "shape:left",
            typeName: "shape",
            type: "geo",
            x: 20,
            y: 30,
            rotation: 0,
            parentId: "shape:frame",
            props: { w: 120, h: 80, richText: richText("中文旧内容") },
          },
          "shape:right": {
            id: "shape:right",
            typeName: "shape",
            type: "ai-text",
            x: 500,
            y: 230,
            parentId: "page:legacy",
            props: { w: 200, h: 100, text: "材料" },
          },
          "shape:arrow": {
            id: "shape:arrow",
            typeName: "shape",
            type: "arrow",
            x: 0,
            y: 0,
            parentId: "page:legacy",
            props: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
          },
          "binding:start": {
            id: "binding:start",
            typeName: "binding",
            type: "arrow",
            fromId: "shape:arrow",
            toId: "shape:left",
            props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 } },
          },
          "binding:end": {
            id: "binding:end",
            typeName: "binding",
            type: "arrow",
            fromId: "shape:arrow",
            toId: "shape:right",
            props: { terminal: "end", normalizedAnchor: { x: 0, y: 0.5 } },
          },
        } as any,
      },
    });
    expect(editor.getCurrentPageShapes()).toHaveLength(4);
    expect(plainText(editor.getShape("shape:left")!.props.richText)).toBe(
      "中文旧内容",
    );
    expect(editor.getShapePageBounds("shape:left")?.point).toEqual({
      x: 120,
      y: 230,
    });
    expect(editor.arrowPoints(editor.getShape("shape:arrow")!)).toEqual({
      start: { x: 240, y: 270 },
      end: { x: 500, y: 280 },
    });
    editor.updateShape({ id: "shape:right", x: 600 });
    expect(editor.arrowPoints(editor.getShape("shape:arrow")!).end.x).toBe(600);
    expect(store.getDocumentSnapshot().schema).toEqual({
      schemaVersion: 2,
      sequences: { "com.tldraw.shape.geo": 5 },
    });
  });
  it("duplicates complete subgraphs and remaps their internal bindings", () => {
    const { editor } = canvas();
    editor.run(() => {
      editor.createShape({
        id: "shape:a",
        type: "ai-text",
        x: 10,
        y: 20,
        props: { text: "a" },
      });
      editor.createShape({ id: "shape:b", type: "instruction", x: 400, y: 20 });
      editor.createShape({ id: "shape:arrow", type: "arrow" });
      editor.createBindings([
        {
          fromId: "shape:arrow",
          toId: "shape:a",
          props: { terminal: "start", normalizedAnchor: { x: 1, y: 0.5 } },
        },
        {
          fromId: "shape:arrow",
          toId: "shape:b",
          props: { terminal: "end", normalizedAnchor: { x: 0, y: 0.5 } },
        },
      ]);
    });
    const copies = editor.duplicateShapes([
      "shape:a",
      "shape:b",
      "shape:arrow",
    ]);
    const arrow = editor.getShape(copies[2])!;
    expect(
      editor
        .getBindingsFromShape(arrow.id)
        .map((binding) => binding.toId)
        .sort(),
    ).toEqual(copies.slice(0, 2).sort());
    expect(editor.getShape(copies[0])!.x).toBe(42);
    editor.deleteShape(copies[0]);
    expect(editor.getShape(copies[2])).toBeUndefined();
    expect(editor.getShape("shape:arrow")).toBeDefined();
  });
  it("undoes one gesture and synchronizes it while preserving foreign records", () => {
    const { store, editor } = canvas();
    editor.createShape({ id: "shape:a", type: "geo", x: 0, y: 0 });
    store.endHistoryGroup();
    store.beginHistoryGroup();
    editor.updateShape({ id: "shape:a", x: 30 });
    editor.updateShape({ id: "shape:a", x: 80 });
    store.endHistoryGroup();
    store.mergeRemoteChanges(() =>
      store.put([
        {
          id: "shape:remote",
          typeName: "shape",
          type: "geo",
          x: 100,
          y: 0,
          props: { w: 80, h: 80 },
        } as any,
      ]),
    );
    let updates = 0;
    store.listen(() => updates++, { source: "user", scope: "document" });
    editor.undo();
    expect(editor.getShape("shape:a")!.x).toBe(0);
    expect(editor.getShape("shape:remote")).toBeDefined();
    expect(updates).toBe(1);
    editor.redo();
    expect(editor.getShape("shape:a")!.x).toBe(80);
    expect(editor.getShape("shape:remote")).toBeDefined();
  });
  it("does not undo a newer remote edit to the same record", () => {
    const { store, editor } = canvas();
    editor.createShape({ id: "shape:a", type: "geo" });
    store.endHistoryGroup();
    editor.updateShape({ id: "shape:a", x: 30 });
    store.mergeRemoteChanges(() =>
      store.put([{ ...editor.getShape("shape:a")!, x: 90 }]),
    );
    editor.undo();
    expect(editor.getShape("shape:a")!.x).toBe(90);
  });
  it("preserves world positions during grouping and reparenting", () => {
    const { editor } = canvas();
    editor.createShape({ id: "shape:a", type: "geo", x: 100, y: 120 });
    editor.createShape({ id: "shape:b", type: "geo", x: 300, y: 200 });
    const group = editor.groupShapes(["shape:a", "shape:b"])!;
    expect(editor.getShapePageBounds("shape:a")?.point).toEqual({
      x: 100,
      y: 120,
    });
    editor.updateShape({ id: group, x: 150, y: 170 });
    expect(editor.getShapePageBounds("shape:a")?.point).toEqual({
      x: 150,
      y: 170,
    });
    editor.ungroupShapes([group]);
    expect(editor.getShape("shape:a")!.parentId).toBe(
      editor.getCurrentPageId(),
    );
    expect(editor.getShapePageBounds("shape:a")?.point).toEqual({
      x: 150,
      y: 170,
    });
  });
  it("separates page contents and restores legacy page camera state", () => {
    const { store, editor } = canvas();
    editor.createShape({ id: "shape:a", type: "geo" });
    const first = editor.getCurrentPageId();
    const second = editor.createPage("第二页");
    editor.createShape({ id: "shape:b", type: "note" });
    expect([...editor.getCurrentPageShapeIds()]).toEqual(["shape:b"]);
    editor.setCurrentPage(first);
    expect([...editor.getCurrentPageShapeIds()]).toEqual(["shape:a"]);
    loadSnapshot(store, {
      session: {
        currentPageId: second,
        pageStates: [
          {
            pageId: second,
            camera: { x: -50, y: 80, z: 0.5 },
            selectedShapeIds: ["shape:b"],
          },
        ],
      },
    });
    expect(editor.viewport).toEqual({ x: -25, y: 40, zoom: 0.5 });
    expect(editor.getSelectedShapeIds()).toEqual(["shape:b"]);
    expect(
      Object.values(store.getDocumentSnapshot().store).some(
        (record) => "camera" in record,
      ),
    ).toBe(false);
  });
  it("rejects invalid project records before changing the store", () => {
    const { store } = canvas();
    const before = store.getDocumentSnapshot();
    expect(() =>
      loadSnapshot(store, {
        document: {
          schema: {},
          store: {
            ...before.store,
            "shape:bad": {
              id: "shape:bad",
              typeName: "shape",
              type: "geo",
              x: Infinity,
              props: { w: 100, h: 100 },
            } as any,
          },
        },
      }),
    ).toThrow();
    expect(store.getDocumentSnapshot()).toEqual(before);
  });
});
