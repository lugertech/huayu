import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Editor } from "@/features/canvas/engine/editor";
import { CanvasStore } from "@/features/canvas/engine/store";
import { exportPNG } from "@/features/canvas/engine/export";
import { exportToSvg } from "@excalidraw/excalidraw";
import { exportScene, nativeExporter } from "./export";
import { sceneFromEditor } from "./scene";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

vi.mock("@excalidraw/excalidraw", () => ({
  exportToCanvas: vi.fn(),
  exportToSvg: vi.fn(),
}));
vi.mock("@/features/canvas/engine/export", () => ({ exportPNG: vi.fn() }));
vi.mock("@/api/backend", () => ({
  blobAsDataURL: vi.fn(async () => "data:image/png;base64,c25hcHNob3Q="),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exportPNG).mockResolvedValue({
    blob: new Blob(["snapshot"], { type: "image/png" }),
    width: 640,
    height: 440,
  });
});

describe("native scene export completeness", () => {
  it("passes the selected canvas language into custom card snapshots", async () => {
    const editor = new Editor(new CanvasStore());
    editor.locale = "en";
    editor.createShape({ id: "shape:card", type: "instruction" });
    const before = editor.store.serialize();
    await exportScene(editor, sceneFromEditor(editor), {}, ["shape:card"]);
    expect(exportPNG).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en" }),
      ["shape:card"],
      expect.anything(),
    );
    expect(editor.store.serialize()).toEqual(before);
  });
  it("includes each custom card and native shape while retaining their positions and opacity", async () => {
    const editor = new Editor(new CanvasStore());
    for (const [index, type] of [
      "ai-text",
      "ai-image",
      "instruction",
      "geo",
    ].entries())
      editor.createShape({
        id: `shape:${type}`,
        type,
        x: index * 500,
        y: 70,
        opacity: 0.8,
      });
    const scene = sceneFromEditor(editor);
    const before = editor.store.serialize();
    const output = await exportScene(editor, scene, {}, [
      ...editor.getCurrentPageShapeIds(),
    ]);
    expect(output.elements).toHaveLength(4);
    expect(Object.keys(output.files)).toHaveLength(3);
    expect(
      output.elements.filter((element) => element.type === "image"),
    ).toHaveLength(3);
    expect(
      output.elements.map((element) => [
        element.id,
        element.x,
        element.y,
        element.opacity,
      ]),
    ).toEqual(
      scene.map((element) => [
        element.id,
        element.x,
        element.y,
        element.opacity,
      ]),
    );
    expect(editor.store.serialize()).toEqual(before);
  });

  it("rejects an incomplete image or card snapshot instead of silently dropping it", async () => {
    const editor = new Editor(new CanvasStore());
    editor.createShape({
      id: "shape:image",
      type: "image",
      props: { assetId: "asset:loading" },
    });
    await expect(
      exportScene(editor, sceneFromEditor(editor), {}, ["shape:image"]),
    ).rejects.toThrow("图片仍未读取完成");
    editor.createShape({ id: "shape:card", type: "ai-image" });
    vi.mocked(exportPNG).mockResolvedValueOnce(undefined as never);
    await expect(
      exportScene(editor, sceneFromEditor(editor), {}, ["shape:card"]),
    ).rejects.toThrow("卡片预览暂时无法生成");
  });

  it("waits for scene assets before invoking the native renderer", async () => {
    const editor = new Editor(new CanvasStore());
    editor.createShape({ id: "shape:image", type: "image" });
    const elements = sceneFromEditor(editor);
    const fileId = (elements[0] as { fileId: string }).fileId;
    let complete!: (value: {
      elements: typeof elements;
      files: BinaryFiles;
      appState: {};
    }) => void;
    const exporter = nativeExporter(
      editor,
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = exporter.exportSVG(["shape:image"]);
    expect(exportToSvg).not.toHaveBeenCalled();
    vi.mocked(exportToSvg).mockResolvedValue({
      outerHTML: "<svg/>",
      getAttribute: (name: string) => (name === "width" ? "320" : "220"),
    } as unknown as SVGSVGElement);
    complete({
      elements,
      files: {
        [fileId]: {
          id: fileId,
          dataURL: "data:image/png;base64,aW1n",
          mimeType: "image/png",
          created: 1,
        },
      } as BinaryFiles,
      appState: {},
    });
    await expect(pending).resolves.toEqual({
      svg: "<svg/>",
      width: 320,
      height: 220,
    });
    expect(exportToSvg).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.objectContaining({ [fileId]: expect.anything() }),
      }),
    );
  });
});
