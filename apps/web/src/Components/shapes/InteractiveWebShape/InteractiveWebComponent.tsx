import { useTranslations } from "@/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { HTMLContainer, useEditor } from "@/canvas/editor";
import { ExternalLink, Link2, PanelTop, RefreshCw } from "lucide-react";
import type { InteractiveWebShape } from "@/types/components";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { api } from "@/api/client";
import { useToast } from "../../common/ToastProvider";
import { ComponentHeader } from "../../common/ComponentHeader";

// Baidu Search keeps its origin but loads in a separate browser session.
const baiduSearchOrigins = new Set([
  "https://baidu.com",
  "https://www.baidu.com",
]);

function parseExternalUrl(address: string) {
  try {
    const url = new URL(address);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function InteractiveWebComponent({
  shape,
}: {
  shape: InteractiveWebShape;
}) {
  const { t } = useTranslations();
  const editor = useEditor();
  const { showToast } = useToast();
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  const [draft, setDraft] = useState(shape.props.url);
  const [version, setVersion] = useState(0);
  const [previewChoice, setPreviewChoice] = useState<{
    url: string;
    embedded: boolean;
  }>();
  const page = parseExternalUrl(shape.props.url);
  const pageUrl = page?.href ?? "";
  const preserveOrigin =
    page !== null &&
    page.origin !== globalThis.location?.origin &&
    baiduSearchOrigins.has(page.origin);
  const embedded =
    !!pageUrl &&
    (previewChoice?.url === pageUrl ? previewChoice.embedded : preserveOrigin);
  const title = shape.props.title?.trim() || page?.hostname;
  const load = useCallback(
    async (address: string) => {
      const url = parseExternalUrl(address);
      if (!url) {
        showToast({
          title: t("canvas.embed.enterAValidWebAddress"),
          variant: "destructive",
        });
        return;
      }
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { url: url.href, isRunning: true, status: "loading" },
      });
      try {
        const data = await api<{
          title: string;
          description: string;
          html?: string;
        }>(`/api/unfurl?url=${encodeURIComponent(url.href)}&includeHtml=true`, {
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          request.current !== controller ||
          editor.getShape(shape.id)?.props.url !== url.href
        )
          return;
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          props: {
            title: data.title,
            description: data.description,
            webpageContent: data.html || "",
            result: data.html || data.title || url.href,
            isRunning: false,
            status: "loaded",
          },
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          request.current !== controller ||
          editor.getShape(shape.id)?.props.url !== url.href
        )
          return;
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          props: { isRunning: false, status: "error" },
        });
        showToast({
          title: t("canvas.embed.cannotReadWebPage"),
          description:
            error instanceof Error
              ? error.message
              : t("canvas.embed.checkTheWebAddress"),
          variant: "destructive",
        });
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [editor, shape.id, shape.type, showToast, t],
  );
  useEffect(() => {
    setDraft(shape.props.url);
  }, [shape.props.url]);
  useEffect(() => {
    if (
      pageUrl &&
      (shape.props.status === "idle" || shape.props.status === "loading") &&
      !shape.props.isLocked &&
      !request.current
    )
      void load(pageUrl);
  }, [pageUrl, shape.props.status, shape.props.isLocked, load]);
  const openInTabLabel = t("canvas.embed.openPageInANewWindow");
  const previewLabel = t(
    embedded ? "canvas.embed.backToLinkCard" : "canvas.embed.previewOnCanvas",
  );
  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: "all",
      }}
    >
      <div className="board-node-surface relative flex h-full flex-col overflow-hidden bg-card text-card-foreground">
        <ComponentHeader
          shape={shape}
          compact
          onToggleLock={() =>
            editor.updateShape({
              id: shape.id,
              type: shape.type,
              props: { isLocked: !shape.props.isLocked },
            })
          }
        />
        {page ? (
          <div className="relative flex min-h-0 flex-1 flex-col">
            {embedded ? (
              <iframe
                key={`${pageUrl}:${version}`}
                title={title || t("canvas.embed.externalPage")}
                sandbox={
                  preserveOrigin
                    ? "allow-scripts allow-forms allow-popups allow-same-origin"
                    : "allow-scripts allow-forms allow-popups"
                }
                {...{ credentialless: preserveOrigin }}
                src={pageUrl}
                referrerPolicy="no-referrer"
                className="min-h-0 w-full flex-1 border-0 bg-white"
                style={{
                  pointerEvents:
                    editor.getCurrentToolId() === "arrow" ? "none" : "auto",
                }}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-hidden px-4 py-3">
                <p className="truncate text-base font-medium" title={title}>
                  {title}
                </p>
                {title !== page.hostname && (
                  <p className="truncate text-xs text-muted-foreground">
                    {page.hostname}
                  </p>
                )}
                {shape.props.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {shape.props.description}
                  </p>
                )}
              </div>
            )}
            <div
              data-node-controls
              data-position="bottom-left"
              className={`flex flex-wrap gap-2 ${embedded ? "absolute bottom-3 left-3 z-10" : "shrink-0 px-4 pb-4"}`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Button
                variant="outline"
                size={embedded ? "icon-sm" : "sm"}
                className={embedded ? "node-tool-button" : undefined}
                nativeButton={false}
                render={
                  <a href={pageUrl} target="_blank" rel="noopener noreferrer" />
                }
                title={openInTabLabel}
                aria-label={openInTabLabel}
              >
                <ExternalLink />
                {!embedded && t("canvas.embed.openPage")}
              </Button>
              <Button
                variant={embedded ? "outline" : "ghost"}
                size="sm"
                onClick={() =>
                  setPreviewChoice({ url: pageUrl, embedded: !embedded })
                }
              >
                {embedded ? <Link2 /> : <PanelTop />}
                {previewLabel}
              </Button>
              {embedded && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="node-tool-button"
                  title={t("common.refreshPage")}
                  aria-label={t("common.refreshPage")}
                  onClick={() => setVersion((value) => value + 1)}
                >
                  <RefreshCw />
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-muted-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void load(draft);
            }}
          >
            <ExternalLink className="size-8" aria-hidden="true" />
            <label htmlFor={`web-url-${shape.id}`} className="text-xs">
              {t("canvas.embed.enterAnAddressToOpenAPage")}
            </label>
            <div className="flex w-full max-w-xs items-center gap-1">
              <Input
                id={`web-url-${shape.id}`}
                aria-label={t("canvas.embed.webAddress")}
                className="h-8 min-w-0 flex-1"
                placeholder="https://"
                value={draft}
                disabled={shape.props.isLocked || shape.props.isRunning}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                size="icon-sm"
                className="node-tool-button"
                aria-label={t("canvas.embed.readWebPage")}
                disabled={
                  shape.props.isLocked || shape.props.isRunning || !draft.trim()
                }
              >
                <RefreshCw
                  className={shape.props.isRunning ? "animate-spin" : ""}
                />
              </Button>
            </div>
          </form>
        )}
      </div>
    </HTMLContainer>
  );
}
