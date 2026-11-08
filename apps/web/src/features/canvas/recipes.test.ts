import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  Editor,
  createCanvasStore,
  getSnapshot,
} from "@/features/canvas/editor";
import { COMPONENT_CONFIGS } from "@/config/components";
import { setLanguage } from "@/i18n";
import { localizeTemplate, templateTag } from "@/i18n/templates";
import { connectedShapes } from "@/features/canvas/connection-parser";
import { planWorkflow } from "@/workflow/graph";
import { runWorkflow } from "@/workflow/execute";
import { ModelConnectionError } from "@/ai/errors";
import { applyRecipe, templatePresets } from "./recipes";
import { templateSummaries, templatePreview } from "./template-catalog";
import type { Template } from "@/api/client";

afterEach(() => {
  setLanguage("zh-CN");
  vi.unstubAllGlobals();
});

describe("ready-to-edit template workflows", () => {
  it("ships twenty additional distinct bilingual workflows with complete graph references", () => {
    expect(templatePresets).toHaveLength(20);
    expect(templateSummaries).toHaveLength(20);
    expect(templateSummaries.every((preset) => !("nodes" in preset))).toBe(
      true,
    );
    expect(JSON.stringify(templateSummaries)).not.toContain('"props":');
    expect(templateSummaries.map((preset) => preset.id)).toEqual(
      templatePresets.map((preset) => preset.id),
    );
    expect(new Set(templatePresets.map((preset) => preset.id)).size).toBe(20);
    expect(new Set(templatePresets.map((preset) => preset.recipe)).size).toBe(
      20,
    );
    for (const preset of templatePresets) {
      const ids = new Set(preset.nodes.map((node) => node.id));
      expect(ids.size).toBe(preset.nodes.length);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.en.name.length).toBeGreaterThan(0);
      expect(preset.en.description.length).toBeGreaterThan(0);
      expect(preset.nodes.length).toBeGreaterThanOrEqual(3);
      for (const node of preset.nodes) {
        expect(node.type in COMPONENT_CONFIGS).toBe(true);
        expect(node.name.length).toBeGreaterThan(0);
        expect(node.en.name.length).toBeGreaterThan(0);
        expect(Number.isInteger(node.column) && node.column >= 0).toBe(true);
        expect(Number.isInteger(node.row) && node.row >= 0).toBe(true);
        expect(node.props.w).toBeGreaterThan(0);
        expect(node.props.h).toBeGreaterThan(0);
        if (!preset.edges.some(([, to]) => to === node.id)) {
          expect(node.type).toBe("ai-text");
          expect(node.text.trim().length).toBeGreaterThan(0);
          expect(node.en.text.trim().length).toBeGreaterThan(0);
        }
        expect(
          preset.edges.some(([from, to]) => from === node.id || to === node.id),
        ).toBe(true);
      }
      for (const [from, to] of preset.edges) {
        expect(ids.has(from) && ids.has(to)).toBe(true);
        expect(from).not.toBe(to);
      }
      const roots = preset.nodes
        .filter((node) => !preset.edges.some(([, to]) => to === node.id))
        .map((node) => node.id);
      expect(
        planWorkflow(
          roots,
          preset.edges.map(([from, to]) => ({ from, to })),
        )
          .flat()
          .sort(),
      ).toEqual([...ids].sort());
    }
  });

  it.each(templatePresets.map((preset) => [preset.recipe, preset] as const))(
    "opens %s in both languages without credentials, overlapping cards or network requests",
    (_recipe, preset) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      for (const locale of ["zh-CN", "en"] as const) {
        setLanguage(locale);
        const editor = new Editor(createCanvasStore());
        applyRecipe(editor, preset.recipe);
        const nodes = editor
          .getCurrentPageShapes()
          .filter((shape) => shape.type !== "arrow");
        expect(nodes).toHaveLength(preset.nodes.length);
        expect(
          editor
            .getCurrentPageShapes()
            .filter((shape) => shape.type === "arrow"),
        ).toHaveLength(preset.edges.length);
        const byKey = new Map(
          preset.nodes.map((node) => {
            const localized = locale === "en" ? node.en : node;
            const shape = nodes.find(
              (shape) => shape.props.name === localized.name,
            );
            expect(shape).toBeDefined();
            expect(shape!.type).toBe(node.type);
            expect(shape!.props.text).toBe(localized.text);
            const props = {
              ...node.props,
              ...(locale === "en" ? node.en.props : {}),
            };
            for (const key of ["result", "src", "htmlContent", "chartData"])
              expect(shape!.props[key]).toBe(props[key]);
            expect(shape!.props.generation).toBeUndefined();
            return [node.id, shape!];
          }),
        );
        for (const [from, to] of preset.edges)
          expect(
            connectedShapes(editor, byKey.get(from)!.id, "next").map(
              (shape) => shape.id,
            ),
          ).toContain(byKey.get(to)!.id);
        for (let i = 0; i < nodes.length; i++) {
          const a = editor.getShapePageBounds(nodes[i])!;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = editor.getShapePageBounds(nodes[j])!;
            expect(
              a.maxX <= b.x || b.maxX <= a.x || a.maxY <= b.y || b.maxY <= a.y,
            ).toBe(true);
          }
        }
        const document = getSnapshot(editor.store).document;
        expect(JSON.stringify(document)).not.toMatch(
          /"(?:apiKey|baseUrl|model|connections)"\s*:/,
        );
        setLanguage(locale === "en" ? "zh-CN" : "en");
        expect(getSnapshot(editor.store).document).toEqual(document);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("creates a whole preset as one undoable operation while retaining existing material", () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:existing",
      type: "ai-text",
      x: -600,
      props: { text: "Original material" },
    });
    applyRecipe(editor, "meeting-minutes");
    const created = getSnapshot(editor.store).document;
    editor.undo();
    expect(editor.getCurrentPageShapes().map((shape) => shape.id)).toEqual([
      "shape:existing",
    ]);
    editor.redo();
    expect(getSnapshot(editor.store).document).toEqual(created);
  });

  it.each([
    [1024, 720, 144],
    [320, 568, 44],
  ])(
    "keeps template cards clear of the palette in a %s-pixel canvas",
    (width, height, paletteWidth) => {
      const editor = new Editor(createCanvasStore());
      const left = 256;
      const paletteRight = left + 12 + paletteWidth;
      editor.mount({
        container: {
          getBoundingClientRect: () => ({ left, top: 0, width, height }),
          querySelector: () => ({
            getBoundingClientRect: () => ({ right: paletteRight }),
          }),
        } as unknown as HTMLElement,
        setViewport: vi.fn(),
      });
      applyRecipe(editor, "meeting-minutes");
      for (const shape of editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type !== "arrow")) {
        const bounds = editor.getShapePageBounds(shape)!;
        const viewport = editor.viewport;
        expect(
          left + viewport.x + bounds.x * viewport.zoom,
        ).toBeGreaterThanOrEqual(paletteRight + 16);
        expect(
          left + viewport.x + bounds.maxX * viewport.zoom,
        ).toBeLessThanOrEqual(left + width - 23);
      }
    },
  );

  it("localizes new template metadata and transparent previews without changing saved custom templates", () => {
    for (const preset of templatePresets) {
      const template: Template = {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        tags: [preset.tag],
        recipe: preset.recipe,
        cover: null,
        document: null,
        fork_count: 0,
        created_at: "2026-11-03T00:00:00Z",
      };
      setLanguage("en");
      const localized = localizeTemplate(template);
      expect(localized.name).toBe(preset.en.name);
      expect(templateTag(template, preset.tag)).toBe(preset.en.tag);
      expect(localized.cover).toBe(
        templatePreview(
          templateSummaries.find((summary) => summary.id === preset.id)!,
          "en",
        ),
      );
      if (preset.showcase) {
        expect(localized.cover).toBe(
          `/examples/art/${preset.showcase.artwork}-en.svg`,
        );
      } else {
        const svg = readFileSync(
          new URL(`../../../public${localized.cover}`, import.meta.url),
          "utf8",
        );
        expect(svg.match(/<rect /g)).toHaveLength(preset.nodes.length);
        expect(svg).not.toMatch(/<image|<script|<foreignObject|background:/);
      }
      const custom = {
        ...template,
        id: "custom-template",
        name: "My custom template",
        cover: "/api/assets/custom",
      };
      expect(localizeTemplate(custom)).toEqual(custom);
    }
  });

  it("includes six complete authored examples with branching workflows and readable local outputs", () => {
    const examples = templatePresets.filter((preset) => preset.showcase);
    expect(examples).toHaveLength(6);
    for (const preset of examples) {
      expect(preset.nodes.length).toBeGreaterThanOrEqual(10);
      expect(preset.edges.length).toBeGreaterThan(preset.nodes.length);
      expect(
        preset.nodes.some((node) => node.id === preset.showcase!.focus),
      ).toBe(true);
      for (const node of preset.nodes.filter(
        (item) => item.type !== "ai-text",
      )) {
        for (const english of [false, true]) {
          const props = { ...node.props, ...(english ? node.en.props : {}) };
          expect(
            props.result || props.src || props.htmlContent || props.chartData,
          ).toBeTruthy();
          if (props.src)
            expect(props.src).toMatch(/^\/examples\/art\/[\w-]+\.png$/);
          if (props.chartData)
            expect(JSON.parse(props.chartData).children.length).toBeGreaterThan(
              1,
            );
          if (props.htmlContent) {
            expect(props.htmlContent).toContain(
              english ? 'lang="en"' : 'lang="zh-CN"',
            );
            expect(props.htmlContent).not.toMatch(
              /(?:src|href)=["']https?:\/\//,
            );
          }
        }
      }
    }
  });

  it.each(
    templatePresets
      .filter((preset) => preset.showcase)
      .map((preset) => [preset.recipe, preset] as const),
  )(
    "keeps the %s example intact when regeneration has no configured connection",
    async (_recipe, preset) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const editor = new Editor(createCanvasStore());
      applyRecipe(editor, preset.recipe);
      const name = preset.nodes.find(
        (node) => node.id === preset.showcase!.focus,
      )!.name;
      const shape = editor
        .getCurrentPageShapes()
        .find((shape) => shape.props.name === name)!;
      const before = getSnapshot(editor.store).document;
      await expect(runWorkflow(editor, shape.id)).rejects.toBeInstanceOf(
        ModelConnectionError,
      );
      expect(getSnapshot(editor.store).document).toEqual(before);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps the original four quick-start recipes available", () => {
    for (const recipe of ["writing", "image", "chart", "website"]) {
      const editor = new Editor(createCanvasStore());
      applyRecipe(editor, recipe);
      expect(editor.getCurrentPageShapes().length).toBeGreaterThan(0);
    }
  });
});
