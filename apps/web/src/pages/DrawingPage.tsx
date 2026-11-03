import { t, useLocale } from "@/i18n";
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import {
  getSnapshot,
  loadSnapshot,
  Bounds,
  type Editor,
  type CanvasSession,
} from "@/canvas/editor";
import { ExcalidrawSurface as CanvasSurface } from "@/canvas/excalidraw/ExcalidrawSurface";
import {
  Check,
  ChevronDown,
  Download,
  FileJson,
  Image,
  Loader2,
  Share2,
  WifiOff,
  ArrowLeft,
} from "lucide-react";
import { Shell, ShellSidebarTrigger } from "@/Components/Shell";
import { WorkflowRunButton } from "@/Components/WorkflowRunButton";
import { ComponentPanel } from "@/Components/ComponentPanel";
import {
  insertLibraryImage,
  type LibraryAsset,
} from "@/features/asset-library/assets";
import { useToast } from "@/Components/common/ToastProvider";
import { RecorderButton } from "@/recording/Recorder";
import { blobAsDataURL } from "@/api/backend";
import { api, type Project, downloadBlob } from "@/api/client";
import { CanvasSync, documentSnapshot } from "@/canvas/sync";
import {
  readDraft,
  readView,
  saveView,
  type RecordPatch,
} from "@/canvas/drafts";
import { applyRecipe } from "@/canvas/recipes";
import {
  thumbnailScale,
  needsThumbnailRefresh,
  thumbnailStamp,
} from "@/canvas/thumbnail";
import { exportProject } from "@/canvas/transfer";
import { useTheme } from "@/lib/theme";
import { stopAllExecutions } from "@/workflow/execute";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { rememberOpenedProject } from "@/lib/recent-project";
import { Label } from "@/ui/label";
import { Switch } from "@/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ui/dialog";

