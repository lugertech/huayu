import { LocalizedError } from "@/i18n/errors";
import { getTranslator, getLocale, type Locale } from "@/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bounds, type Editor } from "./editor";
import type { CanvasShape } from "./model";
import { NativeSVG, TextSVG } from "./visual";
import {
  COMPONENT_CONFIGS,
  componentConfig,
  componentPlaceholder,
  type ComponentType,
} from "@/config/components";
import { ImageIcon, ImageOff } from "lucide-react";
import { blobForSource, blobAsDataURL } from "@/api/backend";
import { layoutMindmap } from "@/features/canvas/components/shapes/chart-shape/MindmapRenderer";
import { layoutFlowchart } from "@/features/canvas/components/shapes/chart-shape/FlowchartRenderer";

function ChartSVG({ shape }: { shape: CanvasShape }) {
  const data = JSON.parse(shape.props.chartData);
  const flow = shape.props.chartType === "flowchart";
  const layout = flow ? layoutFlowchart(data) : layoutMindmap(data);
  const width = shape.props.w;
  const height = Math.max(1, shape.props.h - 38);
  const scale = Math.min(
    (width - 24) / Math.max(1, layout.bounds.width),
    (height - 16) / Math.max(1, layout.bounds.height),
    1,
  );
  const tx =
    (width - layout.bounds.width * scale) / 2 - layout.bounds.minX * scale;
  const ty =
    (height - layout.bounds.height * scale) / 2 - layout.bounds.minY * scale;
  const links = flow
    ? (layout as ReturnType<typeof layoutFlowchart>).edges
    : (layout as ReturnType<typeof layoutMindmap>).connections;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
      {links.map((edge, index) => (
        <g key={index}>
          <path
            d={`M ${edge.startX} ${edge.startY} C ${(edge.startX + edge.endX) / 2} ${edge.startY}, ${(edge.startX + edge.endX) / 2} ${edge.endY}, ${edge.endX} ${edge.endY}`}
            stroke="#94a3b8"
            strokeWidth={2}
            fill="none"
          />
          {"edge" in edge && edge.edge.label && (
            <text
              x={(edge.startX + edge.endX) / 2}
              y={(edge.startY + edge.endY) / 2 - 8}
              fontSize={13}
              fill="#64748b"
            >
              {edge.edge.label}
            </text>
          )}
        </g>
      ))}
      {layout.nodes.map((node: any) => {
        const kind = flow ? node.node.data.nodeType : "process";
        const color = flow
          ? {
              start: "#22c55e",
              end: "#ef4444",
              process: "#3b82f6",
              decision: "#f59e0b",
              input: "#8b5cf6",
              output: "#06b6d4",
            }[kind] || "#3b82f6"
          : ["#3b82f6", "#60a5fa", "#93c5fd"][Math.min(node.level, 2)];
        return (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
            {kind === "decision" ? (
              <path
                d={`M ${node.w / 2} 0 L ${node.w} ${node.h / 2} L ${node.w / 2} ${node.h} L 0 ${node.h / 2} Z`}
                fill={color}
              />
            ) : (
              <rect
                width={node.w}
                height={node.h}
                rx={kind === "start" || kind === "end" ? node.h / 2 : 6}
                fill={color}
              />
            )}
            <TextSVG
              text={flow ? node.node.data.label : node.data.content}
              w={node.w}
              h={node.h}
              size={15}
              color={!flow && node.level > 1 ? "#1e3a5f" : "#ffffff"}
            />
          </g>
        );
      })}
    </g>
  );
}

