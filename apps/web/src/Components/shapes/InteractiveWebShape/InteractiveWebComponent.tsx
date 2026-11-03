import { t, useLocale } from "@/i18n";
import { useState } from "react";
import { HTMLContainer, useEditor } from "@/canvas/editor";
import { ExternalLink, Globe, RefreshCw } from "lucide-react";
import type { InteractiveWebShape } from "@/types/components";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { api } from "@/api/client";
import { useToast } from "../../common/ToastProvider";
import { ComponentConnectionDots } from "../../common/ComponentConnectionDots";

export function InteractiveWebComponent({
  shape,
}: {
  shape: InteractiveWebShape;
}) {
  useLocale();
  const editor = useEditor();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(shape.props.url);
  const [version, setVersion] = useState(0);
  async function load() {
    try {
      const url = new URL(draft);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(t("canvas.embed.enterAValidWebAddress"));
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { url: url.toString(), isRunning: true, status: "loading" },
      });
      setVersion((value) => value + 1);
      const data = await api<{
        title: string;
        description: string;
        html?: string;
      }>(
        `/api/unfurl?url=${encodeURIComponent(url.toString())}&includeHtml=true`,
      );
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: {
          title: data.title,
          description: data.description,
          webpageContent: data.html || "",
          result: data.html || url.toString(),
          isRunning: false,
          status: "loaded",
        },
      });
    } catch (error) {
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
    }
  }
  const safeUrl = /^https?:\/\//i.test(shape.props.url) ? shape.props.url : "";
  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: "all",
      }}
    >
      <div className="board-node-surface relative flex h-full flex-col bg-card text-card-foreground">
        <ComponentConnectionDots shape={shape} />
        <div
          className="flex h-11 shrink-0 items-center gap-2 border-b px-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Globe className="size-4 shrink-0" />
          <Input
            aria-label={t("canvas.embed.webAddress")}
            className="h-7 min-w-0 flex-1"
            placeholder="https://"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") load();
            }}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("canvas.embed.readWebPage")}
            disabled={shape.props.isRunning}
            onClick={load}
          >
            <RefreshCw
              className={shape.props.isRunning ? "animate-spin" : ""}
            />
          </Button>
          {safeUrl && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("canvas.embed.openPageInANewWindow")}
              onClick={() =>
                window.open(safeUrl, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink />
            </Button>
          )}
        </div>
        {safeUrl ? (
          <iframe
            key={version}
            src={safeUrl}
            title={shape.props.title || t("canvas.embed.externalPage")}
            sandbox="allow-scripts allow-forms allow-popups"
            referrerPolicy="no-referrer"
            className="min-h-0 w-full flex-1 rounded-b-xl border-0 bg-white"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("canvas.embed.enterAnAddressToOpenAPage")}
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}
