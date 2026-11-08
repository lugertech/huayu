import { t, getLocale } from "@/i18n";
import { Editor, Bounds, createShapeId } from "@/features/canvas/editor";
import {
  getDefaultComponentProps,
  type ComponentType,
} from "@/config/components";
import { connectShapes } from "@/features/canvas/connection-parser";
import catalog from "../../../../../templates/catalog.json";
import type { TemplatePreset } from "./template-catalog";

export const templatePresets = catalog as TemplatePreset[];
const presetsByRecipe = new Map(
  templatePresets.map((item) => [item.recipe, item]),
);

export function applyRecipe(editor: Editor, recipe: string) {
  const preset = presetsByRecipe.get(recipe);
  if (preset) {
    const english = getLocale() === "en";
    editor.run(() => {
      const columns = new Map<number, number>();
      const rows = new Map<number, number>();
      for (const node of preset.nodes) {
        columns.set(
          node.column,
          Math.max(columns.get(node.column) || 0, node.props.w),
        );
        rows.set(node.row, Math.max(rows.get(node.row) || 0, node.props.h));
      }
      const positions = new Map<string, string>();
      for (const node of preset.nodes) {
        const id = createShapeId();
        positions.set(node.id, id);
        const localized = english ? node.en : node;
        editor.createShape({
          id,
          type: node.type,
          x:
            40 +
            [...columns]
              .filter(([column]) => column < node.column)
              .reduce((sum, [, width]) => sum + width + 120, 0),
          y:
            40 +
            [...rows]
              .filter(([row]) => row < node.row)
              .reduce((sum, [, height]) => sum + height + 96, 0),
          props: {
            ...getDefaultComponentProps(node.type),
            ...node.props,
            ...(english ? node.en.props : {}),
            name: localized.name,
            text: localized.text,
          },
        });
      }
      for (const [from, to] of preset.edges)
        connectShapes(editor, positions.get(from)!, positions.get(to)!);
    });
    const viewport = editor.container?.getBoundingClientRect();
    const palette = editor.container
      ?.querySelector<HTMLElement>(".board-component-palette")
      ?.getBoundingClientRect();
    if (viewport && palette) {
      const bounds = Bounds.union(
        editor
          .getCurrentPageShapes()
          .map((shape) => editor.getShapePageBounds(shape)!)
          .filter(Boolean),
      );
      const left = Math.max(0, palette.right - viewport.left + 16);
      const zoom = Math.min(
        1.2,
        Math.max(
          0.05,
          Math.min(
            (viewport.width - left - 48) / Math.max(bounds.w, 1),
            (viewport.height - (viewport.height < 600 ? 100 : 140)) /
              Math.max(bounds.h, 1),
          ),
        ),
      );
      editor.setViewport({
        x: left + (viewport.width - left) / 2 - bounds.center.x * zoom,
        y: viewport.height / 2 - bounds.center.y * zoom,
        zoom,
      });
    } else editor.zoomToFit({ animation: { duration: 0 } });
    return;
  }
  const recipes: Record<
    string,
    Array<{ type: ComponentType; text: string }>
  > = {
    writing: [
      {
        type: "ai-text",
        text: t("canvas.topic"),
      },
      {
        type: "instruction",
        text: t("canvas.writeAVividShortPieceBasedOnThePrecedingMaterials"),
      },
      { type: "ai-text", text: "" },
    ],
    image: [
      {
        type: "ai-text",
        text: t("canvas.examples.imagePrompt"),
      },
      { type: "ai-image", text: "" },
      { type: "instruction", text: t("canvas.writeAShortCaptionForThisImage") },
    ],
    chart: [
      {
        type: "ai-text",
        text: t("canvas.examples.chartPrompt"),
      },
      { type: "chart", text: "" },
    ],
    website: [
      {
        type: "ai-text",
        text: t("canvas.examples.websitePrompt"),
      },
      { type: "website", text: "" },
    ],
  };
  const nodes = recipes[recipe];
  if (!nodes) return;
  editor.run(() => {
    const width = editor.getViewportPageBounds().w;
    const compact = width < 950;
    const vertical = width < 700;
    let previous: string | undefined;
    let x = 0;
    let y = 30;
    for (const [index, node] of nodes.entries()) {
      const id = createShapeId();
      const props = { ...getDefaultComponentProps(node.type), text: node.text };
      editor.createShape({
        id,
        type: node.type,
        x: vertical ? 0 : compact ? (index === 1 ? 380 : 0) : x,
        y: vertical ? y : compact && index === 2 ? 360 : 30,
        props,
      });
      if (previous) connectShapes(editor, previous, id);
      previous = id;
      x += props.w + 64;
      y += props.h + 48;
    }
  });
  editor.zoomToFit({ animation: { duration: 0 } });
}
