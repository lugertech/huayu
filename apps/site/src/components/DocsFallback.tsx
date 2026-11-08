import { useSiteI18n } from "../i18n";
import { Header, Footer } from "./SiteChrome";

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
