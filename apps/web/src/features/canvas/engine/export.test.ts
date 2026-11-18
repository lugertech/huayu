import { describe, expect, it, vi } from "vite-plus/test";
import { Editor, getSnapshot } from "./editor";
import { CanvasStore } from "./store";
import { exportSVG } from "./export";
import { COMPONENT_CONFIGS } from "@/config/components";

vi.mock("@/api/backend", () => ({
  blobForSource: vi.fn(async () => {
    throw new Error("missing local asset");
  }),
  blobAsDataURL: vi.fn(),
}));

const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=";

describe("canvas card export", () => {
  it("exports defaults in the canvas language without translating user content", async () => {
    const editor = new Editor(new CanvasStore());
    editor.locale = "en";
    editor.createShape({ id: "shape:task", type: "instruction" });
    editor.createShape({
      id: "shape:authored",
      type: "ai-text",
      x: 500,
      props: { name: "自定义名称", text: "保留原始正文" },
    });
    const before = getSnapshot(editor.store).document;
    const output = await exportSVG(editor, ["shape:task", "shape:authored"]);
    expect(output?.svg).toContain(">Instruction</text>");
    expect(output?.svg).not.toContain(">创作指令</text>");
    expect(output?.svg).toContain("自定义名称");
    expect(output?.svg).toContain("保留原始正文");
    expect(getSnapshot(editor.store).document).toEqual(before);
  });
  it("keeps empty image and text cards recognizable without changing the document", async () => {
    const editor = new Editor(new CanvasStore());
    editor.createShape({
      id: "shape:empty-image",
      type: "ai-image",
      props: { w: 400, h: 440 },
    });
    editor.createShape({
      id: "shape:text",
      type: "ai-text",
      x: 500,
      props: { text: "保留的素材" },
    });
    editor.createShape({ id: "shape:empty-task", type: "instruction", x: 900 });
    const before = getSnapshot(editor.store).document;
    const output = await exportSVG(editor, [
      ...editor.getCurrentPageShapeIds(),
    ]);
    expect(output?.svg).toContain("上传图片，或连接组件后运行生成");
    expect(output?.svg).toContain("lucide-image");
    expect(output?.svg).toContain("保留的素材");
    expect(output?.svg).toContain("输入指令，连接组件获取更多上下文…");
    for (const title of ["AI绘图", "文本", "创作指令"])
      expect(output?.svg).toContain(title);
    expect(getSnapshot(editor.store).document).toEqual(before);
  });

  it("includes every supported empty component instead of omitting blank cards", async () => {
    const editor = new Editor(new CanvasStore());
    for (const [index, type] of Object.keys(COMPONENT_CONFIGS)
      .filter((type) => !["frame", "start"].includes(type))
      .entries())
      editor.createShape({ id: `shape:${type}`, type, x: index * 850 });
    const output = await exportSVG(editor, [
      ...editor.getCurrentPageShapeIds(),
    ]);
    for (const [type, config] of Object.entries(COMPONENT_CONFIGS))
      if (!["frame", "start"].includes(type))
        expect(output?.svg).toContain(config.displayName);
  });

  it("shows the file name and size while preserving the attachment contents", async () => {
    const editor = new Editor(new CanvasStore());
    editor.createShape({
      id: "shape:file",
      type: "file",
      props: {
        fileName: "888.html",
        fileSize: 5632,
        text: "<!DOCTYPE html><html lang='en'>",
        result: "Attachment body",
      },
    });
    const before = getSnapshot(editor.store).document;
    const output = await exportSVG(editor, ["shape:file"]);
    expect(output?.svg).toContain("888.html");
    expect(output?.svg).toContain("5.5 KB");
    expect(output?.svg).not.toContain("DOCTYPE");
    expect(output?.svg).not.toContain("Attachment body");
    expect(getSnapshot(editor.store).document).toEqual(before);
  });

  it("embeds an asset-backed image and preserves its title and prompt", async () => {
    const editor = new Editor(new CanvasStore());
    editor.store.put([
      {
        id: "asset:photo",
        typeName: "asset",
        type: "image",
        props: { src: image },
        meta: {},
      },
    ]);
    editor.createShape({
      id: "shape:image",
      type: "ai-image",
      props: {
        w: 400,
        h: 440,
        assetId: "asset:photo",
        name: "海边 <草图>",
        text: "傍晚的暖色光线",
      },
    });
    const output = await exportSVG(editor, ["shape:image"]);
    expect(output?.svg).toContain(`href="${image}"`);
    expect(output?.svg).toContain("海边 &lt;草图&gt;");
    expect(output?.svg).toContain("傍晚的暖色光线");
    expect(output?.svg).not.toContain("描述想要的图片…");
  });

  it("retains the card and an explicit unavailable state when its image cannot load", async () => {
    const editor = new Editor(new CanvasStore());
    editor.createShape({
      id: "shape:missing-image",
      type: "ai-image",
      props: { src: "/api/assets/missing" },
    });
    editor.theme = "dark";
    const output = await exportSVG(editor, ["shape:missing-image"]);
    expect(output?.svg).toContain("AI绘图");
    expect(output?.svg).toContain("图片暂时无法读取");
    expect(output?.svg).toContain("lucide-image-off");
  });
  it("exports card borders and filled triangle arrows at the same width in both themes", async () => {
    const editor = new Editor(new CanvasStore());
    editor.createShape({ id: "shape:card", type: "ai-text" });
    editor.createShape({ id: "shape:arrow", type: "arrow", x: 400 });
    // Native edits use literal colors instead of palette names.
    editor.updateShape({ id: "shape:arrow", props: { color: "#000000" } });
    const before = getSnapshot(editor.store).document;
    for (const [theme, color] of [
      ["light", "#000000"],
      ["dark", "#e5e5e5"],
    ] as const) {
      editor.theme = theme;
      const output = await exportSVG(editor, ["shape:card", "shape:arrow"]);
      expect(output?.svg).toMatch(
        new RegExp(`<rect[^>]*stroke="${color}" stroke-width="2"`),
      );
      expect(output?.svg).toMatch(
        new RegExp(
          `<path[^>]* Z" fill="${color}" stroke="${color}" stroke-width="2"`,
        ),
      );
      expect(output?.svg).not.toContain('stroke-width="2.5"');
    }
    expect(getSnapshot(editor.store).document).toEqual(before);
  });
});
