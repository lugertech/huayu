import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Minus,
  Plus,
  X,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import catalog from "../../../templates/catalog.json";
import type { TemplatePreset } from "../../../templates/types";
import {
  ExampleCanvas,
  featuredExamples,
  type ExampleSummary,
} from "./ExampleCanvas";
import { useSiteI18n } from "./i18n";

export default function ExampleExplorer({
  example,
  onChange,
  onClose,
}: {
  example: ExampleSummary;
  onChange: (example: ExampleSummary) => void;
  onClose: () => void;
}) {
  const { t, locale, path } = useSiteI18n();
  const english = locale === "en";
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState(example.showcase!.focus);
  const [mode, setMode] = useState("result");
  const [zoom, setZoom] = useState(100);
  const mapArea = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setMapSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (mapArea.current) observer.observe(mapArea.current);
    return () => observer.disconnect();
  }, []);
  const canvasRatio =
    (Math.max(...example.nodes.map((node) => node.column)) * 222 + 246) /
    (Math.max(...example.nodes.map((node) => node.row)) * 188 + 220);
  const canvasWidth = Math.min(mapSize.width, mapSize.height * canvasRatio);
  const preset = (catalog as TemplatePreset[]).find(
    (item) => item.recipe === example.recipe,
  )!;
  const node = preset.nodes.find((item) => item.id === selected)!;
  const copy = english ? preset.en : preset;
  const nodeCopy = english ? node.en : node;
  const props = { ...node.props, ...(english ? node.en.props : {}) };
  if (node.artwork) {
    const preview = example.nodes.find((item) => item.id === node.id)!.preview;
    props.src = english ? preview.enImage : preview.image;
  }
  const detail = english ? preset.showcase!.en : preset.showcase!;
  const index = featuredExamples.findIndex((item) => item.id === example.id);
  const [appURL, setAppURL] = useState("");
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    closeButton.current?.focus();
    if (["localhost", "127.0.0.1"].includes(window.location.hostname))
      setAppURL(
        `${window.location.protocol}//${window.location.hostname}:5858/projects?template=${example.recipe}`,
      );
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [example.recipe]);
  const content = props.result || nodeCopy.text;
  return (
    <dialog
      ref={dialog}
      className="example-dialog"
      onClose={onClose}
      aria-labelledby="example-dialog-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <header className="example-dialog-header">
        <div>
          <span className="section-kicker">
            {t("home.examples.collection")}
          </span>
          <h2 id="example-dialog-title">{copy.name}</h2>
        </div>
        <div className="example-dialog-actions">
          <span>{String(index + 1).padStart(2, "0")} / 06</span>
          <button
            type="button"
            aria-label={t("home.examples.previous")}
            onClick={() => onChange(featuredExamples[(index + 5) % 6])}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            type="button"
            aria-label={t("home.examples.next")}
            onClick={() => onChange(featuredExamples[(index + 1) % 6])}
          >
            <ArrowRight size={17} />
          </button>
          <button
            type="button"
            ref={closeButton}
            aria-label={t("home.examples.close")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="example-dialog-body">
        <section
          className="example-map-area"
          aria-label={t("home.examples.workflow")}
        >
          <div className="example-stages">
            {detail.stages.map((stage, i) => (
              <span key={stage}>
                <b>0{i + 1}</b>
                {stage}
              </span>
            ))}
          </div>
          <div className="example-map-scroll" ref={mapArea}>
            <div
              style={{
                width: Math.max(1, (canvasWidth * zoom) / 100),
                flexShrink: 0,
                margin: "auto",
              }}
            >
              <ExampleCanvas
                preset={example}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setMode("result");
                }}
              />
            </div>
          </div>
          <div className="example-map-controls">
            <span>{t("home.examples.selectHint")}</span>
            <div>
              <button
                type="button"
                aria-label={t("home.examples.zoomOut")}
                disabled={zoom <= 75}
                onClick={() => setZoom(Math.max(75, zoom - 25))}
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                aria-label={t("home.examples.resetZoom")}
                onClick={() => setZoom(100)}
              >
                {zoom}%
              </button>
              <button
                type="button"
                aria-label={t("home.examples.zoomIn")}
                disabled={zoom >= 250}
                onClick={() => setZoom(Math.min(250, zoom + 25))}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
        </section>
        <section
          className="example-inspector"
          aria-label={t("home.examples.content")}
        >
          <div className="example-inspector-header">
            <span>{t("home.examples.authored")}</span>
            <h3>{nodeCopy.name}</h3>
            <div
              role="tablist"
              aria-label={t("home.examples.contentMode")}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "result"
                    : event.key === "End"
                      ? "prompt"
                      : mode === "result"
                        ? "prompt"
                        : "result";
                setMode(next);
                event.currentTarget
                  .querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)
                  ?.focus();
              }}
            >
              <button
                data-mode="result"
                id="example-result-tab"
                role="tab"
                aria-selected={mode === "result"}
                aria-controls="example-inspector-panel"
                tabIndex={mode === "result" ? 0 : -1}
                onClick={() => setMode("result")}
              >
                {t("home.examples.result")}
              </button>
              <button
                data-mode="prompt"
                id="example-prompt-tab"
                role="tab"
                aria-selected={mode === "prompt"}
                aria-controls="example-inspector-panel"
                tabIndex={mode === "prompt" ? 0 : -1}
                onClick={() => setMode("prompt")}
              >
                {t("home.examples.prompt")}
              </button>
            </div>
          </div>
          <div
            className="example-inspector-content"
            id="example-inspector-panel"
            role="tabpanel"
            aria-labelledby={`example-${mode}-tab`}
            tabIndex={0}
          >
            {mode === "prompt" ? (
              <div className="example-prose">
                <p>{nodeCopy.text}</p>
                <h4>{t("home.examples.materials")}</h4>
                <ul>
                  {preset.edges
                    .filter(([, to]) => to === node.id)
                    .map(([from]) => {
                      const input = preset.nodes.find(
                        (item) => item.id === from,
                      )!;
                      return (
                        <li key={from}>
                          <button
                            className="example-source-link"
                            onClick={() => {
                              setSelected(from);
                              setMode("result");
                            }}
                          >
                            {english ? input.en.name : input.name}
                            <ArrowUpRight size={12} />
                          </button>
                        </li>
                      );
                    })}
                </ul>
                {!preset.edges.some(([, to]) => to === node.id) && (
                  <p>{t("home.examples.editSource")}</p>
                )}
              </div>
            ) : props.src ? (
              <img
                className="example-full-art"
                src={props.src}
                alt={nodeCopy.name}
              />
            ) : props.htmlContent ? (
              <iframe
                key={node.id}
                title={nodeCopy.name}
                srcDoc={props.htmlContent.replace(
                  /<!doctype html>/i,
                  "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'\">",
                )}
                sandbox="allow-scripts allow-forms"
                referrerPolicy="no-referrer"
              />
            ) : props.chartData ? (
              <div className="example-prose">
                <h4>{JSON.parse(props.chartData).content}</h4>
                {(
                  JSON.parse(props.chartData) as {
                    children: Array<{
                      content: string;
                      children: Array<{ content: string }>;
                    }>;
                  }
                ).children.map((branch) => (
                  <div className="example-map-branch" key={branch.content}>
                    <strong>{branch.content}</strong>
                    <ul>
                      {branch.children.map((child) => (
                        <li key={child.content}>{child.content}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="example-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="example-dialog-footer">
        <p>
          {detail.description}
          <span>{t("home.examples.noKey")}</span>
        </p>
        <a
          className="site-button primary"
          href={
            appURL ||
            path(
              `docs/canvas/#${english ? "complete-examples" : "完整作品示例"}`,
            )
          }
        >
          {t("home.examples.use")}
          <ArrowUpRight size={16} />
        </a>
      </footer>
    </dialog>
  );
}
