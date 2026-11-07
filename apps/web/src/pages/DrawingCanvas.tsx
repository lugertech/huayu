import { LocaleContext, t as appT, useTranslations } from "@/i18n";
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  getSnapshot,
  loadSnapshot,
  Bounds,
  type Editor,
  type CanvasSession,
} from "@/canvas/editor";
import { ExcalidrawSurface as CanvasSurface } from "@/canvas/excalidraw/ExcalidrawSurface";
import {
  useBoardLanguage,
  type BoardLanguage,
} from "@/canvas/excalidraw/board-language";
import { UserRoundPlus, ArrowLeft, Settings2 } from "lucide-react";
import { MainMenu } from "@excalidraw/excalidraw";
import { ShellSidebarTrigger } from "@/Components/Shell";
import { CanvasToolbarTooltip } from "@/Components/canvas/CanvasToolbarTooltip";
import { Collaborators } from "@/Components/canvas/Collaborators";
import { CanvasPageLayout } from "@/Components/canvas/CanvasPageLayout";
import { focusShapes } from "@/workflow/context";
import { ComponentPanel } from "@/Components/ComponentPanel";
import { useToast } from "@/Components/common/ToastProvider";
import { RecorderButton } from "@/recording/Recorder";
import { blobAsDataURL } from "@/api/backend";
import {
  api,
  PROJECTS_CHANGED_EVENT,
  type ProjectChange,
  type Project,
} from "@/api/client";
import {
  CanvasSync,
  documentSnapshot,
  type CollaborationExit,
} from "@/canvas/sync";
import { saveView, type RecordPatch } from "@/canvas/drafts";
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
import { openModelSettings } from "@/lib/settings-event";
import { Label } from "@/ui/label";
import { Switch } from "@/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ui/dialog";

import { CollaborationNotice } from "./CollaborationNotice";

export interface DrawingCanvasProps {
  project: Project;
  draft?: RecordPatch;
  view?: unknown;
  shareToken: string | null;
  initializeRecipe?: typeof import("@/canvas/recipes").applyRecipe;
}

export function DrawingCanvas(props: DrawingCanvasProps) {
  const boardLanguage = useBoardLanguage();
  return (
    <LocaleContext value={boardLanguage.uiLocale}>
      <DrawingCanvasContent {...props} boardLanguage={boardLanguage} />
    </LocaleContext>
  );
}

