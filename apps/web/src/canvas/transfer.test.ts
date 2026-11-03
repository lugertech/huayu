import { describe, expect, it } from "vite-plus/test";
import { parseProjectFile, rewriteProjectResources } from "./transfer";
import {
  createCanvasStore,
  Editor,
  getSnapshot,
  loadSnapshot,
  type CanvasRecord,
  type DocumentSnapshot,
} from "@/canvas/editor";
import type { CanvasDocument } from "@/api/client";
import { connectShapes } from "@/utils/connectionParser";
import { generationFingerprint, resultIsStale } from "@/workflow/freshness";

function generatedImageBoard() {
  const editor = new Editor(createCanvasStore());
  for (let page = 0; page < 2; page++) {
    if (page) editor.createPage("第二页");
    const source = `shape:source${page}`;
    const output = `shape:output${page}`;
    editor.createShape({
      id: source,
      type: "ai-image",
      props: {
        src: "/api/assets/source",
        isUploaded: true,
        text: "",
        w: 320,
        h: 200,
      },
    });
    editor.createShape({
      id: output,
      type: "ai-image",
      props: {
        src: `/api/assets/output${page}`,
        isUploaded: false,
        text: "调整光线",
        w: 320,
        h: 200,
      },
    });
    connectShapes(editor, source, output);
    editor.updateShape({
      id: output,
      props: {
        generation: {
          fingerprint: generationFingerprint(editor, output),
          completedAt: 1234,
          durationMs: 56,
        },
      },
    });
  }
  return editor;
}
function editorFor(document: CanvasDocument) {
  const store = createCanvasStore();
  loadSnapshot(store, { document: document as DocumentSnapshot<CanvasRecord> });
  return new Editor(store);
}

describe("attachment address changes during project transfer", () => {
  it("keeps fresh results fresh across export/import on every page and preserves timing", async () => {
    const editor = generatedImageBoard();
    const source = getSnapshot(editor.store).document;
    const before = structuredClone(source);
    const visited: string[] = [];
    const exported = await rewriteProjectResources(source, async (src) => {
      visited.push(src);
      return `data:image/png,${encodeURIComponent(src)}`;
    });
    expect(visited).toHaveLength(3);
    const imported = await rewriteProjectResources(
      exported,
      async (src) => `/api/assets/new-${encodeURIComponent(src)}`,
    );
    const restored = editorFor(imported);
    for (let page = 0; page < 2; page++) {
      restored.setCurrentPage(restored.pages[page].id);
      expect(resultIsStale(restored, `shape:output${page}`)).toBe(false);
      expect(
        restored.getShape(`shape:output${page}`).props.generation,
      ).toMatchObject({ completedAt: 1234, durationMs: 56 });
    }
    expect(source).toEqual(before);
  });
  it("does not make a genuinely outdated result fresh when attachments move", async () => {
    const editor = generatedImageBoard();
    editor.setCurrentPage(editor.pages[0].id);
    editor.updateShape({
      id: "shape:source0",
      props: { description: "素材发生变化" },
    });
    const transferred = await rewriteProjectResources(
      getSnapshot(editor.store).document,
      async (src) => `data:image/png,${src}`,
    );
    expect(resultIsStale(editorFor(transferred), "shape:output0")).toBe(true);
  });
  it("keeps the source unchanged if an attachment cannot be read", async () => {
    const source = getSnapshot(generatedImageBoard().store).document;
    const before = structuredClone(source);
    await expect(
      rewriteProjectResources(source, async () => {
        throw new Error("无法读取附件");
      }),
    ).rejects.toThrow("无法读取附件");
    expect(source).toEqual(before);
  });
});

const legacyDocument = () => ({
  schema: {
    schemaVersion: 2,
    sequences: { "com.tldraw.store": 4, "com.tldraw.shape.image": 4 },
  },
  store: {
    "page:old": {
      id: "page:old",
      typeName: "page",
      name: "旧页面",
      index: "a1",
    },
    "shape:image": {
      id: "shape:image",
      typeName: "shape",
      type: "image",
      x: 120,
      y: 80,
      parentId: "page:old",
      props: { w: 320, h: 200, assetId: "asset:old" },
    },
    "asset:old": {
      id: "asset:old",
      typeName: "asset",
      type: "image",
      props: {
        src: "data:image/png;base64,aGVsbG8=",
        name: "旧图片",
        w: 320,
        h: 200,
      },
    },
    "shape:text": {
      id: "shape:text",
      typeName: "shape",
      type: "ai-text",
      x: 500,
      y: 80,
      parentId: "page:old",
      props: {
        w: 350,
        h: 160,
        text: "旧项目文字",
        isLocked: false,
        isRunning: false,
      },
    },
  },
});
describe("portable and legacy project formats", () => {
  it("preserves legacy schema, media references and custom nodes without mutating the imported object", () => {
    const source = {
      format: "huayu",
      version: 1,
      name: "旧版项目",
      document: legacyDocument(),
      model_settings: { apiKey: "do-not-import-settings" },
    };
    const before = structuredClone(source);
    const parsed = parseProjectFile(source);
    expect(parsed.name).toBe("旧版项目");
    expect(parsed.document.schema).toEqual(source.document.schema);
    expect(parsed.document.store["shape:image"]["props"].assetId).toBe(
      "asset:old",
    );
    expect(parsed.document.store["shape:text"]["props"].text).toBe(
      "旧项目文字",
    );
    expect(JSON.stringify(parsed)).not.toContain("do-not-import-settings");
    expect(source).toEqual(before);
  });
  it("reads records-array .tldr files as the same application records", () => {
    const document = legacyDocument();
    const parsed = parseProjectFile({
      tldrawFileFormatVersion: 1,
      schema: document.schema,
      records: Object.values(document.store),
    });
    expect(Object.keys(parsed.document.store)).toHaveLength(4);
    expect(parsed.document.store["asset:old"]["props"].src).toBe(
      document.store["asset:old"].props.src,
    );
  });
  it("rejects session records and unsupported portable file versions", () => {
    const document = legacyDocument();
    expect(() =>
      parseProjectFile({ format: "huayu", version: 2, document }),
    ).toThrow("不支持");
    expect(() =>
      parseProjectFile({
        document: {
          ...document,
          store: {
            ...document.store,
            "instance:old": { id: "instance:old", typeName: "instance" },
          },
        },
      }),
    ).toThrow("无法读取");
  });
  it("imports native Excalidraw images and embedded AI cards together", () => {
    const parsed = parseProjectFile({
      type: "excalidraw",
      version: 2,
      elements: [
        {
          id: "card",
          type: "embeddable",
          x: 10,
          y: 20,
          width: 340,
          height: 260,
          angle: 0,
          opacity: 100,
          locked: false,
          customData: {
            huayu: {
              type: "instruction",
              props: { text: "生成提纲", result: "保存的结果" },
            },
          },
        },
        {
          id: "photo",
          type: "image",
          x: 400,
          y: 20,
          width: 100,
          height: 100,
          angle: 0,
          opacity: 100,
          locked: false,
          fileId: "file1",
        },
      ],
      files: {
        file1: {
          id: "file1",
          dataURL: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
        },
      },
    });
    expect(parsed.document.store["shape:card"]["props"].result).toBe(
      "保存的结果",
    );
    expect(parsed.document.store["shape:photo"]["props"].assetId).toBe(
      "asset:excalidraw:file1",
    );
    expect(
      parsed.document.store["asset:excalidraw:file1"]["props"].src,
    ).toContain("data:image/png");
  });
});
