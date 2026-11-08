import { type ReactNode } from "react";
import { IconContext } from "@phosphor-icons/react";
import {
  useSiteI18n,
  LocaleContext,
  localeForPath,
  withoutLocale,
} from "./i18n";
import { HomePage } from "./pages/HomePage";
import { hasSiteRoute } from "./routes";

import { NotFoundPage } from "./pages/NotFoundPage";

import { DocsFallback } from "./components/DocsFallback";

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
        <NotFoundPage />
      ) : path.startsWith("/docs") ? (
        documentation || <DocsFallback />
      ) : (
        <HomePage />
      )}
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
