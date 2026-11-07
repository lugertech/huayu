import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { APIError } from "@/api/client";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/dialog";
import { Markdown } from "@/Components/common/Markdown";
import { WebPreview } from "@/Components/results/WebPreview";
import { useToast } from "@/Components/common/ToastProvider";
import {
  libraryItemDetail,
  libraryItemName,
  libraryItemUrl,
  downloadLibraryItem,
  type LibraryItem,
} from "./library";

export function LibraryPreview({
  item,
  onClose,
  onMissing,
}: {
  item: LibraryItem;
  onClose: () => void;
  onMissing: () => void;
}) {
  const { t } = useTranslations();
  const { showToast } = useToast();
  const [resource, setResource] = useState<
    | { status: "loading" }
    | { status: "ready"; value: LibraryItem }
    | { status: "error"; error: string }
  >({
    status: "loading",
  });
  const detail = resource.status === "ready" ? resource.value : null;
  const error = resource.status === "error" ? resource.error : "";
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setResource({ status: "loading" });
    libraryItemDetail(item, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResource({ status: "ready", value });
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        if (error instanceof APIError && error.status === 404) {
          setResource({ status: "error", error: t("library.removed") });
          onMissing();
        } else setResource({ status: "error", error: error.message });
      });
    return () => controller.abort();
  }, [item, attempt, t, onMissing]);
  const url = detail ? libraryItemUrl(detail) : undefined;
  const name = libraryItemName(detail || item);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="library-preview-dialog" showCloseButton>
        <header className="library-preview-header">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate pr-7 text-base">
              {name}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate">
              {item.project_name} · {t(`library.kind.${item.kind}`)}
            </DialogDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to={`/drawing/${item.project_id}`}
                  state={{ inspectShapeId: item.shape_id }}
                />
              }
            >
              <ExternalLink />
              {t("library.openInProject")}
            </Button>
            <Button
              variant="outline"
              disabled={!detail || downloading}
              onClick={() => {
                setDownloading(true);
                void downloadLibraryItem(item)
                  .catch((error: Error) =>
                    showToast({
                      title: t("common.downloadFailed"),
                      description: error.message,
                      variant: "destructive",
                    }),
                  )
                  .finally(() => setDownloading(false));
              }}
            >
              {downloading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              {t("library.download")}
            </Button>
          </div>
        </header>
        <div className="library-preview-body">
          {error ? (
            <div className="library-state" role="alert">
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setResource({ status: "loading" });
                  setAttempt((value) => value + 1);
                }}
              >
                {t("library.retry")}
              </Button>
            </div>
          ) : !detail ? (
            <div className="library-state" role="status">
              <Loader2 className="size-5 animate-spin" />
              <span>{t("common.loading")}</span>
            </div>
          ) : detail.kind === "image" && url ? (
            <img className="library-full-image" src={url} alt={name} />
          ) : detail.kind === "website" && detail.content ? (
            <WebPreview html={detail.content} label={name} />
          ) : detail.kind === "audio" && url ? (
            <div className="library-state">
              <audio controls src={url} aria-label={name} />
            </div>
          ) : detail.content ? (
            <div className="library-text-preview">
              <Markdown>{detail.content}</Markdown>
            </div>
          ) : (
            <div className="library-state">
              <FileText className="size-10 text-muted-foreground" />
              <p>{t("library.downloadToView")}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
