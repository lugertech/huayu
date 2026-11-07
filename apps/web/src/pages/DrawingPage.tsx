import { useTranslations } from "@/i18n";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { ShellSidebarTrigger } from "@/Components/Shell";
import { CanvasPageLayout } from "@/Components/canvas/CanvasPageLayout";
import { api, APIError, type Project } from "@/api/client";
import type { CollaborationExit } from "@/canvas/sync";
import { readDraft, canvasDraftKey, readView } from "@/canvas/drafts";
import { Button } from "@/ui/button";
import { CollaborationNotice } from "./CollaborationNotice";
import type { DrawingCanvasProps } from "./DrawingCanvas";

const loadCanvas = () => import("./DrawingCanvas");

export function DrawingPage() {
  const { t } = useTranslations();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("share");
  const { id } = useParams();
  const [load, setLoad] = useState<
    | { status: "loading"; key: string }
    | {
        status: "ready";
        key: string;
        Canvas: typeof import("./DrawingCanvas").DrawingCanvas;
        props: Omit<DrawingCanvasProps, "shareToken">;
      }
    | {
        status: "error";
        key: string;
        error: string;
        exitReason: CollaborationExit | null;
      }
  >({ status: "loading", key: `${id}:${shareToken}` });
  const key = `${id}:${shareToken}`;
  const loaded = load.key === key && load.status === "ready" ? load : null;
  const failure = load.key === key && load.status === "error" ? load : null;
  const error = failure?.error;
  const exitReason = failure?.exitReason;
  useEffect(() => {
    let cancelled = false;
    const requestKey = `${id}:${shareToken}`;
    setLoad({ status: "loading", key: requestKey });
    Promise.all([
      api<Project>(
        `/api/projects/${id}${shareToken === null ? "" : `?share=${encodeURIComponent(shareToken)}`}`,
      ),
      readDraft(canvasDraftKey(id!, shareToken)).catch(() => undefined),
      readView(id).catch(() => undefined),
      loadCanvas(),
    ])
      .then(async ([project, draft, view, module]) => {
        const initializeRecipe =
          !project.document && !draft && project.recipe
            ? (await import("@/canvas/recipes")).applyRecipe
            : undefined;
        if (!cancelled)
          setLoad({
            status: "ready",
            key: `${id}:${shareToken}`,
            Canvas: module.DrawingCanvas,
            props: { project, draft, view, initializeRecipe },
          });
      })
      .catch((error) => {
        if (!cancelled) {
          setLoad({
            status: "error",
            key: requestKey,
            error: error.message,
            exitReason:
              error instanceof APIError
                ? error.code === "COLLABORATOR_REMOVED"
                  ? "removed"
                  : error.code === "ROOM_FULL"
                    ? "full"
                    : error.code === "COLLABORATION_CLOSED"
                      ? "closed"
                      : null
                : null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, shareToken]);
  if (!loaded || loaded.key !== key)
    return (
      <CanvasPageLayout shared={shareToken !== null}>
        {shareToken === null && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
            <ShellSidebarTrigger />
            <Link
              to="/projects"
              aria-label={t("navigation.backToProjects")}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        )}
        <div className="flex h-full flex-col items-center justify-center gap-4">
          {exitReason ? (
            <CollaborationNotice reason={exitReason} />
          ) : error ? (
            <>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={() => location.reload()}>
                {t("common.reload")}
              </Button>
            </>
          ) : (
            <Loader2
              className="size-6 animate-spin text-muted-foreground"
              aria-label={t("canvas.openingCanvas")}
            />
          )}
        </div>
      </CanvasPageLayout>
    );
  return <loaded.Canvas key={key} {...loaded.props} shareToken={shareToken} />;
}
