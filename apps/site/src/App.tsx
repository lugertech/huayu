import { useEffect, type ReactNode } from "react";
import { ArrowRight, IconContext } from "@phosphor-icons/react";
import {
  useSiteI18n,
  LocaleContext,
  localeForPath,
  withoutLocale,
} from "./i18n";
import { Header, Footer } from "./SiteChrome";
import { Home } from "./Home";
import { hasSiteRoute } from "./routes";

function SiteContent({
  path,
  documentation,
}: {
  path: string;
  documentation?: ReactNode;
}) {
  const { t } = useSiteI18n();
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("home.skipToContent")}
      </a>
      {!hasSiteRoute(path) ? (
        <NotFound />
      ) : path.startsWith("/docs") ? (
        documentation || <DocsFallback />
      ) : (
        <Home />
      )}
    </>
  );
}

function NotFound() {
  const { t, path: link } = useSiteI18n();
  useEffect(() => {
    document.title = t("errors.notFound.metaTitle");
  }, [t]);
  return (
    <>
      <Header />
      <main id="main-content" className="not-found container">
        <span>404 / Huayu</span>
        <h1>{t("errors.notFound.title")}</h1>
        <p>{t("errors.notFound.description")}</p>
        <div className="hero-actions">
          <a className="site-button primary" href={link()}>
            {t("errors.notFound.home")}
            <ArrowRight size={18} />
          </a>
          <a className="text-link" href={link("docs/getting-started/")}>
            {t("errors.notFound.docs")}
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function App({
  path,
  documentation,
}: {
  path: string;
  documentation?: ReactNode;
}) {
  return (
    <LocaleContext value={localeForPath(path)}>
      <IconContext value={{ "aria-hidden": true, weight: "regular" }}>
        <SiteContent path={withoutLocale(path)} documentation={documentation} />
      </IconContext>
    </LocaleContext>
  );
}

export function DocsFallback({ failed = false }: { failed?: boolean }) {
  const { t } = useSiteI18n();
  return (
    <>
      <Header docs />
      <main id="main-content" className="not-found container">
        <h1>{t(failed ? "docs.loadFailed.title" : "docs.loading")}</h1>
        {failed && (
          <>
            <p>{t("docs.loadFailed.description")}</p>
            <button
              className="site-button primary"
              onClick={() => window.location.reload()}
            >
              {t("docs.loadFailed.retry")}
            </button>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