async function inlineImage(source?: string) {
  if (!source) return "";
  if (source.startsWith("data:image/")) return source;
  try {
    return await blobAsDataURL(await blobForSource(source));
  } catch {
    return "";
  }
}
function resource(editor: Editor, shape: CanvasShape) {
  const asset = shape.props.assetId
    ? editor.store.get(shape.props.assetId)
    : null;
  return shape.props.src || asset?.props?.src || "";
}
async function card(editor: Editor, shape: CanvasShape, locale: Locale) {
  const t = getTranslator(locale);
  const props = shape.props;
  const w = props.w || 350;
  const h = props.h || 180;
  const config = componentConfig(shape.type as ComponentType, locale);
  const dark = editor.theme === "dark";
  const background = dark ? "#242424" : "#ffffff";
  const foreground = dark ? "#ecebe8" : "#1a1a1a";
  const header = dark ? "#30302e" : "#f0f0ed";
  const muted = dark ? "#a5a29c" : "#706d67";
  const border = dark ? "#e5e5e5" : "#000000";
  const divider = dark ? "#55534f" : "#deddd8";
  const imageSource = shape.type === "ai-image" ? resource(editor, shape) : "";
  const source = await inlineImage(imageSource);
  let text =
    props.result ||
    props.text ||
    props.query ||
    props.url ||
    props.fileName ||
    "";
  if (shape.type === "website" && props.htmlContent)
    text =
      new DOMParser().parseFromString(props.htmlContent, "text/html").body
        .textContent || "";
  let chart = "";
  if (shape.type === "chart" && props.chartData) {
    try {
      chart = renderToStaticMarkup(<ChartSVG shape={shape} />);
    } catch {
      /* Keep invalid chart JSON available as text. */
    }
  }
  const title = renderToStaticMarkup(
    <g color={foreground}>
      {config && (
        <g transform="translate(14 10)">
          {createElement(config.icon, { size: 16 })}
        </g>
      )}
      <text
        x={config ? 38 : 14}
        y={24}
        fill={foreground}
        fontSize={14}
        fontFamily="sans-serif"
      >
        {props.name || config?.displayName || shape.type}
      </text>
    </g>,
  );
  let body: string;
  if (shape.type === "ai-image") {
    const mediaHeight = Math.max(32, h - 84);
    const Icon = imageSource && !source ? ImageOff : ImageIcon;
    body = source
      ? `<image x="8" y="40" width="${Math.max(1, w - 16)}" height="${mediaHeight}" href="${source.replaceAll('"', "&quot;")}" preserveAspectRatio="xMidYMid meet"/>`
      : renderToStaticMarkup(
          <g
            color={muted}
            transform={`translate(${w / 2 - 18} ${40 + mediaHeight / 2 - 18})`}
          >
            <Icon size={36} />
          </g>,
        );
    body += `<g transform="translate(0 ${h - 42})">${renderToStaticMarkup(
      <TextSVG
        text={
          text ||
          (imageSource && !source
            ? t("results.image.imageCannotBeLoaded")
            : componentPlaceholder(shape.type, locale))
        }
        w={w}
        h={40}
        size={16}
        color={text ? foreground : muted}
        align="start"
        vertical="start"
      />,
    )}</g>`;
  } else if (chart) body = `<g transform="translate(0 37)">${chart}</g>`;
  else
    body = `<g transform="translate(0 37)">${renderToStaticMarkup(
      <TextSVG
        text={text || componentPlaceholder(shape.type, locale)}
        w={w}
        h={Math.max(1, h - 40)}
        size={16}
        color={text ? foreground : muted}
        align="start"
        vertical="start"
      />,
    )}</g>`;
  return `<rect x="1" y="1" width="${Math.max(1, w - 2)}" height="${Math.max(1, h - 2)}" rx="8" fill="${background}" stroke="${border}" stroke-width="2"/><path d="M 8 2 H ${w - 8} Q ${w - 2} 2 ${w - 2} 8 V 36 H 2 V 8 Q 2 2 8 2 Z" fill="${header}"/><path d="M 2 36 H ${w - 2}" stroke="${divider}"/>${title}${body}`;
}
export async function exportSVG(
  editor: Editor,
  ids: string[],
  options: { background?: boolean; padding?: number } = {},
) {
  const locale = editor.locale ?? getLocale();
  const selected = new Map<string, CanvasShape>();
  for (const id of ids) {
    const shape = editor.getShape(id);
    if (shape) {
      selected.set(id, shape);
      editor.descendants(id).forEach((child) => selected.set(child.id, child));
    }
  }
  if (!selected.size) return undefined;
  const shapes = [...selected.values()].sort((a, b) =>
    a.type === "frame"
      ? -1
      : b.type === "frame"
        ? 1
        : String(a.index).localeCompare(String(b.index)),
  );
  const bounds = Bounds.union(
    shapes.map((shape) => editor.getShapePageBounds(shape)!).filter(Boolean),
  );
  const padding = options.padding ?? 24;
  const width = Math.ceil(bounds.w + padding * 2);
  const height = Math.ceil(bounds.h + padding * 2);
  const fragments = await Promise.all(
    shapes.map(async (shape) => {
      if (shape.type === "group") return "";
      const transform = editor.getPageTransform(shape);
      let content: string;
      if (shape.type === "arrow") {
        const arrow = editor.arrowPoints(shape);
        return `<g opacity="${shape.opacity}">${renderToStaticMarkup(createElement(NativeSVG, { shape, dark: editor.theme === "dark", arrow }))}</g>`;
      }
      if (shape.type === "start")
        content = `<circle cx="40" cy="40" r="39" fill="${editor.theme === "dark" ? "#202020" : "#ffffff"}" stroke="${editor.theme === "dark" ? "#e5e5e5" : "#000000"}" stroke-width="2"/><path d="M 32 27 L 52 40 L 32 53 Z" fill="none" stroke="${editor.theme === "dark" ? "#e5e5e5" : "#000000"}" stroke-width="2"/>`;
      else if (shape.type in COMPONENT_CONFIGS && shape.type !== "frame")
        content = await card(editor, shape, locale);
      else
        content = renderToStaticMarkup(
          createElement(NativeSVG, {
            shape,
            dark: editor.theme === "dark",
            source: await inlineImage(resource(editor, shape)),
          }),
        );
      return `<g transform="translate(${transform.x} ${transform.y}) rotate(${(transform.rotation * 180) / Math.PI})" opacity="${shape.opacity}">${content}</g>`;
    }),
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${bounds.x - padding} ${bounds.y - padding} ${width} ${height}">${options.background ? `<rect x="${bounds.x - padding}" y="${bounds.y - padding}" width="${width}" height="${height}" fill="${editor.theme === "dark" ? "#141414" : "#ffffff"}"/>` : ""}${fragments.join("")}</svg>`;
  return { svg, width, height };
}
export async function exportPNG(
  editor: Editor,
  ids: string[],
  options: { background?: boolean; padding?: number; scale?: number } = {},
) {
  const output = await exportSVG(editor, ids, options);
  if (!output)
    throw new LocalizedError({ key: "canvas.theresNothingToExportYet" });
  const scale = Math.max(
    0.05,
    Math.min(
      options.scale ?? 1,
      Math.sqrt(32000000 / (output.width * output.height)),
    ),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(output.width * scale));
  canvas.height = Math.max(1, Math.ceil(output.height * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw new LocalizedError({ key: "canvas.theBrowserCannotExportTheImage" });
  const url = URL.createObjectURL(
    new Blob([output.svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new LocalizedError({ key: "canvas.imageExportFailed" })),
        "image/png",
      ),
    );
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
