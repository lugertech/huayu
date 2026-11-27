import { describe, expect, it } from "vite-plus/test";
import {
  Bounds,
  Editor,
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
} from "./editor";
import { mergeCanvasPages } from "./single-canvas";
import {
  connectShapes,
  connectedShapes,
} from "@/features/canvas/connection-parser";
import { generationFingerprint, resultIsStale } from "@/workflow/freshness";
import { sceneFromEditor } from "./excalidraw/scene";

describe("single-canvas legacy projects", () => {
  it("leaves a single canvas completely unchanged", () => {
    const store = createCanvasStore();
    const editor = new Editor(store);
    editor.createShape({ type: "ai-text", props: { text: "保留原文" } });
    const before = getSnapshot(store);
    const version = store.getVersion();
    expect(mergeCanvasPages(store)).toBeUndefined();
    expect(getSnapshot(store)).toEqual(before);
    expect(store.getVersion()).toBe(version);
  });

  it("keeps rotated hierarchy, attachments, connections and IDs while separating former pages", () => {
    const store = createCanvasStore();
    const editor = new Editor(store);
    const firstPage = editor.getCurrentPageId();
    editor.createShape({
      id: "shape:first",
      type: "ai-text",
      x: 100,
      y: 40,
      props: { w: 320, h: 220, text: "第一份材料" },
    });
    const first = structuredClone(editor.getShape("shape:first"));
    const secondPage = editor.createPage("研究材料");
    editor.store.put([
      {
        id: "asset:local",
        typeName: "asset",
        props: { src: "/api/assets/example", mimeType: "image/png" },
      },
    ]);
    editor.createShape({
      id: "shape:frame",
      type: "frame",
      x: 200,
      y: -100,
      rotation: Math.PI / 12,
      props: { w: 600, h: 400, name: "素材" },
    });
    editor.createShape({
      id: "shape:image",
      type: "image",
      parentId: "shape:frame",
      x: 40,
      y: 50,
      rotation: Math.PI / 8,
      props: { w: 180, h: 120, assetId: "asset:local" },
    });
    editor.createShape({
      id: "shape:task",
      type: "instruction",
      x: 920,
      y: 80,
      props: { text: "整理材料", w: 340, h: 260 },
    });
    connectShapes(editor, "shape:image", "shape:task");
    const image = structuredClone(editor.getShape("shape:image")!);
    const origin = editor.getPageTransform(image);
    const target = editor.getPageTransform(editor.getShape("shape:task")!);
    const bindings = store.allRecords().filter((r) => r.typeName === "binding");
    const ids = editor.getCurrentPageShapes().map((shape) => shape.id);
    const snapshot = store.getDocumentSnapshot();

    const changes = mergeCanvasPages(store)!;
    expect(changes.remove).toEqual([secondPage]);
    expect(editor.pages.map((page) => page.id)).toEqual([firstPage]);
    expect(editor.getShape("shape:first")).toEqual(first);
    expect(editor.getShape("shape:image")!.parentId).toBe("shape:frame");
    expect(editor.getShape("shape:image")!.props).toEqual(image.props);
    expect(store.get("asset:local")).toEqual(snapshot.store["asset:local"]);
    expect(store.allRecords().filter((r) => r.typeName === "binding")).toEqual(
      bindings,
    );
    expect(
      connectedShapes(editor, "shape:task", "previous").map((s) => s.id),
    ).toEqual(["shape:image"]);
    for (const id of ids) expect(editor.pageOf(id)).toBe(firstPage);
    const moved = editor.getPageTransform(editor.getShape(image.id)!);
    const movedTarget = editor.getPageTransform(editor.getShape("shape:task")!);
    expect(moved.rotation).toBe(origin.rotation);
    expect(movedTarget.x - target.x).toBeCloseTo(moved.x - origin.x);
    expect(movedTarget.y - target.y).toBeCloseTo(moved.y - origin.y);
    const area = Bounds.union(ids.map((id) => editor.getShapePageBounds(id)!));
    expect(area.x).toBeGreaterThan(
      editor.getShapePageBounds("shape:first")!.maxX,
    );
    expect(
      editor.getCurrentPageShapes().find((s) => s.type === "text")!.props.text,
    ).toBe("研究材料");
    const native = sceneFromEditor(editor);
    expect(native.find((element) => element.id === image.id)!.frameId).toBe(
      "shape:frame",
    );

    const another = createCanvasStore();
    loadSnapshot(another, { document: snapshot });
    mergeCanvasPages(another);
    expect(another.getDocumentSnapshot()).toEqual(store.getDocumentSnapshot());
    const merged = store.getDocumentSnapshot();
    expect(mergeCanvasPages(store)).toBeUndefined();
    expect(store.getDocumentSnapshot()).toEqual(merged);
  });

  it("keeps completed visual workflows fresh without clearing genuinely stale results", () => {
    const store = createCanvasStore();
    const editor = new Editor(store);
    editor.createShape({ type: "ai-text", props: { text: "其他内容" } });
    editor.createPage("图形创作");
    editor.createShape({
      id: "shape:source",
      type: "geo",
      x: 240,
      y: 120,
      props: { w: 120, h: 80, text: "素材" },
    });
    for (const id of ["shape:fresh", "shape:stale"]) {
      editor.createShape({
        id,
        type: "instruction",
        x: 500,
        props: { text: "说明这幅图", result: "已完成的内容" },
      });
      connectShapes(editor, "shape:source", id);
      editor.updateShape({
        id,
        props: {
          generation: {
            fingerprint: generationFingerprint(editor, id),
            completedAt: 1234,
            durationMs: 500,
          },
        },
      });
    }
    editor.updateShape({ id: "shape:stale", props: { text: "补充新的要求" } });
    const stale = structuredClone(
      editor.getShape("shape:stale")!.props.generation,
    );
    expect(resultIsStale(editor, "shape:fresh")).toBe(false);
    expect(resultIsStale(editor, "shape:stale")).toBe(true);
    mergeCanvasPages(store);
    expect(resultIsStale(editor, "shape:fresh")).toBe(false);
    expect(resultIsStale(editor, "shape:stale")).toBe(true);
    expect(editor.getShape("shape:stale")!.props.generation).toEqual(stale);
    expect(editor.getShape("shape:fresh")!.props.generation).toMatchObject({
      completedAt: 1234,
      durationMs: 500,
    });
  });

  it("keeps content in place when the first legacy page is empty", () => {
    const store = createCanvasStore();
    const editor = new Editor(store);
    const first = editor.getCurrentPageId();
    editor.createPage("草稿");
    editor.createShape({ id: "shape:only", type: "ai-text", x: -400, y: -200 });
    editor.createPage("空白页");
    mergeCanvasPages(store);
    expect(editor.pages).toHaveLength(1);
    expect(editor.getCurrentPageId()).toBe(first);
    expect(editor.getShape("shape:only")).toMatchObject({
      x: -400,
      y: -200,
      parentId: first,
    });
    expect(editor.getCurrentPageShapes()).toHaveLength(2);
  });
});
