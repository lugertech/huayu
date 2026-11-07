import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CaretRight as ChevronRight,
  Copy,
  MagnifyingGlass as Search,
} from "@phosphor-icons/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSiteI18n } from "./i18n";
import { Header, Footer } from "./SiteChrome";
import {
  documentGroups,
  documentsFor,
  documentFor,
  documentLink,
  type Guide,
} from "./content";

function CodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useSiteI18n();
  const block = useRef<HTMLPreElement>(null);
  const [phase, setPhase] = useState<"idle" | "copying" | "copied" | "failed">(
    "idle",
  );
  const state =
    phase === "copied"
      ? t("home.copied")
      : phase === "failed"
        ? t("home.selectTheCodeToCopyIt")
        : "";
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="code-block">
      <pre ref={block}>{children}</pre>
      <button
        aria-label={t("home.copyCode")}
        disabled={phase === "copying"}
        onClick={async () => {
          clearTimeout(timer.current);
          setPhase("copying");
          try {
            await navigator.clipboard.writeText(
              block.current?.textContent || "",
            );
            setPhase("copied");
          } catch {
            setPhase("failed");
          }
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setPhase("idle"), 2400);
        }}
      >
        {state || <Copy size={14} />}
      </button>
      <span className="sr-only" role="status">
        {state}
      </span>
    </div>
  );
}
function headingId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}
function DocSidebar({ guide }: { guide: Guide }) {
  const { t, path: link, locale } = useSiteI18n();
  const [query, setQuery] = useState("");
  const documents = documentsFor(locale);
  const filtered = documents.filter((doc) =>
    `${doc.title} ${doc.content}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="docs-nav-inner">
      <label className="docs-search">
        <Search size={16} />
        <input
          type="search"
          aria-label={t("docs.search.label")}
          placeholder={t("docs.search.placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <nav aria-label={t("home.documentation")}>
        {Object.entries(documentGroups).map(([group, labelKey]) => (
          <div className="docs-nav-group" key={group}>
            {filtered.some((doc) => doc.group === group) && (
              <h2>{t(labelKey)}</h2>
            )}
            {filtered
              .filter((doc) => doc.group === group)
              .map((doc) => (
                <a
                  key={doc.slug}
                  href={link(`docs/${doc.slug}/`)}
                  aria-current={guide.slug === doc.slug ? "page" : undefined}
                >
                  {doc.title}
                  {guide.slug === doc.slug && <span />}
                </a>
              ))}
          </div>
        ))}
        {!filtered.length && (
          <p className="empty-search" role="status">
            {t("home.noMatchingDocuments")}
            <button onClick={() => setQuery("")}>
              {t("home.clearSearch")}
            </button>
          </p>
        )}
      </nav>
    </div>
  );
}
export function Docs({ path }: { path: string }) {
  const { t, path: link, locale } = useSiteI18n();
  const documents = documentsFor(locale);
  const guide = documentFor(path, locale);
  const index = documents.indexOf(guide);
  const headings = [...guide.content.matchAll(/^## (.+)$/gm)].map(
    (match) => match[1],
  );
  useEffect(() => {
    document.title = t("docs.pageTitle", { arg0: guide.title });
  }, [guide.title, t]);
  return (
    <>
      <Header docs />
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <DocSidebar guide={guide} />
        </aside>
        <details className="docs-mobile-nav">
          <summary>
            {t("home.documentation")}
            <ChevronRight size={16} />
          </summary>
          <DocSidebar guide={guide} />
        </details>
        <main className="docs-main" id="main-content">
          <div className="docs-breadcrumb">
            <a href={link("docs/getting-started/")}>{t("navigation.docs")}</a>
            <ChevronRight size={13} />
            <span>{t(documentGroups[guide.group])}</span>
          </div>
          <article className="docs-content">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href ? documentLink(href, locale) : undefined}
                    {...(href && /^https:\/\//.test(href)
                      ? { rel: "noreferrer" }
                      : {})}
                  >
                    {children}
                  </a>
                ),
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                h2: ({ children }) => (
                  <h2 id={headingId(String(children))}>{children}</h2>
                ),
                table: ({ children }) => (
                  <div className="table-scroll">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {guide.content}
            </Markdown>
          </article>
          <nav
            className="docs-pagination"
            aria-label={t("home.adjacentDocuments")}
          >
            {index > 0 ? (
              <a href={link(`docs/${documents[index - 1].slug}/`)}>
                <small>{t("home.previous")}</small>
                <span>{documents[index - 1].title}</span>
              </a>
            ) : (
              <span />
            )}
            {index < documents.length - 1 && (
              <a href={link(`docs/${documents[index + 1].slug}/`)}>
                <small>{t("home.next")}</small>
                <span>
                  {documents[index + 1].title}
                  <ArrowRight size={15} />
                </span>
              </a>
            )}
          </nav>
        </main>
        <aside className="docs-toc" aria-label={t("home.onThisPage")}>
          <span>{t("home.onThisPage")}</span>
          {headings.map((heading) => (
            <a key={heading} href={`#${headingId(heading)}`}>
              {heading.replace(/\*\*/g, "")}
            </a>
          ))}
        </aside>
      </div>
      <Footer />
    </>
  );
}
