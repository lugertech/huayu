import { errorText } from "@/i18n/errors";
import { useTranslations, formatNumber, type MessageKey } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  ImageIcon,
  Lock,
  Pencil,
  X,
  History,
} from "lucide-react";
import { useEditor, type CanvasShape } from "@/features/canvas/editor";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/common/Markdown";
import { useToast } from "@/components/common/ToastProvider";
import { blobForSource } from "@/api/backend";
import { downloadBlob, uploadAsset } from "@/api/client";
import {
  requestInspection,
  focusShapes,
  materialLabel,
} from "@/workflow/context";
import { useNodeBusy } from "@/workflow/execute";
import { resultIsStale } from "@/workflow/freshness";
import {
  createImageRevision,
  previousRevision,
  readResultDraft,
  resultDraftKey,
  resultKind,
  resultSource,
  resultText,
  saveResultEdit,
  type ResultDraft,
  resultVersions,
} from "@/workflow/results";
import { ImageViewer } from "./ImageViewer";
import { WebPreview } from "./WebPreview";
import { croppedImage, fullCrop, rotateImage } from "./image-edit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ResultWorkbench({
  shape,
  projectId,
  onInspect,
  onClose,
}: {
  shape: CanvasShape;
  projectId: string;
  onInspect: (id: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useTranslations();
  const editor = useEditor();
  const { showToast } = useToast();
  const kind = resultKind(shape)!;
  const storageKey = resultDraftKey(
    projectId,
    editor.getCurrentPageId(),
    shape.id,
  );
  const [draft, setDraft] = useState<ResultDraft>(() => {
    try {
      return readResultDraft(localStorage.getItem(storageKey), shape);
    } catch {
      return readResultDraft(null, shape);
    }
  });
  const [view, setView] = useState<"read" | "edit">(() =>
    draft.content !== draft.base ? "edit" : "read",
  );
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<Error | MessageKey | null>(null);
  const errorMessage =
    error instanceof Error ? errorText(error, locale) : error && t(error);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const sourceRunning = useNodeBusy(editor, shape.id);
  const live = resultText(shape);
  const draftPhase =
    draft.content === draft.base
      ? "clean"
      : live === draft.base
        ? "dirty"
        : "conflict";
  const dirty = draftPhase !== "clean";
  const conflict = draftPhase === "conflict";
  const locked = !!(shape.props.isLocked || shape.isLocked);
  const previous = previousRevision(editor, shape);
  const source = resultSource(editor, shape);
  const Icon =
    kind === "image" ? ImageIcon : kind === "website" ? Globe : FileText;
  const versions = resultVersions(editor, shape);
  const outdated = resultIsStale(editor, shape.id);
  function patch(values: Partial<ResultDraft>) {
    setDraft((value) => ({ ...value, ...values }));
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>("[data-result-focus]")
        ?.focus({ preventScroll: true }),
    );
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (!dirty && live !== draft.base)
      setDraft((value) => ({ ...value, base: live, content: live }));
  }, [live, dirty, draft.base]);
  useEffect(() => {
    try {
      if (dirty)
        localStorage.setItem(
          storageKey,
          JSON.stringify({ version: 1, ...draft }),
        );
      else localStorage.removeItem(storageKey);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [draft, dirty, storageKey]);
  function save() {
    saveResultEdit(editor, shape.id, draft.base, draft.content);
    patch({ base: draft.content });
    setError(null);
  }
  function saveAndRead() {
    try {
      save();
      setView("read");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason : "results.changesCannotBeSaved",
      );
    }
  }
  function reveal(id: string) {
    editor.select(id);
    focusShapes(editor, [id]);
    if (mounted.current) onInspect(id);
    else
      showToast({
        title: t("results.newVersionComplete"),
        action: {
          label: t("canvas.node.viewWork"),
          onClick: () => requestInspection(editor, id),
        },
      });
  }
  async function saveImage(blob: Blob, width: number, height: number) {
    if (!editor.getShape(shape.id))
      throw new Error(t("results.theOriginalImageWasRemoved"));
    const asset = await uploadAsset(
      blob,
      `${shape.props.name || t("common.image")}-edited.png`,
    );
    reveal(createImageRevision(editor, shape.id, asset.url, width, height));
  }
  async function copy() {
    try {
      if (kind === "image") {
        if (!navigator.clipboard.write || typeof ClipboardItem === "undefined")
          throw new Error(t("results.thisBrowserCannotCopyImages"));
        const png = blobForSource(source)
          .then((blob) => rotateImage(blob, 0))
          .then((canvas) => croppedImage(canvas, fullCrop()))
          .then((value) => value.blob);
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": png }),
        ]);
      } else await navigator.clipboard.writeText(dirty ? draft.content : live);
      showToast({
        title:
          kind === "image"
            ? t("results.imageCopied")
            : t("results.contentCopied"),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason : "results.cannotCopy");
    }
  }
  async function download() {
    try {
      const name = String(
        shape.props.name ||
          (kind === "image"
            ? t("common.image")
            : kind === "website"
              ? t("common.webPage")
              : t("results.textWork")),
      ).replace(/[\\/:*?"<>|]/g, "_");
      if (kind === "image") {
        const blob = await blobForSource(source);
        downloadBlob(
          blob,
          `${name}.${blob.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png"}`,
        );
      } else
        downloadBlob(
          new Blob([dirty ? draft.content : live], {
            type:
              kind === "website"
                ? "text/html;charset=utf-8"
                : "text/markdown;charset=utf-8",
          }),
          `${name}.${kind === "website" ? "html" : "md"}`,
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason : "results.cannotDownload");
    }
  }
  return (
    <div
      ref={root}
      className="result-workbench flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (
          (event.target as Element).closest('[role="dialog"]') !==
          root.current?.closest('[role="dialog"]')
        )
          return;
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onClose();
          return;
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === "Enter" &&
          !event.nativeEvent.isComposing
        ) {
          if (event.target === contentInput.current) {
            event.preventDefault();
            saveAndRead();
          }
        }
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
        {previous && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("results.viewPreviousVersion")}
            title={t("results.viewPreviousVersion")}
            onClick={() => onInspect(previous.id)}
          >
            <ArrowLeft />
          </Button>
        )}
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h2
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={materialLabel(shape, locale)}
        >
          {materialLabel(shape, locale)}
        </h2>
        {locked && (
          <Lock
            className="size-3.5 text-muted-foreground"
            aria-label={t("workflow.status.locked")}
          />
        )}
        <span className="hidden text-xs text-muted-foreground sm:block">
          {outdated
            ? t("results.materialsChanged")
            : shape.meta.editedAt
              ? t("results.edited")
              : previous
                ? t("results.newVersion")
                : ""}
        </span>
        {versions.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("results.viewVersions")}
                  title={t("results.versions")}
                >
                  <History />
                </Button>
              }
            />
            <DropdownMenuContent
              align="end"
              className="max-h-72 w-64 overflow-y-auto"
            >
              {versions.map((item, index) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onInspect(item.id)}
                >
                  <Check
                    className={`size-3.5 ${item.id === shape.id ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">
                    {t("results.version", {
                      count: index + 1,
                      name: materialLabel(item, locale),
                    })}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            kind === "image"
              ? t("results.copyImage")
              : kind === "website"
                ? t("results.copyHtml")
                : t("results.copyWork")
          }
          title={t("common.copy")}
          onClick={() => void copy()}
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("results.downloadWork")}
          title={t("common.download")}
          onClick={() => void download()}
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("results.closeWork")}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <section
          aria-label={t("results.workContent")}
          className="flex min-w-0 flex-1 flex-col"
        >
          {kind !== "image" && (
            <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label={t("results.workView")}
              >
                <Button
                  variant={view === "read" ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === "read"}
                  onClick={() => setView("read")}
                >
                  {kind === "website" ? t("common.preview") : t("results.read")}
                </Button>
                <Button
                  variant={view === "edit" ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={view === "edit"}
                  disabled={locked || sourceRunning}
                  onClick={() => {
                    setView("edit");
                    requestAnimationFrame(() =>
                      contentInput.current?.focus({ preventScroll: true }),
                    );
                  }}
                >
                  <Pencil />
                  {kind === "website"
                    ? t("results.editHtml")
                    : t("results.editText")}
                </Button>
              </div>
              {dirty && (
                <Button
                  size="sm"
                  disabled={conflict || sourceRunning || locked}
                  onClick={saveAndRead}
                >
                  {t("results.saveChanges")}
                </Button>
              )}
            </div>
          )}
          {kind === "image" ? (
            <ImageViewer
              src={source}
              name={materialLabel(shape, locale)}
              locked={locked || sourceRunning}
              onSave={saveImage}
            />
          ) : view === "edit" ? (
            <div className="flex min-h-0 flex-1">
              <Textarea
                ref={contentInput}
                aria-label={
                  kind === "website"
                    ? t("results.editPageHtml")
                    : t("results.editWorkText")
                }
                spellCheck={kind !== "website"}
                value={draft.content}
                disabled={locked || sourceRunning}
                className={`min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-5 text-base leading-7 shadow-none focus-visible:ring-0 sm:p-7 ${kind === "website" ? "font-mono text-[13px] leading-6" : ""}`}
                onChange={(event) => patch({ content: event.target.value })}
              />
              {kind === "website" && (
                <div className="hidden min-w-0 flex-1 border-l xl:flex">
                  <WebPreview
                    html={draft.content}
                    label={t("results.liveHtmlPreview")}
                  />
                </div>
              )}
            </div>
          ) : kind === "website" ? (
            <WebPreview html={draft.content} />
          ) : (
            <div
              data-result-focus
              tabIndex={0}
              aria-label={t("results.readWork")}
              className="min-h-0 flex-1 overflow-y-auto px-5 py-7 outline-none sm:px-10 sm:py-9"
            >
              <div className="mx-auto max-w-[44rem]">
                <Markdown>
                  {draft.content || t("results.nothingHereYet")}
                </Markdown>
              </div>
            </div>
          )}
          {kind !== "image" && (
            <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
              <span role="status">
                {conflict
                  ? t("results.theOriginalChanged")
                  : dirty
                    ? saved
                      ? t("results.editingDraftKept")
                      : t("results.cannotSaveYourDraft")
                    : t("results.savedToCanvas")}
              </span>
              {dirty ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    patch({ base: live, content: live });
                    setError(null);
                  }}
                >
                  {t("results.discardChanges")}
                </Button>
              ) : (
                <span className="shrink-0 tabular-nums">
                  {t("common.characterCount", {
                    count: draft.content.length,
                    formatted: formatNumber(
                      draft.content.length,
                      undefined,
                      locale,
                    ),
                  })}
                </span>
              )}
            </div>
          )}
        </section>
      </div>
      {(error || conflict) && (
        <div
          role="alert"
          className="flex shrink-0 items-start justify-between gap-2 border-t bg-destructive/5 px-5 py-3 text-xs leading-5 text-destructive"
        >
          <div>
            <span>
              {errorMessage || t("results.theOriginalWasUpdatedElsewhere")}
            </span>
          </div>
          {!conflict && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("common.dismissNotification")}
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
