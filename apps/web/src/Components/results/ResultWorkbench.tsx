import { t, useLocale, formatNumber } from "@/i18n";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  ImageIcon,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Sparkles,
  Square,
  X,
  History,
} from "lucide-react";
import { useEditor, type CanvasShape } from "@/canvas/editor";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/ui/native-select";
import { Markdown } from "@/Components/common/Markdown";
import { useToast } from "@/Components/common/ToastProvider";
import { blobForSource } from "@/api/backend";
import { downloadBlob, uploadAsset } from "@/api/client";
import {
  requestInspection,
  focusShapes,
  materialLabel,
} from "@/workflow/context";
import {
  runWorkflow,
  useNodeExecution,
  useNodeRunning,
} from "@/workflow/execute";
import { formatElapsed, resultIsStale } from "@/workflow/freshness";
import {
  completedRevision,
  createImageRevision,
  createResultRevision,
  previousRevision,
  readResultDraft,
  resultDraftKey,
  resultKind,
  resultSource,
  resultText,
  saveResultEdit,
  type ResultDraft,
  IMAGE_RATIOS,
  imageRatio,
  resultVersions,
  pendingRevision,
} from "@/workflow/results";
import { ImageViewer } from "./ImageViewer";
import { WebPreview } from "./WebPreview";
import { croppedImage, fullCrop, rotateImage } from "./image-edit";
import { modelSettingsAction } from "@/lib/settings-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export function ResultWorkbench({
  shape,
  projectId,
  onInspect,
  onClose,
  initialRefining = false,
}: {
  shape: CanvasShape;
  projectId: string;
  onInspect: (id: string) => void;
  onClose: () => void;
  initialRefining?: boolean;
}) {
  useLocale();
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
  const [error, setError] = useState("");
  const [refining, setRefining] = useState(initialRefining);
  const [pending, setPending] = useState<string | null>(() =>
    pendingRevision(editor, shape.id, draft.type, draft.prompt),
  );
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [imageEditing, setImageEditing] = useState(false);
  const imageSize =
    draft.imageSize ||
    shape.props.imageSize ||
    imageRatio(imageDimensions.width, imageDimensions.height);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const working = useRef(false);
  const sourceRunning = useNodeRunning(editor, shape.id);
  const execution = useNodeExecution(editor, pending || shape.id);
  const pendingRunning = useNodeRunning(editor, pending || "");
  const inProgress = running || (!!pending && pendingRunning);
  const live = resultText(shape);
  const dirty = draft.content !== draft.base;
  const conflict = dirty && live !== draft.base;
  const locked = !!(shape.props.isLocked || shape.isLocked);
  const previous = previousRevision(editor, shape);
  const source = resultSource(editor, shape);
  const Icon =
    kind === "image" ? ImageIcon : kind === "website" ? Globe : FileText;
  const versions = resultVersions(editor, shape);
  const creationStep =
    typeof shape.meta.creationStep === "string"
      ? editor.getShape(shape.meta.creationStep)
      : undefined;
  const originalRequest =
    creationStep?.props.text ||
    (shape.type !== "ai-text" ? shape.props.text : "");
  const outdated = resultIsStale(editor, shape.id);
  const cancelled = !!pending && execution.status === "cancelled";
  const elapsed = execution.startedAt
    ? formatElapsed(now - execution.startedAt)
    : "";
  const suggestions =
    kind === "image"
      ? [
          t("results.keepTheCompositionChangeTheTones"),
          t("results.tryADifferentStyle"),
          t("results.emphasizeTheSubject"),
        ]
      : kind === "website"
        ? [
            t("results.refineThePageLayout"),
            t("results.improveTheMobileExperience"),
            t("results.useAQuieterColorPalette"),
          ]
        : [
            t("results.makeItMoreConcise"),
            t("results.tryAnotherWayOfSayingIt"),
            t("results.organizeIntoKeyPoints"),
          ];
  function patch(values: Partial<ResultDraft>) {
    setDraft((value) => ({ ...value, ...values }));
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = initialRefining
        ? promptInput.current
        : root.current?.querySelector<HTMLElement>("[data-result-focus]");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialRefining]);
  const onRevisionCompleted = useEffectEvent((id: string) => {
    if (!editor.getShape(id)) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* The completed work is on the canvas. */
    }
    reveal(completedRevision(editor, id));
  });
  useEffect(() => {
    if (!dirty && live !== draft.base)
      setDraft((value) => ({ ...value, base: live, content: live }));
  }, [live, dirty, draft.base]);
  useEffect(() => {
    try {
      if (dirty || draft.prompt.trim())
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
  useEffect(() => {
    if (!inProgress) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [inProgress]);
  useEffect(() => {
    if (
      pending &&
      !working.current &&
      !inProgress &&
      execution.status === "success"
    ) {
      onRevisionCompleted(pending);
    }
  }, [pending, inProgress, execution.status]);
  function save() {
    saveResultEdit(editor, shape.id, draft.base, draft.content);
    patch({ base: draft.content });
    setError("");
  }
  function saveAndRead() {
    try {
      save();
      setView("read");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("results.changesCannotBeSaved"),
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
  async function create() {
    if (
      working.current ||
      inProgress ||
      imageEditing ||
      sourceRunning ||
      !draft.prompt.trim()
    )
      return;
    working.current = true;
    setError("");
    try {
      if (dirty) save();
      let id =
        pending && editor.getShape(pending)?.meta.revisionOf === shape.id
          ? pending
          : null;
      if (!id)
        id = createResultRevision(editor, shape.id, draft.type, draft.prompt, {
          imageSize,
        });
      else
        editor.updateShape({
          id,
          props: {
            text: draft.prompt.trim(),
            ...(draft.type === "ai-image" ? { imageSize } : {}),
          },
        });
      setPending(id);
      setRunning(true);
      await runWorkflow(editor, id);
      const result = completedRevision(editor, id);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* The result itself is already saved to the canvas. */
      }
      if (mounted.current) patch({ prompt: "" });
      reveal(result);
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") {
        if (mounted.current) setError("");
      } else
        showToast({
          title: t("results.newVersionIncomplete"),
          description:
            reason instanceof Error
              ? reason.message
              : t("results.cannotCreateANewVersion"),
          variant: "destructive",
          action: modelSettingsAction(reason),
        });
    } finally {
      working.current = false;
      if (mounted.current) setRunning(false);
    }
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
      setError(
        reason instanceof Error ? reason.message : t("results.cannotCopy"),
      );
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
      setError(
        reason instanceof Error ? reason.message : t("results.cannotDownload"),
      );
    }
  }
  return (
    <div
      ref={root}
      className="result-workbench flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
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
          } else if (event.target === promptInput.current) {
            event.preventDefault();
            void create();
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
          title={materialLabel(shape)}
        >
          {materialLabel(shape)}
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
                      name: materialLabel(item),
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
          className={`min-w-0 flex-1 flex-col ${refining ? "hidden lg:flex" : "flex"}`}
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
                  <Check />
                  {t("results.saveChanges")}
                </Button>
              )}
            </div>
          )}
          {kind === "image" ? (
            <ImageViewer
              src={source}
              name={materialLabel(shape)}
              locked={locked || sourceRunning || inProgress}
              onSave={saveImage}
              onSize={(width, height) => setImageDimensions({ width, height })}
              onEditingChange={setImageEditing}
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
                disabled={locked || sourceRunning || inProgress}
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
                    setError("");
                  }}
                >
                  {t("results.discardChanges")}
                </Button>
              ) : (
                <span className="shrink-0 tabular-nums">
                  {t("common.characterCount", {
                    count: draft.content.length,
                    formatted: formatNumber(draft.content.length),
                  })}
                </span>
              )}
            </div>
          )}
        </section>
        <aside
          aria-label={t("results.createAgain")}
          className={`min-h-0 w-full shrink-0 flex-col overflow-y-auto border-l bg-muted/15 lg:w-80 ${refining ? "flex" : "hidden lg:flex"}`}
        >
          <div className="flex shrink-0 items-center gap-2 px-5 pt-5 text-sm font-medium">
            <Sparkles className="size-4" />
            {t("results.createAgain")}
          </div>
          <p className="shrink-0 px-5 pt-2 text-xs leading-5 text-muted-foreground">
            {t("results.createANewVersionFromThisWork")}
          </p>
          <div className="mx-5 mt-4 flex shrink-0 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{materialLabel(shape)}</span>
          </div>
          <Textarea
            ref={promptInput}
            aria-label={t("results.newVersionInstructions")}
            placeholder={
              kind === "image"
                ? t("results.whichDetailsWouldYouLikeToChange")
                : kind === "website"
                  ? t("results.whatShouldChangeAndWhatShouldStay")
                  : t("results.howWouldYouLikeToChangeThisWork")
            }
            value={draft.prompt}
            disabled={inProgress || sourceRunning}
            className="mt-3 min-h-24 flex-1 resize-none rounded-none border-0 bg-transparent px-5 py-3 text-sm leading-6 shadow-none focus-visible:ring-0"
            onChange={(event) => patch({ prompt: event.target.value })}
          />
          <div className="flex shrink-0 flex-wrap gap-1.5 px-5 py-3">
            {suggestions.map((text) => (
              <Button
                key={text}
                size="xs"
                variant="outline"
                disabled={inProgress || sourceRunning}
                onClick={() => {
                  patch({ prompt: text });
                  promptInput.current?.focus();
                }}
              >
                {text}
              </Button>
            ))}
          </div>
          {originalRequest && (
            <details className="mx-5 mb-3 shrink-0 text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1">
                {t("results.viewThisVersionsInstructions")}
              </summary>
              <p className="max-h-24 overflow-y-auto whitespace-pre-wrap pt-2 leading-5">
                {originalRequest}
              </p>
            </details>
          )}
          <div className="sticky bottom-0 shrink-0 space-y-3 border-t bg-card p-4">
            {draft.type === "ai-image" && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("results.imageRatio")}</span>
                <NativeSelect
                  aria-label={t("results.newImageRatio")}
                  className="h-7 w-24 text-xs"
                  value={imageSize}
                  disabled={inProgress}
                  onChange={(event) => patch({ imageSize: event.target.value })}
                >
                  {IMAGE_RATIOS.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {value}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <NativeSelect
                aria-label={t("results.newVersionType")}
                value={draft.type}
                className="h-8 w-24 text-xs"
                disabled={inProgress}
                onChange={(event) => {
                  patch({ type: event.target.value as ResultDraft["type"] });
                  setPending(null);
                }}
              >
                <NativeSelectOption value="instruction">
                  {t("common.text")}
                </NativeSelectOption>
                <NativeSelectOption value="ai-image">
                  {t("common.image")}
                </NativeSelectOption>
                <NativeSelectOption value="website">
                  {t("common.webPage")}
                </NativeSelectOption>
              </NativeSelect>
              {inProgress ? (
                <Button
                  size="sm"
                  onClick={() => {
                    if (pending) void runWorkflow(editor, pending);
                  }}
                >
                  <Square />
                  {t("workflow.stop")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={
                    !draft.prompt.trim() ||
                    imageEditing ||
                    sourceRunning ||
                    conflict ||
                    (dirty && locked)
                  }
                  onClick={() => void create()}
                >
                  {pending ? <RefreshCw /> : <ArrowUp />}
                  {dirty
                    ? t("results.saveAndCreate")
                    : pending
                      ? execution.status === "error"
                        ? t("results.retryGeneration")
                        : t("results.continueGeneration")
                      : t("results.createNewVersion")}
                </Button>
              )}
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              role="status"
            >
              {inProgress ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  {t("results.creating")}
                  {elapsed}
                </>
              ) : imageEditing ? (
                t("results.saveYourImageEditsBeforeCreatingANewVersion")
              ) : cancelled ? (
                t("results.stopped")
              ) : sourceRunning ? (
                t("results.thisWorkIsBeingGenerated")
              ) : dirty || draft.prompt.trim() ? (
                saved ? (
                  t("results.draftKept")
                ) : (
                  t("results.cannotSaveYourDraft")
                )
              ) : (
                t("results.writeYourInstructionsToBegin")
              )}
            </div>
          </div>
        </aside>
      </div>
      {(error || conflict) && (
        <div
          role="alert"
          className="flex shrink-0 items-start justify-between gap-2 border-t bg-destructive/5 px-5 py-3 text-xs leading-5 text-destructive"
        >
          <div>
            <span>{error || t("results.theOriginalWasUpdatedElsewhere")}</span>
          </div>
          {!conflict && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("common.dismissNotification")}
              onClick={() => setError("")}
            >
              <X />
            </Button>
          )}
        </div>
      )}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-t px-4 lg:hidden">
        <span className="truncate text-xs text-muted-foreground">
          {dirty
            ? t("results.editingDraftKept")
            : inProgress
              ? t("results.creatingANewVersion")
              : t("results.currentWork")}
        </span>
        <Button
          variant={refining ? "ghost" : "default"}
          size="sm"
          aria-expanded={refining}
          onClick={() => setRefining((value) => !value)}
        >
          {refining ? (
            <>
              <ArrowLeft />
              {t("results.backToWork")}
            </>
          ) : (
            <>
              <Sparkles />
              {t("results.createAgain")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
