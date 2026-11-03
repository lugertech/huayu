import { describe, expect, it } from "vite-plus/test";
import { Editor, createCanvasStore } from "@/canvas/editor";
import { sceneFromEditor } from "@/canvas/excalidraw/scene";
import {
  assetMasonryColumns,
  folderRows,
  folderTree,
  insertLibraryImage,
  type LibraryAsset,
} from "./assets";

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
  it("fits click-inserted images into the visible canvas and reuses local file records", () => {
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
    const other = insertLibraryImage(editor, asset);
    expect(editor.getShape(other)!.props.assetId).toBe(
      editor.getShape(id)!.props.assetId,
    );
    expect(
      editor.store.allRecords().filter((record) => record.typeName === "asset"),
    ).toHaveLength(1);
    editor.undo();
    expect(editor.getShape(other)).toBeUndefined();
    expect(editor.getShape(id)).toBeDefined();
  });
  it("keeps nested folder order and depth for browsing and moving materials", () => {
    expect(
      folderRows([
        { id: "child", name: "街景", parent_id: "photos" },
        { id: "photos", name: "照片", parent_id: null },
        { id: "icons", name: "图标", parent_id: null },
      ]).map(({ id, depth }) => [id, depth]),
    ).toEqual([
      ["photos", 0],
      ["child", 1],
      ["icons", 0],
    ]);
  });
  it("builds the folder tree from flat records without losing nested counts", () => {
    const folders = [
      { id: "leaf", name: "海报", parent_id: "child", asset_count: 3 },
      { id: "root", name: "品牌", parent_id: null, asset_count: 1 },
      { id: "child", name: "夏日", parent_id: "root", asset_count: 2 },
    ];
    const tree = folderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0]).toMatchObject({
      id: "leaf",
      asset_count: 3,
      children: [],
    });
    expect(folders[0]).not.toHaveProperty("children");
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
