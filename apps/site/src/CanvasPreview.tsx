import { useRef } from "react";
import {
  ArrowUpRight,
  Coffee,
  BookOpen,
  SquaresFour,
} from "@phosphor-icons/react";
import {
  ExampleCanvas,
  featuredExamples,
  type ExampleSummary,
} from "./ExampleCanvas";
import { useSiteI18n } from "./i18n";

const examples = featuredExamples.slice(0, 3);
const icons = [Coffee, BookOpen, SquaresFour];
export function CanvasPreview({
  view,
  onChange,
  onExplore,
}: {
  view: number;
  onChange: (view: number) => void;
  onExplore: (preset: ExampleSummary) => void;
}) {
  const { locale, t } = useSiteI18n();
  const tabs = useRef<HTMLDivElement>(null);
  const preset = examples[view];
  return (
    <section
      className="creative-canvas rich-hero-canvas"
      aria-label={t("home.canvas.label")}
    >
      <div className="canvas-topbar">
        <span>
          <span className="canvas-project-dot" />
          {locale === "en" ? preset.en.name : preset.name}
        </span>
        <span>{t("home.examples.preview")}</span>
      </div>
      <div
        id="hero-example-panel"
        role="tabpanel"
        aria-labelledby={`example-tab-${view}`}
      >
        <button
          className="hero-example-open"
          onClick={() => onExplore(preset)}
          aria-label={t("home.examples.open", {
            name: locale === "en" ? preset.en.name : preset.name,
          })}
        >
          <ExampleCanvas preset={preset} compact />
          <span className="hero-example-invite">
            {t("home.examples.exploreCanvas")}
            <ArrowUpRight size={15} />
          </span>
        </button>
      </div>
      <div className="canvas-bottom">
        <span>
          {t("home.examples.workflowSize", {
            nodes: String(preset.nodes.length),
            edges: String(preset.edges.length),
          })}
        </span>
        <div
          className="canvas-format-tabs"
          role="tablist"
          aria-label={t("home.examples.choose")}
          ref={tabs}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 2
                  : (view + (event.key === "ArrowLeft" ? 2 : 1)) % 3;
            onChange(next);
            const buttons =
              tabs.current?.querySelectorAll<HTMLButtonElement>("button");
            buttons?.[next]?.focus();
          }}
        >
          {examples.map((example, index) => {
            const Icon = icons[index];
            return (
              <button
                id={`example-tab-${index}`}
                key={example.id}
                role="tab"
                aria-selected={view === index}
                aria-controls="hero-example-panel"
                tabIndex={view === index ? 0 : -1}
                onClick={() => onChange(index)}
              >
                <Icon size={14} />
                {t(
                  (
                    [
                      "home.examples.coffee",
                      "home.examples.story",
                      "home.examples.product",
                    ] as const
                  )[index],
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
