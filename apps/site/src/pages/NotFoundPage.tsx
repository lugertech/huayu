import { useEffect } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useSiteI18n } from "../i18n";
import { Header, Footer } from "../components/SiteChrome";

export function NotFoundPage() {
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
