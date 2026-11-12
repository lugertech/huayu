import { t, useLocale } from "@/i18n";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, History, Loader2, SquarePen } from "lucide-react";
import { api, PROJECTS_CHANGED_EVENT, type Project } from "@/api/client";
import { Button } from "@/components/ui/button";
import { LoadingRegion } from "@/components/ui/loading-region";
import { SidebarProjectsPlaceholder } from "./SidebarProjectsPlaceholder";
import { SidebarProjectHighlight } from "./SidebarProjectHighlight";

// Retain the last successful list when returning from a separate canvas layout.
let recentProjects: Project[] | undefined;
const loadProjectItem = () => import("./SidebarProjectItem");
const SidebarProjectItem = lazy(() =>
  loadProjectItem().then((module) => ({ default: module.SidebarProjectItem })),
);
const SidebarRecentMenu = lazy(() =>
  import("./SidebarRecentMenu").then((module) => ({
    default: module.SidebarRecentMenu,
  })),
);

export function SidebarProjects({
  collapsed,
  onNavigate,
  assetsOpen,
  onCreateProject,
  creating,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  assetsOpen: boolean;
  onCreateProject: () => void;
  creating: boolean;
}) {
  useLocale();
  const { pathname } = useLocation();
  const [projects, setProjects] = useState<Project[]>(
    () => recentProjects ?? [],
  );
  const [loading, setLoading] = useState(() => recentProjects === undefined);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const listId = useId();
  const listRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current!;
    const updateScrollEdges = () => {
      const { scrollTop, scrollHeight, clientHeight } = list;
      list.toggleAttribute("data-scroll-above", scrollTop > 1);
      list.toggleAttribute(
        "data-scroll-below",
        scrollHeight - clientHeight - scrollTop > 1,
      );
    };
    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(list);
    observer.observe(list.firstElementChild!);
    list.addEventListener("scroll", updateScrollEdges, { passive: true });
    updateScrollEdges();
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", updateScrollEdges);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      setError(false);
      try {
        const [projects] = await Promise.all([
          api<Project[]>("/api/projects", {
            signal: controller.signal,
          }),
          loadProjectItem(),
        ]);
        if (!controller.signal.aborted) {
          recentProjects = projects;
          setProjects(projects);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const changed = () => setReload((value) => value + 1);
    window.addEventListener(PROJECTS_CHANGED_EVENT, changed);
    return () => {
      controller.abort();
      window.removeEventListener(PROJECTS_CHANGED_EVENT, changed);
    };
  }, [pathname, reload]);

  const recentTrigger = (
    <Button
      variant="ghost"
      className="sidebar-item"
      aria-label={t("navigation.projects")}
      data-active={pathname.startsWith("/drawing/") && !assetsOpen}
    >
      <span className="sidebar-icon">
        <History />
      </span>
    </Button>
  );

  return (
    <div className="sidebar-recent">
      {collapsed ? (
        <Suspense fallback={recentTrigger}>
          <SidebarRecentMenu
            projects={projects}
            loading={loading}
            error={error && !projects.length}
            onReload={() => setReload((value) => value + 1)}
          >
            {recentTrigger}
          </SidebarRecentMenu>
        </Suspense>
      ) : (
        <div className="sidebar-recent-header">
          <Button
            variant="ghost"
            size="sm"
            className="sidebar-recent-toggle"
            aria-controls={listId}
            aria-expanded={projectsOpen}
            onClick={() => setProjectsOpen((open) => !open)}
          >
            <span className="text-[13px] font-medium text-[#737373] dark:text-[#8c8c8c]">
              {t("navigation.projects")}
            </span>
            <ChevronDown aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sidebar-recent-create"
            aria-label={t("projects.create")}
            title={t("projects.create")}
            aria-busy={creating}
            disabled={creating}
            onClick={onCreateProject}
          >
            {creating ? <Loader2 className="animate-spin" /> : <SquarePen />}
          </Button>
        </div>
      )}
      <nav
        id={listId}
        ref={listRef}
        aria-label={t("navigation.projects")}
        className="sidebar-recent-list"
        hidden={!projectsOpen}
        inert={collapsed}
      >
        <LoadingRegion
          id="huayu:sidebar-projects"
          loading={loading}
          empty={!projects.length}
          error={error && !projects.length}
          placeholder={<SidebarProjectsPlaceholder />}
        >
          {error && !projects.length ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => setReload((value) => value + 1)}
            >
              {t("projects.reload")}
            </Button>
          ) : !projects.length ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("projects.empty.title")}
            </p>
          ) : (
            <div className="sidebar-project-list">
              <SidebarProjectHighlight />
              {projects.slice(0, 20).map((project) => (
                <Suspense
                  key={project.id}
                  fallback={
                    <NavLink
                      to={`/drawing/${project.id}`}
                      onClick={onNavigate}
                      title={project.name}
                      className="sidebar-item"
                    >
                      <span className="sidebar-label">{project.name}</span>
                    </NavLink>
                  }
                >
                  <SidebarProjectItem
                    project={project}
                    onNavigate={onNavigate}
                  />
                </Suspense>
              ))}
            </div>
          )}
        </LoadingRegion>
      </nav>
    </div>
  );
}
