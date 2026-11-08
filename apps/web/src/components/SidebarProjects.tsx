import { t, useLocale } from "@/i18n";
import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { History } from "lucide-react";
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
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  assetsOpen: boolean;
}) {
  useLocale();
  const { pathname } = useLocation();
  const [projects, setProjects] = useState<Project[]>(
    () => recentProjects ?? [],
  );
  const [loading, setLoading] = useState(() => recentProjects === undefined);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

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
      className="sidebar-item sidebar-recent-trigger"
      aria-label={t("navigation.projects")}
      data-active={collapsed && pathname.startsWith("/drawing/") && !assetsOpen}
    >
      {collapsed && (
        <span className="sidebar-icon">
          <History className="size-[19px]" />
        </span>
      )}
      <span className="sidebar-label text-xs font-medium">
        {t("navigation.projects")}
      </span>
    </Button>
  );

  return (
    <div className="sidebar-recent">
      <Suspense fallback={recentTrigger}>
        <SidebarRecentMenu
          collapsed={collapsed}
          projects={projects}
          loading={loading}
          error={error && !projects.length}
          onReload={() => setReload((value) => value + 1)}
        >
          {recentTrigger}
        </SidebarRecentMenu>
      </Suspense>
      <nav
        aria-label={t("navigation.projects")}
        className="sidebar-recent-list"
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
