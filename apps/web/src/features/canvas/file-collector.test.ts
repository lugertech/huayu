import { describe, expect, it } from "vite-plus/test";
import { Editor } from "./engine/editor";
import { createCanvasStore } from "./engine/store";
import { collectDownloadableFiles } from "./file-collector";

describe("attachment interface language", () => {
  it("localizes default labels and names without changing authored content", () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:file",
      type: "file",
      props: { text: "保留正文" },
    });
    editor.createShape({
      id: "shape:web",
      type: "website",
      props: { name: "我的网页", htmlContent: "<p>原文</p>" },
    });
    editor.createShape({
      id: "shape:image",
      type: "ai-image",
      props: { src: "data:image/png;base64,aW1n" },
    });
    editor.createShape({
      id: "shape:audio",
      type: "speech",
      props: { src: "data:audio/mp3;base64,YXVkaW8=" },
    });
    const before = editor.store.getDocumentSnapshot();
    const english = collectDownloadableFiles(editor, "en");
    expect(english.map((file) => file.sourceLabel)).toEqual([
      "File step",
      "Website step",
      "Image step",
      "Audio step",
    ]);
    expect(english[0]).toMatchObject({
      fileName: "document.txt",
      content: "保留正文",
    });
    expect(english[1]).toMatchObject({
      fileName: "我的网页.html",
      content: "<p>原文</p>",
    });
    expect(collectDownloadableFiles(editor, "zh-CN")[0]).toMatchObject({
      fileName: "文档.txt",
      sourceLabel: "文件组件",
    });
    expect(editor.store.getDocumentSnapshot()).toEqual(before);
  });
});

it("lists a native canvas image with its asset filename and download URL", () => {
  const editor = new Editor(createCanvasStore());
  editor.store.put([
    {
      id: "asset:photo",
      typeName: "asset",
      type: "image",
      props: {
        name: "海边.png",
        src: "/api/assets/local-image",
        mimeType: "image/png",
        w: 1600,
        h: 800,
      },
      meta: {},
    },
  ]);
  editor.createShape({
    id: "shape:photo",
    type: "image",
    props: { assetId: "asset:photo" },
  });

  expect(collectDownloadableFiles(editor)).toMatchObject([
    {
      shapeId: "shape:photo",
      fileName: "海边.png",
      source: "image",
      downloadUrl: "/api/assets/local-image",
    },
  ]);
});
