import {
  ArrowUpRight,
  FileText,
  GlobeHemisphereWest,
  Image,
  Sparkle,
} from "@phosphor-icons/react";
import presets from "../../../../../templates/showcase.json";
import { useSiteI18n } from "../../i18n";
import type { ShowcasePreset } from "../../../../../templates/types";

export const featuredExamples = [
  "campaign-poster",
  "storyboard",
  "product-prd",
  "landing-page",
  "study-notes",
  "meeting-minutes",
].map((recipe) =>
  (presets as ShowcasePreset[]).find((preset) => preset.recipe === recipe)!,
);
export type ExampleSummary = (typeof featuredExamples)[number];

export function ExampleCanvas({
  preset,
  selected,
  onSelect,
  compact = false,
}: {
  preset: ExampleSummary;
  selected?: string;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const { locale, t } = useSiteI18n();
  const english = locale === "en";
  const columns = Math.max(...preset.nodes.map((node) => node.column)) + 1;
  const rows = Math.max(...preset.nodes.map((node) => node.row)) + 1;
  const width = columns * 222 + 24;
  const height = rows * 188 + 32;
  const nodes = new Map(preset.nodes.map((node) => [node.id, node]));
  return (
    <div
      className={`workflow-example-canvas ${compact ? "is-compact" : ""}`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <svg
        className="example-connections"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id={`arrow-${preset.recipe}-${compact ? "compact" : "full"}`}
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 L6 3 L0 6" />
          </marker>
        </defs>
        {preset.edges.map(([from, to]) => {
          const start = nodes.get(from)!;
          const end = nodes.get(to)!;
          const x = start.column * 222 + 198;
          const y = start.row * 188 + 104;
          const targetX = end.column * 222 + 24;
          const targetY = end.row * 188 + 104;
          const sameColumn = start.column === end.column;
          const active = selected === from || selected === to;
          return (
            <path
              key={`${from}-${to}`}
              className={active ? "is-active" : ""}
              markerEnd={`url(#arrow-${preset.recipe}-${compact ? "compact" : "full"})`}
              d={
                sameColumn
                  ? `M${x} ${y} C${x + 28} ${y} ${x + 28} ${targetY} ${x} ${targetY}`
                  : `M${x} ${y} C${x + 30} ${y} ${targetX - 30} ${targetY} ${targetX} ${targetY}`
              }
            />
          );
        })}
      </svg>
      {preset.nodes.map((node) => {
        const copy = english ? node.en : node;
        const image = english ? node.preview.enImage : node.preview.image;
        const webImage =
          node.type === "website"
            ? english
              ? preset.showcase?.en.cover
              : preset.showcase?.cover
            : undefined;
        const Icon =
          node.type === "ai-image"
            ? Image
            : node.type === "website"
              ? GlobeHemisphereWest
              : node.type === "instruction"
                ? Sparkle
                : FileText;
        const props = {
          className: `example-canvas-node ${image ? "has-image" : ""} ${node.type === "instruction" ? "is-step" : ""}`,
          style: {
            left: `${((node.column * 222 + 24) / width) * 100}%`,
            top: `${((node.row * 188 + 28) / height) * 100}%`,
            width: `${(174 / width) * 100}%`,
            height: `${(152 / height) * 100}%`,
          },
        };
        const content = (
          <>
            <span className="example-node-heading">
              <Icon size={12} />
              <span>{copy.name}</span>
              {onSelect && <ArrowUpRight size={10} />}
            </span>
            {image || webImage ? (
              <img
                src={image || webImage}
                alt=""
                loading={compact ? "eager" : "lazy"}
              />
            ) : node.type === "chart" ? (
              <svg
                className="example-mini-map"
                viewBox="0 0 174 100"
                aria-hidden="true"
              >
                <path d="M26 50 H67 M67 24 V76 M67 24 H111 M67 50 H111 M67 76 H111" />
                <rect x="10" y="39" width="40" height="22" rx="4" />
                <rect x="103" y="13" width="58" height="20" rx="4" />
                <rect x="103" y="40" width="58" height="20" rx="4" />
                <rect x="103" y="67" width="58" height="20" rx="4" />
              </svg>
            ) : (
              <span className="example-node-text">
                {english ? node.preview.en : node.preview.text}
              </span>
            )}
          </>
        );
        return onSelect ? (
          <button
            {...props}
            key={node.id}
            type="button"
            aria-pressed={selected === node.id}
            onClick={() => onSelect(node.id)}
          >
            {content}
          </button>
        ) : (
          <div {...props} key={node.id}>
            {content}
          </div>
        );
      })}
      {!compact && (
        <span className="example-canvas-watermark">
          {t("app.name")} / {t("home.examples.authored")}
        </span>
      )}
    </div>
  );
}
