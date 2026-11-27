import { errorText } from "@/i18n/errors";
import { LocaleContext, t as appT, useTranslations } from "@/i18n";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { loadSnapshot, type Editor } from "@/features/canvas/engine/editor";
import { Bounds } from "@/features/canvas/engine/bounds";
import type { CanvasSession } from "@/features/canvas/engine/model";
import { ExcalidrawSurface as CanvasSurface } from "@/features/canvas/excalidraw/ExcalidrawSurface";
import {
  useBoardLanguage,
  type BoardLanguage,
} from "@/features/canvas/excalidraw/board-language";
import { UserRoundPlus, ArrowLeft, Play, Square } from "lucide-react";
import { MainMenu } from "@excalidraw/excalidraw";
import { ShellSidebarTrigger } from "@/components/Shell";
import { CanvasToolbarTooltip } from "@/features/canvas/components/CanvasToolbarTooltip";
import { Collaborators } from "@/features/canvas/components/Collaborators";
import { CanvasPageLayout } from "@/features/canvas/components/CanvasPageLayout";
import { focusShapes } from "@/workflow/context";
import { ComponentPanel } from "@/features/canvas/components/ComponentPanel";
import { useToast } from "@/components/common/ToastProvider";
import { RecorderButton } from "@/features/recording/RecorderButton";
import { blobAsDataURL } from "@/api/resources";
import {
  api,
  PROJECTS_CHANGED_EVENT,
  type ProjectChange,
  type Project,
} from "@/api/client";
import { CanvasSync, type CollaborationExit } from "@/features/canvas/sync";
import { saveView, type RecordPatch } from "@/features/canvas/drafts";
import {
  thumbnailScale,
  needsThumbnailRefresh,
  thumbnailStamp,
} from "@/features/canvas/thumbnail";
import { exportProject } from "@/features/canvas/transfer";
import { useTheme } from "@/lib/theme";
import {
  runProjectWorkflow,
  stopAllExecutions,
  useWorkflowState,
} from "@/workflow/execute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rememberOpenedProject } from "@/lib/recent-project";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { CollaborationNotice } from "./components/CollaborationNotice";
import { CanvasModelPicker } from "./components/CanvasModelPicker";
import { canvasErrorToast } from "./components/CanvasErrorToast";

