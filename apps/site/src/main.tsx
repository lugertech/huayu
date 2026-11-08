import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { DocsFallback } from "./components/DocsFallback";
import { base } from "./config";
import { localeForPath, withoutLocale } from "./i18n";
import { hasSiteRoute } from "./routes";
import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "./site.css";

const container = document.getElementById("root")!;
const path = `/${window.location.pathname.slice(base.length)}`;
async function start() {
  document.documentElement.lang = localeForPath(path);
  let documentation: ReactNode;
  let hydrate = hasSiteRoute(path);
  if (hasSiteRoute(path) && withoutLocale(path).startsWith("/docs")) {
    try {
      // Static guides remain readable while their interactive code loads.
      const { DocsPage } = await import("./pages/DocsPage");
      documentation = <DocsPage path={withoutLocale(path)} />;
    } catch {
      documentation = <DocsFallback failed />;
      hydrate = false;
    }
  }
  const app = <App path={path} documentation={documentation} />;
  if (hydrate && container.hasChildNodes()) hydrateRoot(container, app);
  else createRoot(container).render(app);
}
void start();
