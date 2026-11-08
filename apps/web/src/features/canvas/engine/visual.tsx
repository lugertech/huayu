import { t } from "@/i18n";
import type { CanvasShape, VecLike } from "./model";
import { getStroke } from "perfect-freehand";
import { plainText } from "./model";
export const PALETTE = {
  black: "#000000",
  grey: "#9ca3af",
  "light-violet": "#d6b4fc",
  violet: "#8b5cf6",
  blue: "#4263eb",
  "light-blue": "#4dabf7",
  yellow: "#f5c542",
  orange: "#f59e0b",
  green: "#22c55e",
  "light-green": "#86efac",
  "light-red": "#fca5a5",
  red: "#ef4444",
  white: "#ffffff",
};
export function colorFor(color = "black", dark = false) {
  return ["black", "#000", "#000000"].includes(color) && dark
    ? "#e5e5e5"
    : PALETTE[color as keyof typeof PALETTE] ||
        (/^#[0-9a-f]{3,8}$/i.test(color) ? color : PALETTE.black);
}
export function shapeText(shape: CanvasShape) {
  return plainText(shape.props.richText) || shape.props.text || "";
}
export const fontSize = (size: string) =>
  ({ s: 16, m: 22, l: 30, xl: 42 })[size] || 22;
export const strokeWidth = (size: string) =>
  ({ s: 1, m: 2, l: 3, xl: 4 })[size] || 2;
export function freehandPath(
  points: Array<VecLike & { z?: number }>,
  size: string,
  isPen = false,
) {
  const outline = getStroke(
    points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => [point.x, point.y, point.z ?? 0.5]),
    {
      size: strokeWidth(size) * 2,
      thinning: 0.4,
      smoothing: 0.65,
      streamline: 0.5,
      simulatePressure: !isPen,
      last: true,
    },
  );
  if (!outline.length) return "";
  return `M ${outline[0][0]} ${outline[0][1]} ${outline
    .map((point, index) => {
      const next = outline[(index + 1) % outline.length];
      return `Q ${point[0]} ${point[1]} ${(point[0] + next[0]) / 2} ${(point[1] + next[1]) / 2}`;
    })
    .join(" ")} Z`;
}
export const fontFamily = (font: string) =>
  font === "mono"
    ? "monospace"
    : font === "serif"
      ? "serif"
      : '"Geist Variable", "PingFang SC", "Microsoft YaHei", sans-serif';
