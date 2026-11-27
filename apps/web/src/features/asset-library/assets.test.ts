import { describe, expect, it } from "vite-plus/test";
import { Editor, createCanvasStore } from "@/features/canvas/editor";
import { sceneFromEditor } from "@/features/canvas/excalidraw/scene";
import {
  assetMasonryColumns,
  insertLibraryImage,
  applyLibraryImage,
  type LibraryAsset,
} from "./assets";
import { collectDownloadableFiles } from "@/features/canvas/file-collector";
import { resultSource } from "@/workflow/results";
import {
  connectShapes,
  getPreviousConnectedShapes,
} from "@/features/canvas/connection-parser";

const asset: LibraryAsset = {
  id: "local-image",
  name: "海边.png",
  mime: "image/png",
  size: 420,
  width: 1600,
  height: 800,
  folder_id: null,
  trashed: false,
  created_at: "2026-11-02T00:00:00Z",
};

describe("library image insertion", () => {
  it("creates a native image at the release point without distorting the source", () => {
    const editor = new Editor(createCanvasStore());
    editor.setViewport({ x: 120, y: -90, zoom: 1.5 });
    const id = insertLibraryImage(editor, asset, { x: 250, y: 140 });
    const image = editor.getShape(id)!;
    expect(image.type).toBe("image");
    expect(image.x + image.props.w / 2).toBe(250);
    expect(image.y + image.props.h / 2).toBe(140);
    expect(image.props.w / image.props.h).toBe(2);
    expect(editor.getSelectedShapeIds()).toEqual([id]);
    const source = editor.store.get(image.props.assetId)!;
    expect(source.props).toMatchObject({
      src: "/api/assets/local-image",
      name: "海边.png",
      w: 1600,
      h: 800,
    });
    expect(
      sceneFromEditor(editor).find((element) => element.id === id)?.type,
    ).toBe("image");
  });
  it("fits click-inserted images into the viewport and keeps each use independent", () => {
    const editor = new Editor(createCanvasStore());
    editor.setViewport({ x: 0, y: 0, zoom: 3 });
    const id = insertLibraryImage(editor, {
      ...asset,
      width: 1200,
      height: 3600,
    });
    const bounds = editor.getShapePageBounds(id)!;
    const viewport = editor.getViewportPageBounds();
    expect(bounds.w).toBeLessThan(viewport.w);
    expect(bounds.h).toBeLessThan(viewport.h);
    expect(bounds.center.x).toBeCloseTo(viewport.center.x);
    expect(bounds.center.y).toBeCloseTo(viewport.center.y);
    const other = insertLibraryImage(editor, {
      ...asset,
      name: "新的名称.png",
    });
    expect(editor.getShape(other)!.props.assetId).not.toBe(
      editor.getShape(id)!.props.assetId,
    );
    expect(
      editor.store.allRecords().filter((record) => record.typeName === "asset"),
    ).toHaveLength(2);
    expect(
      editor.store.get(editor.getShape(id)!.props.assetId)!.props.name,
    ).toBe(asset.name);
    editor.undo();
    expect(editor.getShape(other)).toBeUndefined();
    expect(editor.getShape(id)).toBeDefined();
  });
  it("replaces a component image without adding a shape or changing its request, layout or connections, and can undo", () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:target",
      type: "ai-image",
      x: 120,
      y: 80,
      props: {
        w: 360,
        h: 240,
        src: "/api/assets/original",
        text: "保留创作要求",
        name: "原图",
      },
    });
    editor.createShape({
      id: "shape:next",
      type: "instruction",
      props: { w: 300, h: 200 },
    });
    connectShapes(editor, "shape:target", "shape:next");
    const count = editor.getCurrentPageShapes().length;
    applyLibraryImage(editor, "shape:target", asset);
    expect(editor.getCurrentPageShapes()).toHaveLength(count);
    expect(editor.getShape("shape:target")).toMatchObject({
      x: 120,
      y: 80,
      props: {
        src: "/api/assets/local-image",
        text: "保留创作要求",
        w: 360,
        h: 240,
        isUploaded: true,
      },
    });
    expect(
      getPreviousConnectedShapes(editor, "shape:next").map((shape) => shape.id),
    ).toContain("shape:target");
    editor.undo();
    expect(editor.getShape("shape:target")!.props.src).toBe(
      "/api/assets/original",
    );
  });
  it("rejects a missing, incompatible or locked target instead of inserting elsewhere", () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:locked",
      type: "ai-image",
      props: { w: 360, h: 240, isLocked: true, src: "old" },
    });
    editor.createShape({
      id: "shape:text",
      type: "ai-text",
      props: { w: 360, h: 240 },
    });
    for (const id of ["shape:locked", "shape:text", "shape:missing"])
      expect(() => applyLibraryImage(editor, id, asset)).toThrow();
    expect(editor.getCurrentPageShapes()).toHaveLength(2);
    expect(editor.getShape("shape:locked")!.props.src).toBe("old");
  });
  it("includes native canvas images in project attachments with their original filenames", () => {
    const editor = new Editor(createCanvasStore());
    const id = insertLibraryImage(editor, asset);
    expect(collectDownloadableFiles(editor)).toMatchObject([
      {
        shapeId: id,
        fileName: asset.name,
        source: "image",
        downloadUrl: "/api/assets/local-image",
      },
    ]);
  });
  it("replaces a native image's direct URL and restores the previous image on undo", () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:native",
      type: "image",
      props: {
        w: 200,
        h: 200,
        src: "/api/assets/original",
        name: "original.png",
      },
    });
    applyLibraryImage(editor, "shape:native", asset);
    expect(resultSource(editor, editor.getShape("shape:native")!)).toBe(
      "/api/assets/local-image",
    );
    expect(collectDownloadableFiles(editor)[0].fileName).toBe(asset.name);
    editor.undo();
    expect(resultSource(editor, editor.getShape("shape:native")!)).toBe(
      "/api/assets/original",
    );
  });
  it("balances the insertion gallery by image proportions and includes every image once", () => {
    const images = [
      { ...asset, id: "portrait", width: 100, height: 300 },
      { ...asset, id: "landscape", width: 300, height: 100 },
      { ...asset, id: "square", width: 100, height: 100 },
      { ...asset, id: "panorama", width: 400, height: 100 },
      { ...asset, id: "poster", width: 100, height: 200 },
    ];
    const columns = assetMasonryColumns(images, 3);
    expect(columns.map((column) => column.map(({ id }) => id))).toEqual([
      ["portrait"],
      ["landscape", "panorama", "poster"],
      ["square"],
    ]);
    expect(new Set(columns.flat().map(({ id }) => id)).size).toBe(
      images.length,
    );
    expect(assetMasonryColumns([], 3)).toEqual([[], [], []]);
  });
});
