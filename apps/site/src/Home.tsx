import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Fingerprint,
  FlowArrow,
  GlobeHemisphereWest,
  Image,
  Layout,
  Play,
  Plus,
  VideoCamera,
} from "@phosphor-icons/react";
import { useSiteI18n } from "./i18n";
import { sitePath } from "./config";
import { Header, Footer } from "./SiteChrome";
import { RecordingDemo } from "./RecordingDemo";
import { CanvasPreview } from "./CanvasPreview";
import { usePageReveals } from "./motion";
import { featuredExamples, type ExampleSummary } from "./ExampleCanvas";

const ExampleExplorer = lazy(() => import("./ExampleExplorer"));

const views = [
  {
    title: "home.showcase.text.title",
    Icon: FileText,
    image: "text",
    caption: "home.showcase.text.caption",
  },
  {
    title: "home.showcase.image.title",
    Icon: Image,
    image: "image",
    caption: "home.showcase.image.caption",
  },
  {
    title: "home.showcase.web.title",
    Icon: GlobeHemisphereWest,
    image: "web",
    caption: "home.showcase.web.caption",
  },
] as const;
export function Home() {
  const { t, path: link, locale } = useSiteI18n();
  const [canvasView, setCanvasView] = useState(0);
  const [exploring, setExploring] = useState<ExampleSummary | null>(null);
  const exampleTrigger = useRef<HTMLElement | null>(null);
  function openExample(preset: ExampleSummary) {
    exampleTrigger.current = document.activeElement as HTMLElement | null;
    setExploring(preset);
  }
  useEffect(() => {
    if (!exploring) exampleTrigger.current?.focus();
  }, [exploring]);
  const [view, setView] = useState(0);
  const [verticalTabs, setVerticalTabs] = useState(true);
  const tabs = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  usePageReveals(main);
  useEffect(() => {
    const media = matchMedia("(min-width: 761px)");
    const sync = () => setVerticalTabs(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <>
      <Header />
      <main id="main-content" className="home-page" ref={main}>
        <section className="hero container">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="quiet-dot" />
              {t("home.hero.eyebrow")}
            </span>
            <h1 aria-label={t("home.hero.newTitle")}>
              <span>{t("home.hero.newTitleFirst")}</span>
              <span className="hero-title-ending">
                {t("home.hero.newTitleSecond")}
              </span>
            </h1>
            <p className="hero-description">{t("home.hero.newDescription")}</p>
            <div className="hero-actions">
              <a
                className="site-button primary"
                href={link("docs/getting-started/")}
              >
                {t("home.startUsingHuayu")}
                <ArrowUpRight size={18} />
              </a>
              <a className="site-button secondary" href="#workspace">
                <Play size={15} weight="fill" />
                {t("home.seeHowItWorks")}
              </a>
            </div>
            <div className="hero-reassurance">
              <span>
                <Check size={14} />
                {t("home.hero.noAccount")}
              </span>
              <span>
                <Check size={14} />
                {t("home.savedLocally")}
              </span>
              <a href={link("docs/licensing/")}>
                {t("home.hero.openSource")}
                <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
          <div className="hero-product">
            <CanvasPreview
              view={canvasView}
              onChange={setCanvasView}
              onExplore={openExample}
            />
            <p className="hero-product-caption">
              <span className="quiet-dot" />
              {t("home.hero.demoHint")}
              <ArrowDown size={13} />
            </p>
          </div>
        </section>

        <section
          className="process-strip container"
          aria-label={t("home.howToCreate")}
        >
          {(
            [
              {
                Icon: Layout,
                title: "home.letMaterialsMeet",
                description: "home.process.collect.description",
              },
              {
                Icon: FlowArrow,
                title: "home.process.connectTitle",
                description: "home.process.create.description",
              },
              {
                Icon: FileText,
                title: "home.process.refineTitle",
                description: "home.process.refine.description",
              },
            ] as const
          ).map(({ Icon, title, description }, index) => (
            <div className="process-step" key={title}>
              <span className="process-icon">
                <Icon size={22} />
              </span>
              <div>
                <span className="step-number">0{index + 1}</span>
                <h2>{t(title)}</h2>
                <p>{t(description)}</p>
              </div>
            </div>
          ))}
        </section>

        <section
          className="workspace-showcase container section-space"
          id="workspace"
          aria-labelledby="workspace-title"
          data-reveal
        >
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                {t("home.buildOnWhatYouCreate")}
              </span>
              <h2 id="workspace-title">{t("home.showcase.newTitle")}</h2>
            </div>
            <p>{t("home.showcase.newDescription")}</p>
          </div>
          <div className="showcase-layout">
            <div className="showcase-copy">
              <div
                ref={tabs}
                role="tablist"
                aria-orientation={verticalTabs ? "vertical" : "horizontal"}
                aria-label={t("home.workTypes")}
                className="showcase-tabs"
                onKeyDown={(event) => {
                  const keys = verticalTabs
                    ? ["ArrowUp", "ArrowDown", "Home", "End"]
                    : ["ArrowLeft", "ArrowRight", "Home", "End"];
                  if (!keys.includes(event.key)) return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 2
                        : (view +
                            (["ArrowLeft", "ArrowUp"].includes(event.key)
                              ? 2
                              : 1)) %
                          3;
                  setView(next);
                  const buttons =
                    tabs.current?.querySelectorAll<HTMLButtonElement>("button");
                  buttons?.[next]?.focus();
                }}
              >
                {views.map(({ title, Icon, caption }, index) => (
                  <button
                    key={title}
                    id={`view-${index}`}
                    role="tab"
                    aria-selected={view === index}
                    aria-controls="work-preview"
                    tabIndex={view === index ? 0 : -1}
                    onClick={() => setView(index)}
                  >
                    <span className="showcase-tab-heading">
                      <Icon size={20} />
                      <strong>{t(title)}</strong>
                      <ArrowUpRight size={15} />
                    </span>
                    <span className="showcase-tab-description">
                      {t(caption)}
                    </span>
                  </button>
                ))}
              </div>
              <a className="text-link" href={link("docs/canvas/")}>
                {t("home.process.exploreCanvas")}
                <ArrowRight size={16} />
              </a>
            </div>
            <div className="showcase-stage">
              <div className="showcase-window">
                <div className="showcase-toolbar">
                  <span>
                    <span className="window-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    {t("home.huayuCreativeWorkspace")}
                  </span>
                  <span>
                    <Check size={12} />
                    {t("home.savedLocally")}
                  </span>
                </div>
                <div
                  className="showcase-body"
                  role="tabpanel"
                  id="work-preview"
                  aria-labelledby={`view-${view}`}
                  tabIndex={0}
                >
                  <picture key={`${locale}-${view}`}>
                    <source
                      media="(max-width: 760px)"
                      width={390}
                      height={844}
                      srcSet={sitePath(
                        `images/${locale === "en" ? "en/" : ""}results-${views[view].image}-mobile.jpg`,
                      )}
                    />
                    <img
                      src={sitePath(
                        `images/${locale === "en" ? "en/" : ""}results-${views[view].image}.jpg`,
                      )}
                      width={1280}
                      height={720}
                      loading="lazy"
                      alt={t("home.showcase.imageAlt", {
                        arg0: t(views[view].title),
                      })}
                    />
                  </picture>
                </div>
              </div>
              <p className="screenshot-note">{t("home.showcase.note")}</p>
            </div>
          </div>
        </section>

        <section
          className="template-section section-space"
          id="templates"
          aria-labelledby="templates-title"
          data-reveal
        >
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  {t("home.templates.eyebrow")}
                </span>
                <h2 id="templates-title">{t("home.templates.title")}</h2>
              </div>
              <a
                className="text-link"
                href={link(
                  `docs/canvas/#${locale === "en" ? "template-library" : "模板库"}`,
                )}
              >
                {t("home.templates.explore")}
                <ArrowRight size={16} />
              </a>
            </div>
            <p className="example-section-description">
              {t("home.examples.introduction")}
            </p>
            <div className="work-examples-grid">
              {featuredExamples.map((preset, index) => {
                const copy = locale === "en" ? preset.en : preset;
                const detail =
                  locale === "en" ? preset.showcase!.en : preset.showcase!;
                return (
                  <button
                    className="work-example-card"
                    key={preset.id}
                    onClick={() => openExample(preset)}
                    aria-label={t("home.examples.open", { name: copy.name })}
                  >
                    <div
                      className="work-example-visual"
                      style={
                        {
                          "--example-accent": preset.showcase!.accent,
                        } as React.CSSProperties
                      }
                    >
                      <span className="work-example-number">
                        0{index + 1} / HUAYU
                      </span>
                      <div className="work-example-inputs">
                        {preset.nodes.slice(0, 3).map((node) => (
                          <span key={node.id}>
                            <FileText size={12} />
                            {locale === "en" ? node.en.name : node.name}
                          </span>
                        ))}
                        <span className="work-example-connector">
                          <FlowArrow size={21} />
                          {t("home.examples.connected")}
                        </span>
                      </div>
                      <img src={detail.cover} alt="" loading="lazy" />
                      <span className="work-example-open">
                        <ArrowUpRight size={18} />
                      </span>
                    </div>
                    <div className="work-example-copy">
                      <span className="template-tag">
                        {copy.tag}
                        <span>
                          {t("home.examples.nodeCount", {
                            count: String(preset.nodes.length),
                          })}
                        </span>
                      </span>
                      <h3>{copy.name}</h3>
                      <p>{copy.description}</p>
                      <span className="work-example-action">
                        {t("home.examples.explore")}
                        <ArrowRight size={15} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="recording-section container section-space"
          id="recording"
          aria-labelledby="recording-title"
          data-reveal
        >
          <div className="recording-copy">
            <span className="section-kicker">
              <VideoCamera size={16} />
              {t("home.turnMomentsIntoMaterial")}
            </span>
            <h2 id="recording-title">{t("home.recording.newTitle")}</h2>
            <p>{t("home.recording.newDescription")}</p>
            <ol className="recording-steps">
              {(
                [
                  "home.recording.stepRecord",
                  "home.recording.stepReview",
                  "home.recording.stepCreate",
                ] as const
              ).map((key, index) => (
                <li key={key}>
                  <span>0{index + 1}</span>
                  {t(key)}
                </li>
              ))}
            </ol>
            <a className="text-link" href={link("docs/recording/")}>
              {t("home.exploreRecordingsAndAnalysis")}
              <ArrowRight size={16} />
            </a>
          </div>
          <RecordingDemo />
        </section>

        <section
          className="ownership container"
          aria-labelledby="ownership-title"
          data-reveal
        >
          <div className="section-heading">
            <div>
              <span className="section-kicker">{t("home.yourSpace")}</span>
              <h2 id="ownership-title">{t("home.ownership.newTitle")}</h2>
            </div>
            <a className="text-link" href={link("docs/security/")}>
              {t("home.privacy.readMore")}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="ownership-points">
            {(
              [
                {
                  Icon: Fingerprint,
                  title: "home.savedLocally",
                  description: "home.privacy.local.description",
                },
                {
                  Icon: FlowArrow,
                  title: "home.connectFreely",
                  description: "home.privacy.models.description",
                },
                {
                  Icon: Layout,
                  title: "home.aFamiliarCanvas",
                  description: "home.privacy.canvas.description",
                },
              ] as const
            ).map(({ Icon, title, description }) => (
              <article key={title}>
                <Icon size={24} />
                <h3>{t(title)}</h3>
                <p>{t(description)}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="faq-section container section-space"
          aria-labelledby="faq-title"
          data-reveal
        >
          <div>
            <span className="section-kicker">{t("home.beforeYouBegin")}</span>
            <h2 id="faq-title">{t("home.faq.newTitle")}</h2>
            <a className="text-link" href={link("docs/faq/")}>
              {t("home.faq.moreHelp")}
              <ArrowRight size={16} />
            </a>
          </div>
          <div className="faq-list">
            {(
              [
                ["home.faq.models.question", "home.faq.models.answer"],
                ["home.faq.storage.question", "home.faq.storage.answer"],
                ["home.faq.account.question", "home.faq.account.answer"],
                [
                  "home.faq.collaboration.question",
                  "home.faq.collaboration.answer",
                ],
                ["home.faq.export.question", "home.faq.export.answer"],
              ] as const
            ).map(([question, answer]) => (
              <details key={question} name="home-faq">
                <summary>
                  {t(question)}
                  <Plus size={17} />
                </summary>
                <p>{t(answer)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closing container" data-reveal>
          <div>
            <span className="section-kicker">
              {t("home.aCanvasForYourNextIdea")}
            </span>
            <h2>{t("home.closing.newTitle")}</h2>
            <p>{t("home.closing.description")}</p>
          </div>
          <div className="closing-actions">
            <a className="site-button" href={link("docs/getting-started/")}>
              {t("home.startUsingHuayu")}
              <ArrowUpRight size={18} />
            </a>
            <a className="text-link" href={link("docs/models/")}>
              {t("home.closing.modelGuide")}
              <ArrowRight size={15} />
            </a>
          </div>
        </section>
      </main>
      <Footer />
      {exploring && (
        <Suspense
          fallback={
            <div className="example-loading" role="status">
              {t("home.examples.loading")}
            </div>
          }
        >
          <ExampleExplorer
            key={exploring.recipe}
            example={exploring}
            onChange={setExploring}
            onClose={() => setExploring(null)}
          />
        </Suspense>
      )}
    </>
  );
}
