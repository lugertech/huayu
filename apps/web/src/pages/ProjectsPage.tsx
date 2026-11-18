import { readDraft, applyDraft } from "@/features/canvas/drafts";
import { localizeTemplate, templateTag } from "@/i18n/templates";
import { t, useLocale, getLocale } from "@/i18n";
import { errorText, LocalizedError } from "@/i18n/errors";
import { projectCopyName } from "@/features/projects/project-name";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs as ProjectTabs } from "@base-ui/react/tabs";
import {
  ArrowRight,
  Calendar,
  Copy,
  FilePenLine,
  FolderOpen,
  Import,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
  Image,
  Network,
  Globe,
  Volume2,
  FileText,
  X,
} from "lucide-react";
import { ShellSidebarTrigger } from "@/components/Shell";
import { useToast } from "@/components/common/ToastProvider";
import {
  api,
  PROJECTS_CHANGED_EVENT,
  type ProjectChange,
  type Project,
  type Template,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingRegion } from "@/components/ui/loading-region";
import { Card, CardContent } from "@/components/ui/card";
import { searchScore } from "@/lib/search";
import {
  recipeKind,
  templatePresetForRecipe,
  templateSummaries,
} from "@/features/canvas/template-catalog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { ProjectCardMenuProps } from "../features/projects/ProjectCardMenu";
import type { ProjectTooltipProps } from "../features/projects/ProjectTooltip";
import "./projects.css";

const DeferredProjectTooltip = lazy(() =>
  import("../features/projects/ProjectTooltip").then((module) => ({
    default: module.ProjectTooltip,
  })),
);
const DeferredProjectCardMenu = lazy(() =>
  import("../features/projects/ProjectCardMenu").then((module) => ({
    default: module.ProjectCardMenu,
  })),
);

function ProjectTooltip(props: ProjectTooltipProps) {
  return (
    <Suspense fallback={props.children}>
      <DeferredProjectTooltip {...props} />
    </Suspense>
  );
}

function ProjectCardMenu(props: ProjectCardMenuProps) {
  return (
    <Suspense fallback={props.children}>
      <DeferredProjectCardMenu {...props} />
    </Suspense>
  );
}

const recipeIcons = {
  writing: Workflow,
  image: Image,
  chart: Network,
  website: Globe,
  speech: Volume2,
  file: FileText,
};
const quickStartRecipes = [
  {
    id: "builtin-writing",
    recipe: "writing",
    nameKey: "templates.writing.name",
  },
  { id: "builtin-image", recipe: "image", nameKey: "templates.image.name" },
  { id: "builtin-chart", recipe: "chart", nameKey: "templates.chart.name" },
  { id: "builtin-web", recipe: "website", nameKey: "templates.web.name" },
] as const;
const recipeOrder: readonly string[] = quickStartRecipes.map(
  (entry) => entry.recipe,
);