export function wrapText(text: string, width: number, size: number) {
  const lines: string[] = [];
  for (const line of String(text).split("\n")) {
    let current = "";
    let amount = 0;
    for (const char of line) {
      const span = char.charCodeAt(0) <= 0xff ? size * 0.57 : size;
      if (amount + span > width && current) {
        lines.push(current);
        current = "";
        amount = 0;
      }
      current += char;
      amount += span;
    }
    lines.push(current);
  }
  return lines;
}
export function TextSVG({
  text,
  w,
  h,
  size = 22,
  color = "#171717",
  align = "middle",
  font = "sans",
  vertical = "middle",
}: {
  text: string;
  w: number;
  h: number;
  size?: number;
  color?: string;
  align?: string;
  font?: string;
  vertical?: string;
}) {
  const lines = wrapText(text, Math.max(20, w - 24), size);
  const lineHeight = size * 1.35;
  const count = Math.max(1, Math.floor((h - 12) / lineHeight));
  const visible = lines.slice(0, count);
  const top =
    vertical === "start"
      ? size + 8
      : (h - visible.length * lineHeight) / 2 + size;
  return (
    <text
      fill={color}
      fontSize={size}
      fontFamily={fontFamily(font)}
      textAnchor={
        align === "start" ? "start" : align === "end" ? "end" : "middle"
      }
    >
      {visible.map((line, index) => (
        <tspan
          key={index}
          x={align === "start" ? 12 : align === "end" ? w - 12 : w / 2}
          y={top + index * lineHeight}
        >
          {index === count - 1 && lines.length > count
            ? `${line.slice(0, -1)}…`
            : line}
        </tspan>
      ))}
    </text>
  );
}
function geometryPath(geo: string, w: number, h: number) {
  switch (geo) {
    case "triangle":
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case "diamond":
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    case "pentagon":
    case "hexagon":
    case "octagon": {
      const count = { pentagon: 5, hexagon: 6, octagon: 8 }[geo];
      return (
        Array.from(
          { length: count },
          (_, i) =>
            `${i ? "L" : "M"} ${w / 2 + (Math.cos((i * 2 * Math.PI) / count - Math.PI / 2) * w) / 2} ${h / 2 + (Math.sin((i * 2 * Math.PI) / count - Math.PI / 2) * h) / 2}`,
        ).join(" ") + " Z"
      );
    }
    case "star":
      return (
        Array.from({ length: 10 }, (_, i) => {
          const radius = i % 2 ? 0.43 : 1;
          return `${i ? "L" : "M"} ${w / 2 + ((Math.cos((i * Math.PI) / 5 - Math.PI / 2) * w) / 2) * radius} ${h / 2 + ((Math.sin((i * Math.PI) / 5 - Math.PI / 2) * h) / 2) * radius}`;
        }).join(" ") + " Z"
      );
    case "trapezoid":
      return `M ${w * 0.2} 0 L ${w * 0.8} 0 L ${w} ${h} L 0 ${h} Z`;
    case "rhombus":
      return `M ${w * 0.2} 0 L ${w} 0 L ${w * 0.8} ${h} L 0 ${h} Z`;
    case "arrow-right":
      return `M 0 ${h * 0.25} H ${w * 0.6} V 0 L ${w} ${h / 2} L ${w * 0.6} ${h} V ${h * 0.75} H 0 Z`;
    case "arrow-left":
      return `M ${w} ${h * 0.25} H ${w * 0.4} V 0 L 0 ${h / 2} L ${w * 0.4} ${h} V ${h * 0.75} H ${w} Z`;
    case "arrow-up":
      return `M ${w * 0.25} ${h} V ${h * 0.4} H 0 L ${w / 2} 0 L ${w} ${h * 0.4} H ${w * 0.75} V ${h} Z`;
    case "arrow-down":
      return `M ${w * 0.25} 0 V ${h * 0.6} H 0 L ${w / 2} ${h} L ${w} ${h * 0.6} H ${w * 0.75} V 0 Z`;
    case "cloud":
      return `M ${w * 0.2} ${h * 0.85} C 0 ${h * 0.85} 0 ${h * 0.45} ${w * 0.12} ${h * 0.4} C ${w * 0.04} ${h * 0.08} ${w * 0.35} 0 ${w * 0.48} ${h * 0.14} C ${w * 0.65} ${-h * 0.05} ${w * 0.95} ${h * 0.05} ${w * 0.91} ${h * 0.32} C ${w * 1.08} ${h * 0.45} ${w} ${h * 0.78} ${w * 0.86} ${h * 0.8} C ${w * 0.75} ${h * 1.06} ${w * 0.43} ${h} ${w * 0.4} ${h * 0.88} C ${w * 0.32} ${h * 0.99} ${w * 0.2} ${h} ${w * 0.2} ${h * 0.85} Z`;
    case "heart":
      return `M ${w / 2} ${h} C ${w * 0.35} ${h * 0.82} 0 ${h * 0.55} 0 ${h * 0.25} C 0 ${-h * 0.08} ${w * 0.4} ${-h * 0.08} ${w / 2} ${h * 0.22} C ${w * 0.6} ${-h * 0.08} ${w} ${-h * 0.08} ${w} ${h * 0.25} C ${w} ${h * 0.55} ${w * 0.65} ${h * 0.82} ${w / 2} ${h} Z`;
    default:
      return "";
  }
}
export function NativeSVG({
  shape,
  dark = false,
  source,
  arrow,
}: {
  shape: CanvasShape;
  dark?: boolean;
  source?: string;
  arrow?: { start: VecLike; end: VecLike };
}) {
  const props = shape.props;
  const w = props.w || 200;
  const h = props.h || 200;
  const color = colorFor(props.color, dark);
  const size = strokeWidth(props.size);
  const dash =
    props.dash === "dashed"
      ? `${size * 4} ${size * 3}`
      : props.dash === "dotted"
        ? `0.1 ${size * 3}`
        : undefined;
  const fill =
    props.fill === "none" || !props.fill
      ? "none"
      : props.fill === "semi"
        ? dark
          ? "#242424"
          : "#ffffff"
        : color;
  const style = {
    stroke: color,
    strokeWidth: size,
    strokeDasharray: dash,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill,
    fillOpacity: props.fill === "solid" ? 0.18 : 1,
  };
  if (shape.type === "geo") {
    const path = geometryPath(props.geo, w, h);
    const patternId = `hatch-${shape.id.replace(/[^a-zA-Z0-9]/g, "")}`;
    if (props.fill === "pattern") style.fill = `url(#${patternId})`;
    return (
      <g>
        {props.fill === "pattern" && (
          <defs>
            <pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              width={8}
              height={8}
            >
              <path
                d="M 0 8 L 8 0"
                stroke={color}
                strokeWidth={1}
                opacity={0.3}
              />
            </pattern>
          </defs>
        )}
        {["ellipse", "oval"].includes(props.geo) ? (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={w / 2 - 2}
            ry={h / 2 - 2}
            {...style}
          />
        ) : path ? (
          <path d={path} {...style} />
        ) : (
          <rect
            x={2}
            y={2}
            width={Math.max(1, w - 4)}
            height={Math.max(1, h - 4)}
            rx={
              props.geo === "cloud"
                ? Math.min(w, h) * 0.3
                : props.geo === "rectangle"
                  ? 0
                  : 8
            }
            {...style}
          />
        )}
        {props.geo === "check-box" && (
          <path
            d={`M ${w * 0.2} ${h * 0.5} L ${w * 0.42} ${h * 0.72} L ${w * 0.82} ${h * 0.25}`}
            stroke={color}
            strokeWidth={size}
            fill="none"
          />
        )}
        {props.geo === "x-box" && (
          <path
            d={`M ${w * 0.18} ${h * 0.18} L ${w * 0.82} ${h * 0.82} M ${w * 0.82} ${h * 0.18} L ${w * 0.18} ${h * 0.82}`}
            stroke={color}
            strokeWidth={size}
            fill="none"
          />
        )}
        <TextSVG
          text={shapeText(shape)}
          w={w}
          h={h}
          size={fontSize(props.size)}
          color={color}
          align={props.textAlign}
          font={props.font}
          vertical={props.verticalAlign}
        />
      </g>
    );
  }
  if (shape.type === "text")
    return (
      <TextSVG
        text={shapeText(shape)}
        w={w}
        h={h}
        size={fontSize(props.size) * (props.scale || 1)}
        color={color}
        align={props.textAlign || "start"}
        font={props.font}
        vertical="start"
      />
    );
  if (shape.type === "note")
    return (
      <g>
        <rect
          width={w}
          height={h}
          rx={3}
          fill={colorFor(props.color)}
          fillOpacity={0.3}
          stroke={colorFor(props.color)}
          strokeWidth={1}
        />
        <TextSVG
          text={shapeText(shape)}
          w={w}
          h={h}
          size={fontSize(props.size)}
          color={dark ? "#f5f5f5" : "#292524"}
          align={props.textAlign}
          font={props.font}
        />
      </g>
    );
  if (shape.type === "draw" || shape.type === "highlight")
    return (
      <g>
        {(props.segments || []).map((segment: any, index: number) =>
          shape.type === "draw" ? (
            <path
              key={index}
              d={freehandPath(segment.points || [], props.size, props.isPen)}
              fill={color}
            />
          ) : (
            <polyline
              key={index}
              points={(segment.points || [])
                .map((point: VecLike) => `${point.x},${point.y}`)
                .join(" ")}
              fill={props.isClosed ? color : "none"}
              stroke={color}
              strokeWidth={shape.type === "highlight" ? size * 7 : size}
              strokeOpacity={shape.type === "highlight" ? 0.3 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
        )}
      </g>
    );
  if (shape.type === "line")
    return (
      <polyline
        points={Object.values(props.points || {})
          .sort((a: any, b: any) =>
            String(a.index).localeCompare(String(b.index)),
          )
          .map((point: any) => `${point.x},${point.y}`)
          .join(" ")}
        {...style}
        fill="none"
      />
    );
  if (shape.type === "arrow") {
    const start = arrow?.start || props.start || { x: 0, y: 0 };
    const end = arrow?.end || props.end || { x: 160, y: 0 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = props.bend || 0;
    const control = {
      x: (start.x + end.x) / 2 - (dy / length) * bend * 2,
      y: (start.y + end.y) / 2 + (dx / length) * bend * 2,
    };
    function head(point: VecLike, previous: VecLike, type: string) {
      if (!type || type === "none") return null;
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
      const amount = 10 + size * 2;
      if (type === "dot")
        return <circle cx={point.x} cy={point.y} r={amount / 3} fill={color} />;
      const left = {
        x: point.x - Math.cos(angle - 0.5) * amount,
        y: point.y - Math.sin(angle - 0.5) * amount,
      };
      const right = {
        x: point.x - Math.cos(angle + 0.5) * amount,
        y: point.y - Math.sin(angle + 0.5) * amount,
      };
      return (
        <path
          d={`M ${left.x} ${left.y} L ${point.x} ${point.y} L ${right.x} ${right.y}${type === "triangle" ? " Z" : ""}`}
          fill={type === "triangle" ? color : "none"}
          stroke={color}
          strokeWidth={size}
          strokeLinecap="round"
        />
      );
    }
    return (
      <g>
        <path
          d={`M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`}
          stroke={color}
          strokeWidth={size}
          strokeDasharray={dash}
          fill="none"
        />
        {head(start, control, props.arrowheadStart)}
        {head(end, control, props.arrowheadEnd)}
        {(props.text || shapeText(shape)) && (
          <text
            x={control.x}
            y={control.y - 8}
            fill={color}
            fontSize={18}
            textAnchor="middle"
          >
            {props.text || shapeText(shape)}
          </text>
        )}
      </g>
    );
  }
  if (shape.type === "image" && source)
    return (
      <image
        href={source}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  if (shape.type === "frame")
    return (
      <g>
        <rect
          width={w}
          height={h}
          fill={dark ? "#141414" : "#ffffff"}
          stroke={color}
          strokeWidth={size}
        />
        <text x={0} y={-10} fontSize={14} fill={color}>
          {props.name || t("canvas.frame")}
        </text>
      </g>
    );
  return (
    <g>
      <rect
        width={w}
        height={h}
        rx={8}
        fill={dark ? "#202020" : "#fafafa"}
        stroke={dark ? "#e5e5e5" : "#000000"}
        strokeWidth={2}
      />
      <TextSVG
        text={props.name || props.url || shape.type}
        w={w}
        h={h}
        size={16}
        color={color}
      />
    </g>
  );
}