export function DrawingPage() {
  useLocale();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("share");
  const { id } = useParams();
  const [loaded, setLoaded] = useState<{
    project: Project;
    draft?: RecordPatch;
    view?: unknown;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError("");
    Promise.all([
      api<Project>(
        `/api/projects/${id}${shareToken === null ? "" : `?share=${encodeURIComponent(shareToken)}`}`,
      ),
      readDraft(id).catch(() => undefined),
      readView(id).catch(() => undefined),
    ])
      .then(([project, draft, view]) => {
        if (!cancelled) setLoaded({ project, draft, view });
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, shareToken]);
  if (!loaded)
    return (
      <Shell canvas>
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
        <div className="flex h-full flex-col items-center justify-center gap-4">
          {error ? (
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
      </Shell>
    );
  return (
    <DrawingCanvas
      key={`${id}:${shareToken}`}
      {...loaded}
      shareToken={shareToken}
    />
  );
}

function DrawingCanvas({
  project: initial,
  draft,
  view,
  shareToken,
}: {
  project: Project;
  draft?: RecordPatch;
  view?: unknown;
  shareToken: string | null;
}) {
  useLocale();
  const route = useLocation();
  const [initialInspectId] = useState<string | undefined>(
    () => route.state?.inspectShapeId,
  );
  const [initialAssetId] = useState<string | undefined>(
    () => route.state?.insertAssetId,
  );
  const [project, setProject] = useState(initial);
  const [sync] = useState(() => new CanvasSync(initial, draft, shareToken));
  const [shareClosed, setShareClosed] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const status = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const { resolved } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const inspectId = route.state?.inspectShapeId;
  useEffect(() => {
    if (inspectId || route.state?.insertAssetId)
      navigate(route.pathname + route.search, { replace: true, state: null });
  }, [
    inspectId,
    navigate,
    route.pathname,
    route.search,
    route.state?.insertAssetId,
  ]);
  useEffect(() => {
    if (!editor || !canvasReady || !initialAssetId) return;
    let cancelled = false;
    void api<LibraryAsset>(
      `/api/library/assets/${encodeURIComponent(initialAssetId)}`,
    )
      .then((asset) => {
        if (!cancelled) insertLibraryImage(editor, asset);
      })
      .catch((error) => {
        if (!cancelled)
          showToast({
            title: t("assets.insertFailed"),
            description: error.message,
            variant: "destructive",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [editor, canvasReady, initialAssetId, showToast]);
  const [shareOpen, setShareOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(initial.name);
  const [templateDescription, setTemplateDescription] = useState("");
  const [busy, setBusy] = useState(false);
  function failed(error: unknown) {
    showToast({
      title: t("common.operationFailed"),
      description:
        error instanceof Error ? error.message : t("common.tryAgain"),
      variant: "destructive",
    });
  }
  const onProjectDeleted = useEffectEvent(() => {
    showToast({ title: t("canvas.projectDeleted") });
    navigate("/projects");
  });
  useEffect(() => {
    sync.onDeleted = onProjectDeleted;
    sync.onAccessRevoked = () => setShareClosed(true);
    sync.connect();
    return () => {
      sync.disconnect();
    };
  }, [sync]);
  useEffect(() => {
    if (!editor) return;
    return () => stopAllExecutions(editor);
  }, [editor]);
  useEffect(() => {
    if (shareClosed && editor) stopAllExecutions(editor);
  }, [shareClosed, editor]);
  useEffect(() => {
    if (shareToken === null) rememberOpenedProject(project.id);
  }, [project.id, shareToken]);
  useEffect(() => {
    editor?.user.updateUserPreferences({
      colorScheme: resolved,
      locale: "zh-cn",
    });
  }, [resolved, editor]);
  useEffect(() => {
    if (!editor) return;
    let viewTimer: ReturnType<typeof setTimeout>;
    let coverTimer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let coverGeneration = 0;
    const unsubscribe = editor.store.listen(
      () => {
        clearTimeout(viewTimer);
        viewTimer = setTimeout(() => {
          void saveView(project.id, getSnapshot(editor.store).session).catch(
            () => {},
          );
        }, 500);
      },
      { scope: "session" },
    );
    const previewKey = `huayu:thumbnail:${project.id}`;
    function scheduleCover(delay = 1000, attempt = 0) {
      if (shareToken !== null) return;
      const generation = ++coverGeneration;
      clearTimeout(coverTimer);
      coverTimer = setTimeout(async () => {
        try {
          await sync.flush();
          if (stopped || generation !== coverGeneration) return;
          const revision = sync.getSnapshot().revision;
          const ids = [...editor.getCurrentPageShapeIds()];
          if (!ids.length || stopped) return;
          const bounds = Bounds.union(
            ids.map((id) => editor.getShapePageBounds(id)!).filter(Boolean),
          );
          let scale = thumbnailScale(bounds.w + 40, bounds.h + 40);
          let blob: Blob | undefined;
          for (let sizeAttempt = 0; sizeAttempt < 3; sizeAttempt++) {
            if (stopped || generation !== coverGeneration) return;
            ({ blob } = await editor.toImage(ids, {
              format: "png",
              scale,
              background: false,
              padding: 20,
            }));
            if (blob.size <= 350000) break;
            scale *= 0.6;
          }
          if (!blob) return;
          if (blob.size > 350000 || stopped || generation !== coverGeneration)
            return;
          const cover = await blobAsDataURL(blob);
          if (stopped || generation !== coverGeneration) return;
          if (cover !== project.cover)
            await api(`/api/projects/${project.id}`, {
              method: "PATCH",
              body: JSON.stringify({ cover }),
            });
          try {
            localStorage.setItem(previewKey, thumbnailStamp(cover, revision));
          } catch {
            /* The preview remains usable when browser storage is unavailable. */
          }
        } catch {
          if (!stopped && generation === coverGeneration && attempt < 2)
            scheduleCover(1500 * (attempt + 1), attempt + 1);
        }
      }, delay);
    }
    const bounds = Bounds.union(
      [...editor.getCurrentPageShapeIds()]
        .map((id) => editor.getShapePageBounds(id)!)
        .filter(Boolean),
    );
    let stamp: string | null = null;
    try {
      stamp = localStorage.getItem(previewKey);
    } catch {
      /* Refreshing a derived preview does not require browser storage. */
    }
    if (
      needsThumbnailRefresh(
        project.cover,
        bounds.w + 40,
        bounds.h + 40,
        stamp,
        sync.getSnapshot().revision,
      )
    )
      scheduleCover(800);
    const documentUnsubscribe = editor.store.listen(() => scheduleCover(), {
      scope: "document",
    });
    return () => {
      stopped = true;
      clearTimeout(viewTimer);
      clearTimeout(coverTimer);
      unsubscribe();
      documentUnsubscribe();
      void saveView(project.id, getSnapshot(editor.store).session).catch(
        () => {},
      );
    };
  }, [editor, project.id, project.cover, shareToken, sync]);
  async function rename(name: string) {
    if (!name.trim() || name.trim() === project.name) return;
    try {
      const updated = await api<Project>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setProject(updated);
    } catch (error) {
      failed(error);
    }
  }
  async function exportAs(format: "json" | "png" | "svg") {
    if (!editor) return;
    setBusy(true);
    try {
      await sync.flush();
      if (format === "json")
        await exportProject(project.name, documentSnapshot(editor.store));
      else {
        const ids = [...editor.getCurrentPageShapeIds()];
        if (!ids.length) throw new Error(t("canvas.theresNothingToExportYet"));
        if (format === "png") {
          const { blob } = await editor.toImage(ids, {
            format: "png",
            background: true,
            padding: 32,
          });
          downloadBlob(blob, `${project.name}.png`);
        } else {
          const svg = await editor.getSvgString(ids, {
            background: true,
            padding: 32,
          });
          if (!svg) throw new Error(t("canvas.cannotExportCanvas"));
          downloadBlob(
            new Blob([svg.svg], { type: "image/svg+xml" }),
            `${project.name}.svg`,
          );
        }
      }
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function promote() {
    setBusy(true);
    try {
      await sync.flush();
      await api(`/api/projects/${project.id}/template`, {
        method: "POST",
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          tags: [t("canvas.myExample")],
        }),
      });
      showToast({ title: t("canvas.savedAsExample") });
      setTemplateOpen(false);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function share(enabled: boolean) {
    try {
      const value = await api<Project>(
        `/api/projects/${project.id}/collaboration`,
        { method: "POST", body: JSON.stringify({ enabled }) },
      );
      setProject(value);
    } catch (error) {
      failed(error);
    }
  }
  const shareUrl = `${location.origin}/drawing/${project.id}${project.share_token ? `?share=${project.share_token}` : ""}`;
  const statusText =
    status.status === "saved"
      ? t("recordings.analysis.saved")
      : status.status === "saving"
        ? t("canvas.saving")
        : status.status === "offline"
          ? t("canvas.waitingToReconnect")
          : t("canvas.syncFailed");
  if (shareClosed)
    return (
      <Shell canvas>
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
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t("canvas.share.linkUnavailable")}
        </div>
      </Shell>
    );
  const pageActions = (
    <>
      <RecorderButton />
      {shareToken === null && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("canvas.share.title")}
          onClick={() => setShareOpen(true)}
        >
          <Share2 />
          <span className="hidden xl:inline">{t("canvas.share")}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={t("canvas.canvasActions")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Download />}
              <span className="hidden lg:inline">
                {t("recordings.analysis.export")}
              </span>
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => exportAs("json")}>
            <FileJson />
            {t("canvas.exportProjectFile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAs("png")}>
            <Image />
            {t("canvas.export.png")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAs("svg")}>
            <Image />
            {t("canvas.export.svg")}
          </DropdownMenuItem>
          {shareToken === null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                {t("canvas.saveAsExample")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {editor && <WorkflowRunButton editor={editor} />}
    </>
  );
  const pageTitle = (
    <div className="flex min-w-0 items-center gap-1.5">
      <ShellSidebarTrigger />
      <Input
        key={project.name}
        aria-label={t("canvas.canvasName")}
        className="h-8 w-28 min-w-0 border-transparent px-1 font-medium shadow-none hover:border-input sm:w-40"
        defaultValue={project.name}
        readOnly={shareToken !== null}
        maxLength={120}
        onBlur={(event) => {
          if (shareToken !== null) return;
          if (event.target.value.trim()) rename(event.target.value);
          else event.target.value = project.name;
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229
          )
            event.currentTarget.blur();
        }}
      />
      <button
        title={status.error || statusText}
        onClick={() => sync.retry()}
        className="flex size-7 shrink-0 items-center justify-center text-xs text-muted-foreground"
        aria-label={t("canvas.saveStatus", { arg0: statusText })}
      >
        {status.status === "saved" ? (
          <Check className="size-3.5" />
        ) : status.status === "saving" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <WifiOff className="size-3.5" />
        )}
      </button>
    </div>
  );
  return (
    <Shell
      canvas
      onAssets={() => setAssetsOpen((open) => !open)}
      assetsOpen={assetsOpen}
    >
      <CanvasSurface
        onReady={() => setCanvasReady(true)}
        topLeft={pageTitle}
        topRight={pageActions}
        assetsOpen={assetsOpen}
        onAssetsOpenChange={setAssetsOpen}
        projectId={project.id}
        initialInspectId={initialInspectId}
        store={sync.store}
        onMount={(mounted) => {
          mounted.user.updateUserPreferences({
            colorScheme: resolved,
            locale: "zh-cn",
          });
          if (view) {
            try {
              loadSnapshot(mounted.store, {
                session: view as CanvasSession,
              });
            } catch {
              /* The document remains usable if an old view cannot be restored. */
            }
          }
          if (
            !initial.document &&
            !draft &&
            initial.recipe &&
            !mounted.getCurrentPageShapeIds().size
          )
            applyRecipe(mounted, initial.recipe);
          if ((!view || sync.mergedPages) && initial.document)
            mounted.zoomToFit();
          setEditor(mounted);
        }}
      >
        <ComponentPanel
          onOpenLibrary={() => setAssetsOpen((open) => !open)}
          libraryOpen={assetsOpen}
        />
      </CanvasSurface>
      {status.status === "offline" && (
        <div
          role="status"
          className="absolute right-3 bottom-20 z-[350] max-w-xs rounded-lg border bg-popover px-4 py-3 text-sm shadow-sm"
        >
          {t("canvas.connectionInterrupted")}
          <Button
            variant="link"
            size="sm"
            className="px-1"
            onClick={sync.retry}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>{t("canvas.share.title")}</DialogTitle>
          <DialogDescription>{t("canvas.share.description")}</DialogDescription>
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="collaboration">
              {t("canvas.share.allowCollaboration")}
            </Label>
            <Switch
              id="collaboration"
              checked={project.is_collaborative}
              onCheckedChange={share}
            />
          </div>
          {project.is_collaborative && (
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label={t("canvas.share.linkLabel")}
                value={shareUrl}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    showToast({ title: t("canvas.share.linkCopied") });
                  } catch (error) {
                    failed(error);
                  }
                }}
              >
                {t("canvas.copyLink")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogTitle>{t("canvas.saveAsExample")}</DialogTitle>
          <DialogDescription>
            {t("canvas.saveThisCanvasAsAStartingPointForNewProjects")}
          </DialogDescription>
          <Input
            aria-label={t("canvas.exampleName")}
            value={templateName}
            maxLength={120}
            onChange={(event) => setTemplateName(event.target.value)}
          />
          <Input
            aria-label={t("canvas.exampleDescription")}
            placeholder={t("canvas.addADescriptionOptional")}
            value={templateDescription}
            onChange={(event) => setTemplateDescription(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || !templateName.trim()} onClick={promote}>
              {t("canvas.saveExample")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
