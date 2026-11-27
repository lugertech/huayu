import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  exportProject,
  importProject,
  parseProjectFile,
  rewriteProjectResources,
} from "./transfer";
import { createCanvasStore } from "@/features/canvas/engine/store";
import { Editor, loadSnapshot } from "@/features/canvas/engine/editor";
import type {
  CanvasRecord,
  DocumentSnapshot,
} from "@/features/canvas/engine/model";
import {
  api,
  downloadBlob,
  uploadAsset,
  type CanvasDocument,
  type Project,
} from "@/api/client";
import { connectShapes } from "@/features/canvas/connection-parser";
import { generationFingerprint, resultIsStale } from "@/workflow/freshness";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  api: vi.fn(),
  downloadBlob: vi.fn(),
  uploadAsset: vi.fn(),
}));

describe("project file transfer limits", () => {
  const limit = 128 * 1024 * 1024;
  const created = { id: "imported-project" } as Project;
  function sourceDocument() {
    const editor = new Editor(createCanvasStore());
    return editor.store.getDocumentSnapshot();
  }
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue(created);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([limit + 1, 139_810_136])(
    "does not download an exported file of %i bytes that cannot be imported",
    async (size) => {
      vi.spyOn(Blob.prototype, "size", "get").mockReturnValue(size);
      await expect(exportProject("Project", sourceDocument())).rejects.toThrow(
        "128",
      );
      expect(downloadBlob).not.toHaveBeenCalled();
      expect(api).not.toHaveBeenCalled();
      expect(uploadAsset).not.toHaveBeenCalled();
    },
  );

  it("allows an exported file exactly at the limit", async () => {
    vi.spyOn(Blob.prototype, "size", "get").mockReturnValue(limit);
    await exportProject("Project", sourceDocument());
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Project.huayu.json",
    );
  });

  it("rejects an oversized import before reading or uploading it", async () => {
    const file = new File(["{}"], "project.huayu.json");
    const read = vi.spyOn(file, "text");
    vi.spyOn(Blob.prototype, "size", "get").mockReturnValue(limit + 1);
    await expect(importProject(file)).rejects.toThrow("128");
    expect(read).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("allows an import exactly at the same limit", async () => {
    const file = new File(
      [
        JSON.stringify({
          format: "huayu",
          version: 1,
          name: "Project",
          document: sourceDocument(),
        }),
      ],
      "project.huayu.json",
    );
    vi.spyOn(Blob.prototype, "size", "get").mockReturnValue(limit);
    await expect(importProject(file)).resolves.toEqual(created);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("clears transient execution flags in the export and preserves the live document", async () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:running",
      type: "ai-draw",
      props: { isSubmitting: true, isRunning: true, result: "Saved output" },
    });
    const document = editor.store.getDocumentSnapshot();
    await exportProject("Project", document);
    const [blob] = vi.mocked(downloadBlob).mock.calls[0];
    const exported = JSON.parse(await blob.text()).document;
    expect(exported.store["shape:running"].props).toMatchObject({
      isSubmitting: false,
      isRunning: false,
      result: "Saved output",
    });
    expect(editor.getShape("shape:running")?.props.isRunning).toBe(true);
    expect(document.store["shape:running"]).toMatchObject({
      props: { isSubmitting: true },
    });
  });

  it("imports the actual file produced by an allowed export", async () => {
    const document = sourceDocument();
    await exportProject("Project", document);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    await expect(importProject(new File([blob], name))).resolves.toEqual(
      created,
    );
    const [, request] = vi.mocked(api).mock.calls[0];
    expect(JSON.parse(request!.body as string)).toEqual({
      name: "Project",
      document,
    });
  });
});

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
    const source = editor.store.getDocumentSnapshot();
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
  it("moves website image references alongside image cards without rewriting authored markup or external URLs", async () => {
    const editor = new Editor(createCanvasStore());
    const src = "/api/assets/leaf";
    const untouched =
      '<!-- <img src="/api/assets/comment"> --><p>/api/assets/leaf</p><script>const example = \'<img src="/api/assets/example">\'</script><img src="https://example.test/api/assets/external">';
    const html =
      '<!doctype html><IMG alt="Leaf" SRC=' +
      src +
      '><source srcset=" ' +
      src +
      ", " +
      src +
      ' 2x"><style>p { background:url(' +
      src +
      ") }</style>" +
      '<script>const preview = "' +
      src +
      '";</script>' +
      untouched;
    editor.createShape({
      id: "shape:site",
      type: "website",
      props: { htmlContent: html, result: html },
    });
    editor.createShape({ id: "shape:img", type: "ai-image", props: { src } });
    const source = editor.store.getDocumentSnapshot();
    const toData = vi.fn(async () => "data:image/jpeg;base64,YQ==");
    const portable = await rewriteProjectResources(source, toData);
    expect(toData.mock.calls).toEqual([[src]]);
    const toLocal = vi.fn(async () => "/api/assets/new-leaf");
    const imported = await rewriteProjectResources(portable, toLocal);
    expect(toLocal.mock.calls).toEqual([["data:image/jpeg;base64,YQ=="]]);
    const props = editorFor(imported).getShape("shape:site").props;
    const expected =
      html.slice(0, -untouched.length).replaceAll(src, "/api/assets/new-leaf") +
      untouched;
    expect(props.htmlContent).toBe(expected);
    expect(props.result).toBe(expected);
    expect(editor.getShape("shape:site").props.htmlContent).toBe(html);
  });
  it("moves the attachment once and keeps each SVG and media fragment across a round trip", async () => {
    const editor = new Editor(createCanvasStore());
    const src = "/api/assets/illustration";
    const html = `<svg><use href="${src}#leaf"/><use href="${src}#stem"/></svg>`;
    editor.createShape({
      id: "shape:site",
      type: "website",
      props: { htmlContent: html },
    });
    const video = "/api/assets/clip";
    editor.createShape({
      id: "shape:clip",
      type: "video",
      props: { src: video + "#t=2,4" },
    });
    const embedded = new Map([
      [src, "data:image/svg+xml;base64,PHN2Zy8+"],
      [video, "data:video/mp4;base64,AAAA"],
    ]);
    const embed = vi.fn(async (url: string) => embedded.get(url)!);
    const portable = await rewriteProjectResources(
      editor.store.getDocumentSnapshot(),
      embed,
    );
    expect(embed.mock.calls.map(([url]) => url).sort()).toEqual([video, src]);
    const restored = editorFor(
      await rewriteProjectResources(portable, async (url) =>
        url === embedded.get(src)
          ? "/api/assets/new-illustration"
          : "/api/assets/new-clip",
      ),
    );
    expect(restored.getShape("shape:site").props.htmlContent).toBe(
      html.replaceAll(src, "/api/assets/new-illustration"),
    );
    expect(restored.getShape("shape:clip").props.src).toBe(
      "/api/assets/new-clip#t=2,4",
    );
  });
  it("preserves legacy asset records without a source or properties", async () => {
    const document = createCanvasStore().getDocumentSnapshot();
    const asset = {
      id: "asset:placeholder",
      typeName: "asset",
      type: "image",
    } as const;
    document.store[asset.id] = asset;
    const { document: parsed } = parseProjectFile({ document });
    const rewrite = vi.fn();
    const transferred = await rewriteProjectResources(parsed, rewrite);
    expect(transferred.store[asset.id]).toEqual(asset);
    expect(rewrite).not.toHaveBeenCalled();
  });
  it("does not make a genuinely outdated result fresh when attachments move", async () => {
    const editor = generatedImageBoard();
    editor.setCurrentPage(editor.pages[0].id);
    editor.updateShape({
      id: "shape:source0",
      props: { description: "素材发生变化" },
    });
    const transferred = await rewriteProjectResources(
      editor.store.getDocumentSnapshot(),
      async (src) => `data:image/png,${src}`,
    );
    expect(resultIsStale(editorFor(transferred), "shape:output0")).toBe(true);
  });
  it("keeps the source unchanged if an attachment cannot be read", async () => {
    const source = generatedImageBoard().store.getDocumentSnapshot();
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
