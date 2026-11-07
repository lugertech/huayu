import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { t } from "@/i18n";
import { Shell } from "./Shell";
export function WorkspaceLayout() {
  const { pathname, search } = useLocation();
  const canvas = pathname.startsWith("/drawing/");
  const shared = canvas && new URLSearchParams(search).has("share");
  const content = (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("api.errors.opening")}
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
  return shared ? content : <Shell canvas={canvas}>{content}</Shell>;
}