function CanvasRunControl({ editor }: { editor: Editor }) {
  const { t } = useTranslations();
  const { showToast } = useToast();
  const { busy, stopping } = useWorkflowState(editor);
  if (busy) {
    return (
      <div className="board-run-controls flex h-8 items-center gap-1 px-1">
        <span
          className="board-toolbar-run-label pl-1.5 text-xs whitespace-nowrap"
          role="status"
        >
          {t(stopping ? "workflow.status.stopping" : "canvas.node.running")}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-destructive"
          disabled={stopping}
          aria-label={t("canvas.node.stopRun")}
          onClick={() => stopAllExecutions(editor)}
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      className="board-toolbar-button board-toolbar-run"
      aria-label={t("workflow.runWorkflow")}
      onClick={() =>
        void runProjectWorkflow(editor).catch((error: unknown) =>
          showToast(canvasErrorToast(editor, error)),
        )
      }
    >
      <Play />
      <span className="board-toolbar-run-label">{t("canvas.models.run")}</span>
    </Button>
  );
}

export interface DrawingCanvasProps {
  project: Project;
  draft?: RecordPatch;
  view?: unknown;
  shareToken: string | null;
  initializeRecipe?: typeof import("@/features/canvas/recipes").applyRecipe;
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
  const { t, locale } = useTranslations();
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
    typeof status.error === "string"
      ? t(status.error)
      : status.error && errorText(status.error, locale);
  const { resolved } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const inspectId = route.state?.inspectShapeId;
  useEffect(() => {
    if (inspectId)
      navigate(route.pathname + route.search, { replace: true, state: null });
  }, [inspectId, navigate, route.pathname, route.search]);
  const [backTipOpen, setBackTipOpen] = useState(false);
  const backHover = useRef({
    moved: false,
    transition: null as Animation | null,
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(initial.name);
  const [templateDescription, setTemplateDescription] = useState("");
  const [busy, setBusy] = useState(false);
  function failed(error: unknown) {
    showToast({
      title: t("common.operationFailed"),
      description:
        error instanceof Error
          ? errorText(error, locale)
          : t("common.tryAgain"),
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
    let coverTimer: ReturnType<typeof setTimeout> | undefined;
    let coverJob: (() => Promise<void>) | undefined;
    let documentChanged = false;
    let disposed = false;
    const unsubscribe = editor.store.listen(
      () => {
        clearTimeout(viewTimer);
        viewTimer = setTimeout(() => {
          void saveView(project.id, editor.store.getSessionSnapshot()).catch(
            () => {},
          );
        }, 500);
      },
      { scope: "session" },
    );
    const previewKey = `huayu:thumbnail:${project.id}`;
    function scheduleCover(delay = 1000, attempt = 0) {
      if (shareToken !== null) return;
      clearTimeout(coverTimer);
      const renderImage = editor.getImageExporter();
      async function render() {
        try {
          await sync.flush();
          if (render !== coverJob) return;
          const revision = sync.getSnapshot().revision;
          const ids = [...editor.getCurrentPageShapeIds()];
          let cover: string | null = null;
          if (ids.length) {
            const bounds = Bounds.union(
              ids.map((id) => editor.getShapePageBounds(id)!).filter(Boolean),
            );
            let scale = thumbnailScale(bounds.w + 40, bounds.h + 40);
            let blob: Blob | undefined;
            for (let sizeAttempt = 0; sizeAttempt < 3; sizeAttempt++) {
              if (render !== coverJob) return;
              ({ blob } = await renderImage(ids, {
                format: "png",
                scale,
                background: false,
                padding: 20,
              }));
              if (blob.size <= 350000) break;
              scale *= 0.6;
            }
            if (render !== coverJob) return;
            if (!blob || blob.size > 350000) return;
            cover = await blobAsDataURL(blob);
          }
          if (render !== coverJob) return;

          await api(`/api/projects/${project.id}`, {
            method: "PATCH",
            body: JSON.stringify({ cover, cover_revision: revision }),
          });
          if (render !== coverJob) return;

          try {
            if (cover)
              localStorage.setItem(previewKey, thumbnailStamp(cover, revision));
            else localStorage.removeItem(previewKey);
          } catch {
            /* The preview remains usable when browser storage is unavailable. */
          }
        } catch {
          if (!disposed && render === coverJob && attempt < 2)
            scheduleCover(1500 * (attempt + 1), attempt + 1);
        }
      }
      coverJob = render;
      coverTimer = setTimeout(() => {
        coverTimer = undefined;
        void render();
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
      (project.cover || editor.getCurrentPageShapeIds().size) &&
      needsThumbnailRefresh(
        project.cover,
        bounds.w + 40,
        bounds.h + 40,
        stamp,
        sync.getSnapshot().revision,
      )
    )
      scheduleCover(800);
    const documentUnsubscribe = editor.store.listen(
      (entry) => {
        if (entry.source === "user") documentChanged = true;
        scheduleCover();
      },
      { scope: "document" },
    );
    return () => {
      disposed = true;
      clearTimeout(viewTimer);
      clearTimeout(coverTimer);
      // Navigation may precede the debounce. Finish the edited revision for the project list.
      if (!documentChanged) coverJob = undefined;
      else if (coverTimer !== undefined) void coverJob?.();
      unsubscribe();
      documentUnsubscribe();
      void saveView(project.id, editor.store.getSessionSnapshot()).catch(
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
      await exportProject(project.name, editor.store.getDocumentSnapshot());
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
        <CanvasToolbarTooltip
          label={t("navigation.backToProjects")}
          open={backTipOpen}
          onOpenChange={(open, details) => {
            if (open && details.reason === "trigger-hover") {
              const transition = document
                .getElementById("app-sidebar")
                ?.getAnimations()
                .find(
                  (animation) =>
                    animation instanceof CSSTransition &&
                    animation.transitionProperty === "width" &&
                    animation.playState === "running",
                );
              if (transition) {
                details.cancel();
                const hover = backHover.current;
                hover.transition = transition;
                const trigger = details.trigger;
                void transition.finished.then(
                  () => {
                    if (
                      backHover.current === hover &&
                      hover.transition === transition &&
                      hover.moved &&
                      trigger?.matches(":hover")
                    ) {
                      hover.transition = null;
                      setBackTipOpen(true);
                    }
                  },
                  () => {},
                );
                return;
              }
            }
            backHover.current.transition = null;
            setBackTipOpen(open);
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="board-toolbar-back"
            onPointerMove={(event) => {
              if (
                event.pointerType !== "mouse" ||
                !(event.movementX || event.movementY)
              )
                return;
              const hover = backHover.current;
              hover.moved = true;
              if (hover.transition?.playState === "finished") {
                hover.transition = null;
                setBackTipOpen(true);
              }
            }}
            onPointerLeave={() => {
              backHover.current = { moved: false, transition: null };
            }}
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
    <CanvasPageLayout shared={shareToken !== null} projectName={project.name}>
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
                  {shareToken === null && (
                    <RecorderButton
                      toolbar
                      renderTrigger={(trigger, label) => (
                        <CanvasToolbarTooltip label={label}>
                          {trigger}
                        </CanvasToolbarTooltip>
                      )}
                    />
                  )}
                  <span
                    className="board-toolbar-native-menu-slot"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CanvasModelPicker editor={editor} />
                  <CanvasRunControl editor={editor} />
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