function ProjectListLoading() {
  return (
    <div role="status" className="flex items-center justify-center py-12">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-black motion-reduce:animate-none dark:border-gray-600 dark:border-t-white"
      />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

function editedDate(value: string) {
  return t("projects.updatedOn", {
    date: new Date(value).toLocaleDateString(getLocale()),
  });
}
export function ProjectsPage() {
  const locale = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedExample = templatePresetForRecipe(
    searchParams.get("template") || undefined,
  );
  const { showToast } = useToast();
  const pageRef = useRef<HTMLElement>(null);
  const panelAreaRef = useRef<HTMLDivElement>(null);
  const enteredCards = useRef(new Set<string>());
  const listEntranceAllowed = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const nameDialogTriggerId = useRef("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rawTemplates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [templateError, setTemplateError] = useState(false);
  const [activeTab, setActiveTab] = useState<"projects" | "templates">(
    requestedExample ? "templates" : "projects",
  );
  const [search, setSearch] = useState("");
  const [templateSearchInput, setTemplateSearch] = useState<string>();
  const templateSearch =
    templateSearchInput ??
    (requestedExample
      ? locale === "en"
        ? requestedExample.en.name
        : requestedExample.name
      : "");
  const [tag, setTag] = useState("all");
  const [view, setView] = useState<"grid" | "list">(() =>
    localStorage.getItem("huayu:projects-view") === "list" ? "list" : "grid",
  );
  const [nameDialog, setNameDialog] = useState<{
    type: "duplicate" | "rename";
    project: Pick<Project, "id" | "name"> | null;
  }>({ type: "rename", project: null });
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<Error | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<{
    type: "project" | "template";
    id: string;
    name: string;
  } | null>(null);
  const refreshRequest = useRef<AbortController | null>(null);
  const busy = pending !== null;
  const isCopy = nameDialog.type === "duplicate";
  const initialLoading = loading && !hasLoaded;
  const preservePanelSpace = useCallback((keepScroll = true) => {
    const page = pageRef.current!;
    const area = panelAreaRef.current!;
    const scrollContainer = page.parentElement!;
    const top =
      area.getBoundingClientRect().top -
      scrollContainer.getBoundingClientRect().top +
      (keepScroll ? 0 : scrollContainer.scrollTop);
    const bottom = Number.parseFloat(getComputedStyle(page).paddingBottom);
    area.style.minHeight = `${Math.max(0, scrollContainer.clientHeight - top - bottom)}px`;
  }, []);
  function finishCardEntrance(event: AnimationEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    const card = event.currentTarget;
    enteredCards.current.add(card.dataset.cardEntry!);
    card.dataset.entered = "true";
  }
  function settleListEntrance() {
    listEntranceAllowed.current = false;
    for (const card of panelAreaRef.current!.querySelectorAll<HTMLElement>(
      "[data-card-entry]",
    )) {
      enteredCards.current.add(card.dataset.cardEntry!);
      card.dataset.entered = "true";
    }
  }
  useLayoutEffect(() => {
    const scrollContainer = pageRef.current!.parentElement!;
    const previousGutter = scrollContainer.style.scrollbarGutter;
    const previousOverflowX = scrollContainer.style.overflowX;
    scrollContainer.style.scrollbarGutter = "stable";
    scrollContainer.style.overflowX = "hidden";
    let viewportWidth = -1;
    let resizeFrame: number | undefined;
    const updateLayout = (keepScroll = true) => {
      if (viewportWidth !== window.innerWidth) {
        viewportWidth = window.innerWidth;
        const page = pageRef.current!;
        const sidebar = document.getElementById("app-sidebar");
        const columns = matchMedia("(min-width: 1024px)").matches
          ? 4
          : matchMedia("(min-width: 768px)").matches
            ? 3
            : 1;
        const expandedSidebarWidth =
          columns === 1
            ? 0
            : sidebar
              ? Number.parseFloat(
                  getComputedStyle(sidebar).getPropertyValue(
                    "--sidebar-expanded-width",
                  ),
                )
              : columns === 4
                ? 256
                : 240;
        const style = getComputedStyle(page);
        const gap = Number.parseFloat(
          style.getPropertyValue("--project-card-gap"),
        );
        // Keep the legacy expanded-sidebar size; only viewport resizing changes it.
        const width = Math.max(
          1,
          Math.floor(
            (page.getBoundingClientRect().width +
              (sidebar?.getBoundingClientRect().width || 0) -
              expandedSidebarWidth -
              Number.parseFloat(style.paddingLeft) -
              Number.parseFloat(style.paddingRight) -
              (columns - 1) * gap) /
              columns,
          ),
        );
        page.style.setProperty("--project-card-width", `${width}px`);
        page.style.setProperty("--project-columns", String(columns));
        page.style.setProperty(
          "--project-content-width",
          `${width * columns + (columns - 1) * gap}px`,
        );
      }
      preservePanelSpace(keepScroll);
    };
    const onResize = () => {
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = undefined;
        updateLayout();
      });
    };
    const onScroll = () => {
      if (scrollContainer.scrollTop === 0) preservePanelSpace();
    };
    updateLayout(false);
    window.addEventListener("resize", onResize);
    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      scrollContainer.removeEventListener("scroll", onScroll);
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      scrollContainer.style.scrollbarGutter = previousGutter;
      scrollContainer.style.overflowX = previousOverflowX;
    };
  }, [preservePanelSpace]);
  async function refresh() {
    if (hasLoaded) {
      settleListEntrance();
      preservePanelSpace();
    }
    refreshRequest.current?.abort();
    const controller = new AbortController();
    refreshRequest.current = controller;
    setLoading(true);
    const [projectResult, templateResult] = await Promise.allSettled([
      api<Project[]>("/api/projects", { signal: controller.signal }),
      api<Template[]>("/api/templates", { signal: controller.signal }),
    ]);
    if (controller.signal.aborted) return;
    if (projectResult.status === "fulfilled") {
      setProjects(projectResult.value);
      setError(false);
    } else {
      setError(true);
      if (hasLoaded && projects.length)
        showToast({
          title: t("projects.projectsCannotBeLoaded"),
          variant: "destructive",
        });
    }
    if (templateResult.status === "fulfilled") {
      setTemplates(templateResult.value);
      setTemplateError(false);
    } else {
      setTemplateError(true);
      if (hasLoaded && rawTemplates.length)
        showToast({
          title: t("projects.templates.readFailed"),
          variant: "destructive",
        });
    }
    setHasLoaded(true);
    setLoading(false);
  }
  const refreshOnMount = useEffectEvent(refresh);
  useEffect(() => {
    void refreshOnMount();
    return () => refreshRequest.current?.abort();
  }, []);
  useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<ProjectChange | undefined>).detail;
      if (!change) return;
      setProjects((current) =>
        change.type === "deleted"
          ? current.filter((project) => project.id !== change.id)
          : current.map((project) =>
              project.id === change.project.id ? change.project : project,
            ),
      );
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!initialLoading && requestedExample) {
      setActiveTab("templates");
      document
        .getElementById("projects-library")
        ?.scrollIntoView({ block: "start" });
    }
  }, [initialLoading, requestedExample]);
  function failed(error: unknown) {
    showToast({
      title: t("common.operationFailed"),
      description: errorText(error),
      variant: "destructive",
    });
  }
  async function create() {
    if (busy) return;
    setPending("blank");
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: t("projects.untitled") }),
      });
      navigate(`/drawing/${project.id}`);
    } catch (error) {
      failed(error);
    } finally {
      setPending(null);
    }
  }
  async function fork(template: Pick<Template, "id" | "name">) {
    if (busy) return;
    setPending(template.id);
    try {
      let project = await api<Project>(`/api/templates/${template.id}/fork`, {
        method: "POST",
      });
      if (
        template.id.startsWith("builtin-") &&
        project.name !== template.name
      ) {
        project = await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: template.name }),
        });
      }
      navigate(`/drawing/${project.id}`);
    } catch (error) {
      failed(error);
    } finally {
      setPending(null);
    }
  }
  function openNameDialog(type: "duplicate" | "rename", project: Project) {
    nameDialogTriggerId.current = `project-${type}-${project.id}`;
    setNameDialog({ type, project: { id: project.id, name: project.name } });
    setName(
      type === "duplicate" ? projectCopyName(project.name) : project.name,
    );
    setNameError(null);
  }
  function closeNameDialog() {
    setNameDialog((current) => ({ ...current, project: null }));
  }
  async function duplicate(projectId: string, name: string) {
    const draft = await readDraft(projectId).catch(() => undefined);
    const original = await api<Project>(`/api/projects/${projectId}`);
    let document = applyDraft(original.document, draft);
    if (!document && original.recipe) {
      const [{ Editor, createCanvasStore, getSnapshot }, { applyRecipe }] =
        await Promise.all([
          import("@/features/canvas/editor"),
          import("@/features/canvas/recipes"),
        ]);
      const store = createCanvasStore();
      applyRecipe(new Editor(store), original.recipe);
      document = getSnapshot(store).document;
    }
    const copy = await api<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, document }),
    });
    setProjects((current) => [copy, ...current]);
    showToast({
      title: t("projects.projectCopied"),
      action: {
        label: t("projects.openCopy"),
        onClick: () => navigate(`/drawing/${copy.id}`),
      },
    });
  }
  async function submitName() {
    const { type, project } = nameDialog;
    const trimmedName = name.trim();
    if (!project || !trimmedName || nameBusy) return;
    if (type === "rename" && trimmedName === project.name) {
      closeNameDialog();
      return;
    }
    setNameBusy(true);
    setNameError(null);
    try {
      if (type === "duplicate") {
        await duplicate(project.id, trimmedName);
      } else {
        await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: trimmedName }),
        });
      }
      closeNameDialog();
    } catch (error) {
      setNameError(
        error instanceof Error
          ? error
          : new LocalizedError({ key: "common.operationFailedRetry" }),
      );
    } finally {
      setNameBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    try {
      await api(
        `/api/${deleting.type === "project" ? "projects" : "templates"}/${deleting.id}`,
        { method: "DELETE" },
      );
      if (deleting.type === "project")
        setProjects((current) =>
          current.filter((project) => project.id !== deleting.id),
        );
      else
        setTemplates((current) =>
          current.filter((template) => template.id !== deleting.id),
        );
      setDeleting(null);
    } catch (error) {
      failed(error);
    }
  }
  const shownProjects = projects
    .filter((project) => searchScore(search, project.name))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const templates = rawTemplates.map(localizeTemplate);
  const quickStartTemplates = quickStartRecipes.map((preset) => {
    const saved = templates.find((template) => template.id === preset.id);
    return {
      id: preset.id,
      recipe: preset.recipe,
      name: saved?.name || t(preset.nameKey),
      cover:
        saved?.cover ||
        `/examples/quick-start/${preset.recipe}-${getLocale()}.svg`,
    };
  });
  const builtinTags = new Map(
    rawTemplates
      .filter((template) => template.id.startsWith("builtin-"))
      .flatMap((template) =>
        template.tags.map((tag) => [tag, templateTag(template, tag)] as const),
      ),
  );
  const exampleOrder = templateSummaries
    .filter((preset) => preset.showcase)
    .map((preset) => preset.id);
  const shownTemplates = templates
    .filter(
      (template) =>
        (tag === "all" || template.tags.includes(tag)) &&
        searchScore(
          templateSearch,
          template.name,
          `${template.description} ${template.tags.map((tag) => templateTag(template, tag)).join(" ")}`,
        ),
    )
    .sort((a, b) => {
      const first = exampleOrder.indexOf(a.id);
      const second = exampleOrder.indexOf(b.id);
      return (
        (first < 0 ? exampleOrder.length : first) -
        (second < 0 ? exampleOrder.length : second)
      );
    });
  const activeSearch = activeTab === "projects" ? search : templateSearch;
  const setActiveSearch = (value: string) => {
    settleListEntrance();
    preservePanelSpace();
    if (activeTab === "projects") setSearch(value);
    else setTemplateSearch(value);
  };
  const importAction = (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,.tldr,.excalidraw"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setPending("import");
          try {
            const { importProject } =
              await import("@/features/canvas/transfer");
            const project = await importProject(file);
            navigate(`/drawing/${project.id}`);
          } catch (error) {
            failed(error);
          } finally {
            setPending(null);
          }
        }}
      />
      <Button
        variant="outline"
        className="project-import-button"
        disabled={busy}
        onClick={() => input.current?.click()}
        aria-label={t("projects.importProject")}
        aria-busy={pending === "import"}
      >
        {pending === "import" ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Import />
        )}
        <span>{t("projects.importProject")}</span>
      </Button>
    </>
  );
  return (
    <>
      <main
        ref={pageRef}
        className="projects-page w-full px-4 py-8 sm:px-6"
        data-view={view}
      >
        <div className="project-page-content">
          <section aria-label={t("projects.quickStart")}>
            <div className="mb-5 flex md:hidden">
              <ShellSidebarTrigger />
            </div>
            <div className="quick-start-scroll">
              <button
                className="project-quick-card"
                aria-busy={pending === "blank"}
                onClick={create}
                disabled={busy}
              >
                <div className="project-quick-cover">
                  {pending === "blank" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                </div>
                <p className="project-quick-title">
                  {t("projects.createNewProject")}
                </p>
              </button>
              {quickStartTemplates.map((template) => (
                <button
                  key={template.id}
                  className="project-quick-card"
                  aria-busy={pending === template.id}
                  disabled={busy}
                  onClick={() => fork(template)}
                >
                  <div className="project-thumbnail project-quick-cover">
                    <img
                      src={template.cover}
                      alt=""
                      width={960}
                      height={540}
                      decoding="async"
                      className="project-quick-preview"
                    />
                    {pending === template.id && (
                      <div className="project-preview-loading">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="project-quick-title" title={template.name}>
                    {template.name}
                  </p>
                </button>
              ))}
            </div>
          </section>
          <ProjectTabs.Root
            id="projects-library"
            className="mt-6"
            value={activeTab}
            onValueChange={(value) => {
              const next = value === "templates" ? "templates" : "projects";
              if (next === activeTab) return;
              settleListEntrance();
              preservePanelSpace();
              setActiveTab(next);
            }}
          >
            <div className="project-library-toolbar">
              <ProjectTabs.List
                className="project-list-tabs"
                aria-label={t("projects.listTabs")}
              >
                <ProjectTabs.Tab className="project-list-tab" value="projects">
                  {t("projects.myProjects")}
                </ProjectTabs.Tab>
                <ProjectTabs.Tab className="project-list-tab" value="templates">
                  {t("projects.exampleProjects")}
                </ProjectTabs.Tab>
              </ProjectTabs.List>
              <div className="project-library-actions">
                {importAction}
                <div className="project-search-wrap">
                  <Search className="project-search-icon" />
                  <Input
                    ref={searchInput}
                    aria-label={t(
                      activeTab === "projects"
                        ? "projects.searchProjects.label"
                        : "projects.searchTemplates.label",
                    )}
                    placeholder={t(
                      activeTab === "projects"
                        ? "projects.searchProjects.placeholder"
                        : "projects.searchTemplates.placeholder",
                    )}
                    className="project-list-search pr-9 pl-9"
                    value={activeSearch}
                    onChange={(event) => setActiveSearch(event.target.value)}
                  />
                  {activeSearch && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("recordings.clearSearch")}
                      className="project-search-clear"
                      onClick={() => setActiveSearch("")}
                    >
                      <X />
                    </Button>
                  )}
                </div>
                <div
                  className="project-view-toggle"
                  role="group"
                  aria-label={t("projects.viewMode")}
                >
                  {(["grid", "list"] as const).map((mode) => {
                    const Icon = mode === "grid" ? LayoutGrid : List;
                    const label = t(
                      mode === "grid"
                        ? "projects.gridView"
                        : "projects.listView",
                    );
                    const button = (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="project-view-button border-0 text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground dark:aria-pressed:bg-accent"
                        aria-label={label}
                        aria-pressed={view === mode}
                        onClick={() => {
                          if (view === mode) return;
                          settleListEntrance();
                          preservePanelSpace();
                          setView(mode);
                          localStorage.setItem("huayu:projects-view", mode);
                        }}
                      >
                        <Icon aria-hidden="true" />
                      </Button>
                    );
                    return (
                      <ProjectTooltip key={mode} label={label} side="bottom">
                        {button}
                      </ProjectTooltip>
                    );
                  })}
                </div>
              </div>
            </div>
            <div ref={panelAreaRef} className="project-library-panels">
              <ProjectTabs.Panel
                className="project-list-panel"
                value="projects"
                hidden={activeTab !== "projects"}
                aria-busy={loading}
                keepMounted
              >
                <LoadingRegion
                  id={
                    view === "grid"
                      ? "huayu:project-list"
                      : "huayu:project-list:rows"
                  }
                  loading={initialLoading}
                  empty={!shownProjects.length}
                  error={!!error && !projects.length}
                  placeholder={
                    <div className="project-card-grid">
                      {["72%", "56%", "84%", "64%"].map((width) => (
                        <div className="project-card-slot" key={width}>
                          <Card className="project-list-card">
                            <div
                              skullet-block=""
                              className="project-card-cover"
                            />
                            <CardContent className="project-card-content">
                              <div className="project-card-heading items-center">
                                <span
                                  skullet-block=""
                                  className="h-4 rounded"
                                  style={{ width }}
                                />
                              </div>
                              <div className="project-card-meta">
                                <span
                                  skullet-block=""
                                  className="h-3 w-28 rounded"
                                />
                                <span
                                  skullet-block=""
                                  className="h-3 w-8 rounded"
                                />
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  }
                >
                  {error && !projects.length ? (
                    <div
                      role="alert"
                      className="rounded-xl border p-8 text-center"
                    >
                      <p className="mb-4 text-sm text-muted-foreground">
                        {t("projects.projectsCannotBeLoaded")}
                      </p>
                      <Button
                        variant="outline"
                        disabled={loading}
                        onClick={refresh}
                      >
                        {t("common.reload")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {shownProjects.length ? (
                        <div
                          className="project-card-grid"
                          role="list"
                          aria-label={t("projects.myProjects")}
                        >
                          {shownProjects.map((project) => (
                            <div
                              className="project-card-slot"
                              key={project.id}
                              role="listitem"
                            >
                              <ProjectCardMenu
                                onDuplicate={() =>
                                  openNameDialog("duplicate", project)
                                }
                              >
                                <Card className="project-list-card">
                                  <button
                                    className="project-thumbnail project-card-cover"
                                    aria-label={t("recordings.open", {
                                      arg0: project.name,
                                    })}
                                    onClick={() =>
                                      navigate(`/drawing/${project.id}`)
                                    }
                                  >
                                    {project.cover ? (
                                      <img
                                        src={project.cover}
                                        alt=""
                                        className="project-card-preview"
                                      />
                                    ) : (
                                      <FilePenLine
                                        className="size-7 text-muted-foreground opacity-40"
                                        strokeWidth={1.5}
                                      />
                                    )}
                                  </button>
                                  <CardContent className="project-card-content">
                                    <div className="project-card-heading">
                                      <button
                                        className="project-card-title"
                                        title={project.name}
                                        onClick={() =>
                                          navigate(`/drawing/${project.id}`)
                                        }
                                      >
                                        {project.name}
                                      </button>
                                      <div className="project-card-actions">
                                        <ProjectTooltip
                                          label={t("projects.duplicateProject")}
                                        >
                                          <button
                                            id={`project-duplicate-${project.id}`}
                                            type="button"
                                            className="project-card-action"
                                            aria-label={`${t("projects.duplicateProject")}: ${project.name}`}
                                            aria-haspopup="dialog"
                                            onClick={() =>
                                              openNameDialog(
                                                "duplicate",
                                                project,
                                              )
                                            }
                                          >
                                            <Copy aria-hidden="true" />
                                          </button>
                                        </ProjectTooltip>
                                        <ProjectTooltip
                                          label={t("projects.renameProject")}
                                        >
                                          <button
                                            id={`project-rename-${project.id}`}
                                            type="button"
                                            className="project-card-action project-card-action-edit"
                                            aria-label={`${t("projects.renameProject")}: ${project.name}`}
                                            aria-haspopup="dialog"
                                            onClick={() =>
                                              openNameDialog("rename", project)
                                            }
                                          >
                                            <Pencil aria-hidden="true" />
                                          </button>
                                        </ProjectTooltip>
                                        <ProjectTooltip
                                          label={t("projects.deleteProject")}
                                        >
                                          <button
                                            type="button"
                                            className="project-card-action project-card-action-delete"
                                            aria-label={`${t("projects.deleteProject")}: ${project.name}`}
                                            onClick={() =>
                                              setDeleting({
                                                type: "project",
                                                id: project.id,
                                                name: project.name,
                                              })
                                            }
                                          >
                                            <Trash2 aria-hidden="true" />
                                          </button>
                                        </ProjectTooltip>
                                      </div>
                                    </div>
                                    <div className="project-card-meta">
                                      <p
                                        className="project-card-meta-text project-card-updated-at"
                                        title={new Date(
                                          project.updated_at,
                                        ).toLocaleString(getLocale())}
                                      >
                                        <Calendar className="size-3 shrink-0" />
                                        <span className="truncate">
                                          {editedDate(project.updated_at)}
                                        </span>
                                      </p>
                                      <button
                                        className="project-card-open"
                                        onClick={() =>
                                          navigate(`/drawing/${project.id}`)
                                        }
                                      >
                                        {t("projects.open")}
                                        <ArrowRight className="size-3" />
                                      </button>
                                    </div>
                                  </CardContent>
                                </Card>
                              </ProjectCardMenu>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center rounded-xl border border-dashed py-20">
                          <FolderOpen className="mb-4 size-9 text-muted-foreground" />
                          <h2 className="text-base font-medium">
                            {search.trim()
                              ? t("projects.noMatchingProjects")
                              : t("projects.empty.title")}
                          </h2>
                          <p className="mt-2 mb-5 text-sm text-muted-foreground">
                            {search.trim()
                              ? t("recordings.tryDifferentKeywords")
                              : t(
                                  "projects.createABlankCanvasOrStartFromAnExample",
                                )}
                          </p>
                          {search.trim() ? (
                            <Button
                              variant="outline"
                              onClick={() => setActiveSearch("")}
                            >
                              {t("projects.viewAllProjects")}
                            </Button>
                          ) : (
                            <Button onClick={create} disabled={busy}>
                              <Plus />
                              {t("projects.createProject")}
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </LoadingRegion>
              </ProjectTabs.Panel>
              <ProjectTabs.Panel
                className="project-list-panel project-list-panel-examples"
                value="templates"
                hidden={activeTab !== "templates"}
                aria-busy={loading}
                keepMounted
              >
                {initialLoading ? (
                  <ProjectListLoading />
                ) : (
                  <>
                    {templateError && !rawTemplates.length && (
                      <div
                        role="alert"
                        className="mb-5 flex items-center justify-between gap-3 rounded-lg border p-4"
                      >
                        <p className="text-sm text-muted-foreground">
                          {t("projects.templates.readFailed")}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={refresh}
                        >
                          {t("common.reload")}
                        </Button>
                      </div>
                    )}
                    <div className="project-template-filters">
                      {[
                        "all",
                        ...new Set(
                          templates.flatMap((template) => template.tags),
                        ),
                      ].map((value) => (
                        <button
                          type="button"
                          key={value}
                          className="project-template-filter"
                          data-active={tag === value ? "" : undefined}
                          aria-pressed={tag === value}
                          onClick={() => {
                            settleListEntrance();
                            preservePanelSpace();
                            setTag(value);
                          }}
                        >
                          {value === "all"
                            ? t("common.all")
                            : (builtinTags.get(value) ?? value)}
                        </button>
                      ))}
                    </div>
                    <div
                      className="project-card-grid"
                      role="list"
                      aria-label={t("projects.exampleProjects")}
                    >
                      {shownTemplates.map((template) => {
                        const Icon =
                          recipeIcons[recipeKind(template.recipe)] || Workflow;
                        const cover =
                          template.cover ||
                          (recipeOrder.includes(template.recipe || "")
                            ? `/examples/quick-start/${template.recipe}-${getLocale()}.svg`
                            : null);
                        return (
                          <div
                            className="project-card-slot"
                            key={template.id}
                            role="listitem"
                          >
                            <Card
                              className="project-list-card project-card-enter"
                              data-card-entry={`template:${template.id}`}
                              data-entered={
                                !listEntranceAllowed.current ||
                                enteredCards.current.has(
                                  `template:${template.id}`,
                                ) ||
                                undefined
                              }
                              onAnimationEnd={finishCardEntrance}
                            >
                              <button
                                className="project-thumbnail project-card-cover"
                                aria-label={t("projects.use", {
                                  arg0: template.name,
                                })}
                                disabled={busy}
                                onClick={() => fork(template)}
                              >
                                {cover ? (
                                  <img
                                    src={cover}
                                    alt=""
                                    className="project-card-preview"
                                  />
                                ) : (
                                  <Icon className="size-9 text-muted-foreground opacity-50" />
                                )}
                              </button>
                              <CardContent className="project-card-content">
                                <div className="project-card-heading">
                                  <button
                                    className="project-card-title"
                                    title={`${template.name}\n${template.description || t("projects.savedCanvasExample")}`}
                                    disabled={busy}
                                    onClick={() => fork(template)}
                                  >
                                    {template.name}
                                  </button>
                                  {!template.id.startsWith("builtin-") && (
                                    <div className="project-card-actions">
                                      <ProjectTooltip
                                        label={t("common.delete")}
                                      >
                                        <button
                                          type="button"
                                          className="project-card-action project-card-action-delete"
                                          aria-label={t(
                                            "projects.deleteExample",
                                            {
                                              arg0: template.name,
                                            },
                                          )}
                                          onClick={() =>
                                            setDeleting({
                                              type: "template",
                                              id: template.id,
                                              name: template.name,
                                            })
                                          }
                                        >
                                          <Trash2 aria-hidden="true" />
                                        </button>
                                      </ProjectTooltip>
                                    </div>
                                  )}
                                </div>
                                <div className="project-card-meta">
                                  <p className="project-card-meta-text">
                                    <Copy className="size-3 shrink-0" />
                                    <span className="truncate">
                                      {t("projects.forkCount", {
                                        count: template.fork_count,
                                      })}
                                    </span>
                                  </p>
                                  <button
                                    className="project-card-open"
                                    disabled={busy}
                                    onClick={() => fork(template)}
                                  >
                                    {t("projects.view")}
                                    {pending === template.id ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <ArrowRight className="size-3" />
                                    )}
                                  </button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        );
                      })}
                    </div>
                    {(!templateError || rawTemplates.length > 0) &&
                      !shownTemplates.length && (
                        <div className="py-16 text-center">
                          <p className="text-sm text-muted-foreground">
                            {t("projects.noMatchingTemplates")}
                          </p>
                          <Button
                            className="mt-4"
                            variant="outline"
                            onClick={() => {
                              settleListEntrance();
                              preservePanelSpace();
                              setTemplateSearch("");
                              setTag("all");
                            }}
                          >
                            {t("projects.clearFilters")}
                          </Button>
                        </div>
                      )}
                  </>
                )}
              </ProjectTabs.Panel>
            </div>
          </ProjectTabs.Root>
        </div>
      </main>
      <Dialog
        open={nameDialog.project !== null}
        onOpenChange={(open) => {
          if (!open && !nameBusy) closeNameDialog();
        }}
      >
        <DialogContent
          initialFocus={nameInput}
          finalFocus={() =>
            document.getElementById(nameDialogTriggerId.current) ??
            searchInput.current
          }
          showCloseButton={!nameBusy}
          aria-describedby={undefined}
        >
          <DialogTitle>
            {t(isCopy ? "projects.duplicateProject" : "projects.renameProject")}
          </DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitName();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="project-name-dialog-input">
                {t("projects.projectName")}
              </Label>
              <Input
                ref={nameInput}
                id="project-name-dialog-input"
                value={name}
                readOnly={nameBusy}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.nativeEvent.isComposing ||
                      event.nativeEvent.keyCode === 229)
                  )
                    event.preventDefault();
                }}
              />
            </div>
            {nameError && (
              <p role="alert" className="text-sm text-destructive">
                {errorText(nameError, locale)}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={nameBusy}
                onClick={closeNameDialog}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim() || nameBusy}>
                {nameBusy && (
                  <Loader2 className="animate-spin motion-reduce:animate-none" />
                )}
                {isCopy
                  ? t(nameBusy ? "projects.copying" : "common.copy")
                  : t(nameBusy ? "recordings.saving" : "common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {t("recordings.delete", { name: deleting?.name || "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("projects.thisCannotBeUndone")}
            {deleting?.type === "project"
              ? t("projects.exportAnythingYouWantToKeepFirst")
              : t("projects.projectsAlreadyCreatedFromThisExampleWillBeKept")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
