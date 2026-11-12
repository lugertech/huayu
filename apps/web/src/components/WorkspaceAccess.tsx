import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { LockKeyhole, Loader2 } from "lucide-react";
import { t, useLocale } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { DocumentTitle } from "./DocumentTitle";

export function WorkspaceAccess({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  if (
    pathname.startsWith("/drawing/") &&
    new URLSearchParams(search).has("share")
  )
    return children;
  return <OwnerWorkspace>{children}</OwnerWorkspace>;
}

function OwnerWorkspace({ children }: { children: ReactNode }) {
  useLocale();
  const [access, setAccess] = useState<
    | { status: "checking" | "owner" | "denied" }
    | { status: "error"; error: Error }
  >({ status: "checking" });
  useEffect(() => {
    const controller = new AbortController();
    void api<{ owner: boolean }>("/api/access", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setAccess({ status: value.owner ? "owner" : "denied" });
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted)
          setAccess({ status: "error", error: reason });
      });
    return () => controller.abort();
  }, []);
  if (access.status === "owner") return children;
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <DocumentTitle />
      {access.status === "checking" ? (
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-label={t("common.loading")}
        />
      ) : (
        <>
          <LockKeyhole className="size-8 text-muted-foreground" />
          <h1 className="text-lg font-medium">
            {t("canvas.access.privateWorkspace")}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {access.status === "error"
              ? errorText(access.error)
              : t("canvas.access.openWithLink")}
          </p>
          <Button variant="outline" onClick={() => location.reload()}>
            {t("common.reload")}
          </Button>
        </>
      )}
    </main>
  );
}
