import { t, useLocale } from "@/i18n";
import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FilePenLine,
  FolderOpen,
  History,
  Loader2,
  PanelLeft,
  Settings,
  SquarePen,
  Video,
  X,
  PanelsTopLeft,
  Search,
  Images,
} from "lucide-react";
import { api, PROJECTS_CHANGED_EVENT, type Project } from "@/api/client";
import { Button } from "@/ui/button";
import { Kbd } from "@/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { useToast } from "./common/ToastProvider";

const NAVIGATION = [
  ["/projects", "navigation.projects", FolderOpen],
  ["/recordings", "navigation.recordings", Video],
  ["/library", "assets.title", Images],
] as const;
// Retain the last successful list when returning from a separate canvas layout.
let recentProjects: Project[] | undefined;
const SidebarRecentMenu = lazy(() =>
  import("./SidebarRecentMenu").then((module) => ({
    default: module.SidebarRecentMenu,
  })),
);

function SidebarTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactElement;
}) {
  return (
    <Tooltip disabled={!collapsed}>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  mobile = false,
  collapsed = false,
  onClose,
  onNavigate,
  onSettings,
  onSearch,
  onAssets,
  assetsOpen = false,
}: {
  mobile?: boolean;
  collapsed?: boolean;
  onClose: () => void;
  onNavigate?: () => void;
  onSettings: () => void;
  onSearch: () => void;
  onAssets?: () => void;
  assetsOpen?: boolean;
}) {
  useLocale();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isMac = navigator.platform.includes("Mac");
  const [projects, setProjects] = useState<Project[]>(
    () => recentProjects ?? [],
  );
  const [loading, setLoading] = useState(() => recentProjects === undefined);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      setError(false);
      try {
        const projects = await api<Project[]>("/api/projects", {
          signal: controller.signal,
        });
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

  async function createProject() {
    setCreating(true);
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: t("projects.untitled") }),
      });
      navigate(`/drawing/${project.id}`);
      onNavigate?.();
    } catch (error) {
      showToast({
        title: t("projects.createFailed"),
        description:
          error instanceof Error ? error.message : t("common.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  const recentTrigger = (
    <Button
      variant="ghost"
      className="sidebar-item sidebar-recent-trigger"
      aria-label={t("projects.recent")}
      data-active={collapsed && pathname.startsWith("/drawing/") && !assetsOpen}
    >
      <span className="sidebar-icon">
        <History className="size-[19px]" />
      </span>
      <span className="sidebar-label text-xs font-medium text-muted-foreground">
        {t("projects.recent")}
      </span>
    </Button>
  );

  return (
    <div className="sidebar-content" data-collapsed={collapsed}>
      <div className="sidebar-header">
        {mobile ? (
          <Link
            to="/projects"
            className="sidebar-mobile-brand"
            aria-label={t("app.homeLabel")}
            onClick={onNavigate}
          >
            <span className="sidebar-brand-button">
              <span className="sidebar-brand-mark">
                <PanelsTopLeft className="size-4" />
              </span>
            </span>
            <span className="sidebar-label sidebar-brand-label">
              {t("app.brand")}
            </span>
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="sidebar-brand-button"
            aria-label={t(
              collapsed
                ? "navigation.expandSidebar"
                : "navigation.collapseSidebar",
            )}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            onClick={onClose}
          >
            <span className="sidebar-brand-mark">
              <PanelsTopLeft className="size-4" />
            </span>
            <PanelLeft className="sidebar-brand-toggle size-[19px]" />
          </Button>
        )}
        {!mobile && (
          <Link
            to="/projects"
            aria-label={t("app.homeLabel")}
            aria-hidden={collapsed || undefined}
            tabIndex={collapsed ? -1 : undefined}
            onClick={onNavigate}
            className="sidebar-label sidebar-brand-label"
          >
            {t("app.brand")}
          </Link>
        )}
        <Tooltip disabled={collapsed}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="sidebar-search-button"
                aria-label={t("search.triggerLabel")}
                aria-haspopup="dialog"
                aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
                aria-hidden={collapsed || undefined}
                tabIndex={collapsed ? -1 : 0}
                onClick={onSearch}
              >
                <Search className="size-[19px]" />
              </Button>
            }
          />
          <TooltipContent
            side="bottom"
            sideOffset={8}
            className="sidebar-search-tooltip"
          >
            {t("search.triggerLabel")}
            {!mobile && (
              <Kbd className="sidebar-search-shortcut" aria-hidden="true">
                <span>{isMac ? "⌘" : "Ctrl"}</span>
                <span>K</span>
              </Kbd>
            )}
          </TooltipContent>
        </Tooltip>
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="sidebar-collapse-button"
            aria-label={t("navigation.collapseSidebar")}
            title={t("navigation.collapseSidebar")}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            aria-hidden={collapsed || undefined}
            tabIndex={collapsed ? -1 : 0}
            onClick={(event) => {
              event.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(".sidebar-brand-button")
                ?.focus({ preventScroll: true });
              onClose();
            }}
          >
            <PanelLeft className="size-[19px]" />
          </Button>
        )}
        {mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="sidebar-mobile-close"
            onClick={onClose}
            aria-label={t("navigation.closeSidebar")}
          >
            <X className="size-[19px]" />
          </Button>
        )}
      </div>
      <div className="sidebar-body">
        <SidebarTooltip label={t("projects.create")} collapsed={collapsed}>
          <Button
            variant="ghost"
            className="sidebar-item"
            aria-label={t("projects.create")}
            aria-busy={creating}
            onClick={createProject}
            disabled={creating}
          >
            <span className="sidebar-icon">
              {creating ? (
                <Loader2 className="size-[19px] animate-spin" />
              ) : (
                <SquarePen className="size-[19px]" />
              )}
            </span>
            <span className="sidebar-label">{t("projects.create")}</span>
          </Button>
        </SidebarTooltip>
        <nav aria-label={t("navigation.main")} className="sidebar-navigation">
          {NAVIGATION.map(([url, label, Icon]) => (
            <SidebarTooltip key={url} label={t(label)} collapsed={collapsed}>
              {url === "/library" && onAssets ? (
                <Button
                  variant="ghost"
                  className="sidebar-item"
                  aria-label={t(label)}
                  data-active={assetsOpen}
                  aria-pressed={assetsOpen}
                  onClick={() => {
                    onAssets();
                    onNavigate?.();
                  }}
                >
                  <span className="sidebar-icon">
                    <Icon className="size-[19px]" />
                  </span>
                  <span className="sidebar-label">{t(label)}</span>
                </Button>
              ) : (
                <NavLink
                  to={url}
                  onClick={onNavigate}
                  aria-label={t(label)}
                  className="sidebar-item"
                >
                  <span className="sidebar-icon">
                    <Icon className="size-[19px]" />
                  </span>
                  <span className="sidebar-label">{t(label)}</span>
                </NavLink>
              )}
            </SidebarTooltip>
          ))}
        </nav>
        <div className="sidebar-divider" />
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
            aria-label={t("projects.recent")}
            className="sidebar-recent-list"
            inert={collapsed}
          >
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {t("common.loading")}
              </div>
            ) : error && !projects.length ? (
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
              projects.slice(0, 20).map((project) => (
                <NavLink
                  key={project.id}
                  to={`/drawing/${project.id}`}
                  onClick={onNavigate}
                  title={project.name}
                  className="sidebar-item"
                >
                  <span className="sidebar-icon">
                    <FilePenLine className="size-[19px]" />
                  </span>
                  <span className="sidebar-label">{project.name}</span>
                </NavLink>
              ))
            )}
          </nav>
        </div>
      </div>
      <div className="sidebar-footer">
        <SidebarTooltip label={t("settings.title")} collapsed={collapsed}>
          <Button
            variant="ghost"
            className="sidebar-item"
            aria-label={t("settings.title")}
            onClick={onSettings}
          >
            <span className="sidebar-icon">
              <Settings className="size-[19px]" />
            </span>
            <span className="sidebar-label">{t("settings.title")}</span>
          </Button>
        </SidebarTooltip>
      </div>
    </div>
  );
}
