import { Suspense } from "react";
import { matchPath, Outlet, useLocation } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { DocumentTitle } from "./DocumentTitle";
import { Shell } from "./Shell";

const PAGE_TITLES = [
  ["/projects", "navigation.projects"],
  ["/library", "library.title"],
  ["/assets", "assets.title"],
  ["/recordings", "navigation.recordings"],
  ["/recordings/:id/analysis", "recordings.analysis.title"],
] as const;

export function WorkspaceLayout() {
  const { t } = useTranslations();
  const { pathname, search } = useLocation();
  const canvas = pathname.startsWith("/drawing/");
  const shared = canvas && new URLSearchParams(search).has("share");
  const page = PAGE_TITLES.find(([path]) => matchPath(path, pathname));
  const content = (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {!page && <DocumentTitle />}
          {t("api.errors.opening")}
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
  return (
    <>
      {page && <DocumentTitle pageName={t(page[1])} />}
      {shared ? content : <Shell canvas={canvas}>{content}</Shell>}
    </>
  );
}