function DrawingCanvasContent({
  project: initial,
  draft,
  view,
  shareToken,
  boardLanguage,
  initializeRecipe,
}: DrawingCanvasProps & { boardLanguage: BoardLanguage }) {
  const { t } = useTranslations();
  const route = useLocation();
  const [initialInspectId] = useState<string | undefined>(
    () => route.state?.inspectShapeId,
  );
  const [project, setProject] = useState(initial);
  useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<ProjectChange | undefined>).detail;
      if (change?.type === "updated" && change.project.id === initial.id) {
        setProject((current) => ({ ...current, name: change.project.name }));
      }
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, changed);
  }, [initial.id]);
  const [sync] = useState(() => new CanvasSync(initial, draft, shareToken));
  const [shareClosed, setShareClosed] = useState<CollaborationExit | null>(
    null,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const status = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const syncError =
    typeof status.error === "string" ? t(status.error) : status.error?.message;
  const { resolved } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const inspectId = route.state?.inspectShapeId;
  useEffect(() => {
    if (inspectId)
      navigate(route.pathname + route.search, { replace: true, state: null });
  }, [inspectId, navigate, route.pathname, route.search]);
  const [shareOpen, setShareOpen] = useState(false);
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
    if (shareToken !== null) setShareClosed("closed");
    else navigate("/projects");
  });
  useEffect(() => {
    sync.onDeleted = onProjectDeleted;
    sync.onAccessRevoked = setShareClosed;
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
    });
  }, [resolved, editor]);
  useEffect(() => {
    if (!editor) return;
    let viewTimer: ReturnType<typeof setTimeout>;
    let coverTimer: ReturnType<typeof setTimeout>;
    type CoverJob = {
      phase:
        | "waiting"
        | "flushing"
        | "rendering"
        | "uploading"
        | "completed"
        | "failed";
    };
    let coverJob: CoverJob | null = null;
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
      const job: CoverJob = { phase: "waiting" };
      coverJob = job;
      clearTimeout(coverTimer);
      coverTimer = setTimeout(async () => {
        try {
          job.phase = "flushing";
          await sync.flush();
          if (job !== coverJob) return;
          const revision = sync.getSnapshot().revision;
          const ids = [...editor.getCurrentPageShapeIds()];
          if (!ids.length || job !== coverJob) {
            job.phase = "completed";
            return;
          }
          const bounds = Bounds.union(
            ids.map((id) => editor.getShapePageBounds(id)!).filter(Boolean),
          );
          let scale = thumbnailScale(bounds.w + 40, bounds.h + 40);
          let blob: Blob | undefined;
          for (let sizeAttempt = 0; sizeAttempt < 3; sizeAttempt++) {
            if (job !== coverJob) return;
            job.phase = "rendering";
            ({ blob } = await editor.toImage(ids, {
              format: "png",
              scale,
              background: false,
              padding: 20,
            }));
            if (blob.size <= 350000) break;
            scale *= 0.6;
          }
          if (job !== coverJob) return;
          if (!blob || blob.size > 350000) {
            job.phase = "failed";
            return;
          }
          const cover = await blobAsDataURL(blob);
          if (job !== coverJob) return;
          job.phase = "uploading";
          if (cover !== project.cover)
            await api(`/api/projects/${project.id}`, {
              method: "PATCH",
              body: JSON.stringify({ cover, cover_revision: revision }),
            });
          if (job !== coverJob) return;
          job.phase = "completed";
          try {
            localStorage.setItem(previewKey, thumbnailStamp(cover, revision));
          } catch {
            /* The preview remains usable when browser storage is unavailable. */
          }
        } catch {
          job.phase = "failed";
          if (job === coverJob && attempt < 2)
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
      coverJob = null;
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
  async function exportProjectFile() {
    if (!editor || busy) return;
    setBusy(true);
    try {
      await sync.flush();
      await exportProject(project.name, documentSnapshot(editor.store));
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
          tags: [appT("canvas.myExample")],
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
  if (shareClosed)
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
        <div className="flex h-full items-center justify-center px-6">
          <CollaborationNotice reason={shareClosed} />
        </div>
      </CanvasPageLayout>
    );
  const pageTitle = (
    <div className="board-toolbar-project">
      {shareToken === null && (
        <CanvasToolbarTooltip label={t("navigation.backToProjects")}>
          <Button
            variant="ghost"
            size="icon"
            className="board-toolbar-back"
            aria-label={t("navigation.backToProjects")}
            onClick={() => navigate("/projects")}
          >
            <ArrowLeft />
          </Button>
        </CanvasToolbarTooltip>
      )}
      <div className="board-toolbar-title-row">
        {shareToken !== null ? (
          <span
            className="board-toolbar-name board-toolbar-name-readonly"
            title={project.name}
          >
            {project.name}
          </span>
        ) : (
          <>
            <div className="board-toolbar-name-field">
              <span className="board-toolbar-name-measure" aria-hidden="true">
                {project.name}
              </span>
              <Input
                key={project.name}
                aria-label={t("canvas.canvasName")}
                className="board-toolbar-name"
                defaultValue={project.name}
                maxLength={120}
                onBlur={(event) => {
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
            </div>
          </>
        )}
        {shareToken !== null && (
          <span
            className="board-toolbar-role"
            title={t("canvas.access.editorHint")}
          >
            {t("canvas.access.editor")}
          </span>
        )}
      </div>
    </div>
  );
  return (
    <CanvasPageLayout shared={shareToken !== null}>
      <CanvasSurface
        boardLanguage={boardLanguage}
        menuItems={
          <>
            <MainMenu.Item
              disabled={!editor || busy}
              onSelect={() => void exportProjectFile()}
            >
              {t("canvas.exportProjectFile")}
            </MainMenu.Item>
            {shareToken === null && (
              <MainMenu.Item
                disabled={busy}
                onSelect={() => setTemplateOpen(true)}
              >
                {t("canvas.saveAsExample")}
              </MainMenu.Item>
            )}
          </>
        }
        toolbar={
          <>
            <div className="board-toolbar-navigation">
              {shareToken === null && (
                <ShellSidebarTrigger className="board-toolbar-button board-toolbar-workspace-toggle" />
              )}
              {pageTitle}
            </div>
            {editor && (
              <div className="board-toolbar-actions">
                <div className="board-toolbar-collaboration">
                  <Collaborators
                    sync={sync}
                    enabled={project.is_collaborative || shareToken !== null}
                    canManage={shareToken === null}
                    onManageInvitation={() => setShareOpen(true)}
                  />
                  {shareToken === null && !project.is_collaborative && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="board-toolbar-button board-toolbar-invite"
                      aria-label={t("canvas.invite")}
                      title={t("canvas.share.title")}
                      onClick={() => setShareOpen(true)}
                    >
                      <UserRoundPlus />
                      <span className="board-toolbar-invite-label">
                        {t("canvas.invite")}
                      </span>
                    </Button>
                  )}
                </div>
                <div className="board-toolbar-utilities">
                  {shareToken === null ? (
                    <RecorderButton
                      toolbar
                      renderTrigger={(trigger, label) => (
                        <CanvasToolbarTooltip label={label}>
                          {trigger}
                        </CanvasToolbarTooltip>
                      )}
                    />
                  ) : (
                    <CanvasToolbarTooltip label={t("settings.models.title")}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="board-toolbar-button"
                        aria-label={t("settings.models.title")}
                        onClick={() => openModelSettings()}
                      >
                        <Settings2 />
                        <span className="board-toolbar-utility-label">
                          {t("settings.models.title")}
                        </span>
                      </Button>
                    </CanvasToolbarTooltip>
                  )}
                  <span
                    className="board-toolbar-native-menu-slot"
                    aria-hidden="true"
                  />
                </div>
              </div>
            )}
          </>
        }
        projectId={project.id}
        collaboration={sync}
        initialInspectId={initialInspectId}
        store={sync.store}
        onMount={(mounted) => {
          mounted.user.updateUserPreferences({
            colorScheme: resolved,
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
            initializeRecipe &&
            initial.recipe &&
            !mounted.getCurrentPageShapeIds().size
          )
            initializeRecipe(mounted, initial.recipe);
          if ((!view || sync.mergedPages) && initial.document)
            mounted.zoomToFit();
          if (initialInspectId && mounted.getShape(initialInspectId)) {
            const page = mounted.pageOf(initialInspectId);
            if (page) mounted.setCurrentPage(page);
            mounted.select(initialInspectId);
            focusShapes(mounted, [initialInspectId]);
          }
          setEditor(mounted);
        }}
      >
        <ComponentPanel />
      </CanvasSurface>
      {(status.status === "offline" ||
        status.status === "error" ||
        Boolean(syncError)) && (
        <div
          role="status"
          className="absolute right-3 bottom-20 z-[350] max-w-xs rounded-lg border bg-popover px-4 py-3 text-sm shadow-sm"
        >
          <p>
            {t(
              status.status === "offline"
                ? "canvas.connectionInterrupted"
                : "canvas.syncFailed",
            )}
          </p>
          {status.status !== "offline" && syncError && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {syncError}
            </p>
          )}
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
      {shareToken === null && (
        <>
          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogTitle>{t("canvas.share.title")}</DialogTitle>
              <DialogDescription>
                {t("canvas.share.description")}
              </DialogDescription>
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
                <Button
                  variant="outline"
                  onClick={() => setTemplateOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={busy || !templateName.trim()}
                  onClick={promote}
                >
                  {t("canvas.saveExample")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </CanvasPageLayout>
  );
}
