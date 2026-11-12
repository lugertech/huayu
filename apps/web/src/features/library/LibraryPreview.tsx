import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AudioLines,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Maximize,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "@/i18n";
import { errorText, LocalizedError } from "@/i18n/errors";
import { APIError } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/common/Markdown";
import { useToast } from "@/components/common/ToastProvider";
import {
  libraryItemDetail,
  libraryItemName,
  libraryItemUrl,
  downloadLibraryItem,
  type LibraryItem,
} from "./library";

const previewIcons = {
  image: ImageIcon,
  document: FileText,
  audio: AudioLines,
};

export function LibraryPreview({
  item,
  onClose,
  onMissing,
}: {
  item: LibraryItem;
  onClose: () => void;
  onMissing: () => void;
}) {
  const { t, locale } = useTranslations();
  const { showToast } = useToast();
  const [resource, setResource] = useState<
    | { status: "loading" }
    | { status: "ready"; value: LibraryItem }
    | { status: "error"; error: Error }
  >({
    status: "loading",
  });
  const detail = resource.status === "ready" ? resource.value : null;
  const error = resource.status === "error" ? resource.error : "";
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [originalSize, setOriginalSize] = useState(false);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string>();
  const imageViewport = useRef<HTMLDivElement>(null);
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
          setResource({
            status: "error",
            error: new LocalizedError({ key: "library.removed" }),
          });
          onMissing();
        } else setResource({ status: "error", error });
      });
    return () => controller.abort();
  }, [item, attempt, onMissing]);
  const url = detail ? libraryItemUrl(detail) : undefined;
  const name = libraryItemName(detail || item);
  const kind = detail?.kind ?? item.kind;
  const Icon = previewIcons[kind];
  const imageUrl = kind === "image" ? url : undefined;
  const imageReady = !!imageUrl && loadedImageUrl === imageUrl;
  const canScrollImage = !!imageUrl && originalSize;

  useLayoutEffect(() => {
    const viewport = imageViewport.current;
    if (!viewport || !imageReady) return;
    // Keep the center of the fitted image in view when switching to 100%.
    viewport.scrollTo(
      originalSize ? (viewport.scrollWidth - viewport.clientWidth) / 2 : 0,
      originalSize ? (viewport.scrollHeight - viewport.clientHeight) / 2 : 0,
    );
  }, [imageReady, originalSize]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="library-preview-dialog"
        data-kind={kind}
        showCloseButton={false}
      >
        <header className="library-preview-header">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="library-preview-icon" aria-hidden="true">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm leading-5" title={name}>
                {name}
              </DialogTitle>
              <DialogDescription
                className="truncate text-xs leading-4"
                title={item.project_name}
              >
                {item.project_name}
              </DialogDescription>
            </div>
          </div>
          <div className="library-preview-actions">
            {kind === "image" && (
              <div
                className="library-image-size-controls"
                role="group"
                aria-label={t("results.image.imageViewer")}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("results.image.fitImageToWindow")}
                  title={t("results.image.fitImageToWindow")}
                  aria-pressed={!originalSize}
                  disabled={!imageReady}
                  onClick={() => setOriginalSize(false)}
                >
                  <Maximize />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1.5 tabular-nums"
                  aria-label={t("results.image.originalSize")}
                  title={t("results.image.originalSize")}
                  aria-pressed={originalSize}
                  disabled={!imageReady}
                  onClick={() => setOriginalSize(true)}
                >
                  {new Intl.NumberFormat(locale, { style: "percent" }).format(
                    1,
                  )}
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="sm:w-auto sm:gap-1.5 sm:px-2.5"
              aria-label={t("library.openInProject")}
              title={t("library.openInProject")}
              nativeButton={false}
              render={
                <Link
                  to={`/drawing/${item.project_id}`}
                  state={{ inspectShapeId: item.shape_id }}
                />
              }
            >
              <ExternalLink />
              <span className="hidden sm:inline">
                {t("library.openInProject")}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="sm:w-auto sm:gap-1.5 sm:px-2.5"
              aria-label={t("library.download")}
              title={t("library.download")}
              aria-busy={downloading}
              disabled={!detail || downloading}
              onClick={() => {
                setDownloading(true);
                void downloadLibraryItem(item)
                  .catch((error: Error) =>
                    showToast({
                      title: t("common.downloadFailed"),
                      description: errorText(error, locale),
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
              <span className="hidden sm:inline">{t("library.download")}</span>
            </Button>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.close")}
                  title={t("common.close")}
                />
              }
            >
              <X />
            </DialogClose>
          </div>
        </header>
        <div
          ref={imageViewport}
          className="library-preview-body"
          data-image-size={
            imageUrl ? (originalSize ? "original" : "fit") : undefined
          }
          tabIndex={canScrollImage ? 0 : undefined}
          aria-label={canScrollImage ? name : undefined}
          role={canScrollImage ? "region" : undefined}
        >
          {error ? (
            <div className="library-state" role="alert">
              <p>{errorText(error, locale)}</p>
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
          ) : imageUrl ? (
            <>
              <img
                className="library-full-image"
                src={imageUrl}
                alt={name}
                draggable={false}
                onLoad={() => setLoadedImageUrl(imageUrl)}
                onError={() => {
                  setLoadedImageUrl(undefined);
                  setResource({
                    status: "error",
                    error: new LocalizedError({
                      key: "results.image.imageCannotBeLoaded",
                    }),
                  });
                }}
              />
              {!imageReady && (
                <div
                  className="absolute inset-0 grid place-items-center"
                  role="status"
                  aria-label={t("common.loading")}
                >
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}
            </>
          ) : detail.kind === "audio" && url ? (
            <div className="library-audio-preview">
              <audio controls preload="metadata" src={url} aria-label={name} />
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
