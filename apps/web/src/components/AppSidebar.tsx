import { createBlankProject } from "@/features/projects/create-project";
import { t, useLocale } from "@/i18n";
import { errorText } from "@/i18n/errors";
import { lazy, Suspense, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  FolderOpen,
  Loader2,
  PanelLeft,
  Settings,
  SquarePen,
  Video,
  X,
  Search,
  LibraryBig,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarProjects } from "./SidebarProjects";
import type { SidebarTooltipProps } from "./SidebarTooltip";
import { useToast } from "./common/ToastProvider";

const NAVIGATION = [
  ["/projects", "navigation.projects", FolderOpen],
  ["/recordings", "navigation.recordings", Video],
  ["/library", "library.title", LibraryBig],
] as const;
const DeferredSidebarTooltip = lazy(() =>
  import("./SidebarTooltip").then((module) => ({
    default: module.SidebarTooltip,
  })),
);

function SidebarTooltip(props: SidebarTooltipProps) {
  return (
    <Suspense fallback={props.children}>
      <DeferredSidebarTooltip {...props} />
    </Suspense>
  );
}

export function AppSidebar({
  mobile = false,
  collapsed = false,
  onClose,
  onNavigate,
  onSettings,
  onSearch,
}: {
  mobile?: boolean;
  collapsed?: boolean;
  onClose: () => void;
  onNavigate?: () => void;
  onSettings: () => void;
  onSearch: () => void;
}) {
  useLocale();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isMac = navigator.platform.includes("Mac");
  const [creating, setCreating] = useState(false);
  const brandMark = (
    <img
      className="sidebar-brand-mark"
      src={`${import.meta.env.BASE_URL}icon.svg`}
      alt=""
      width={32}
      height={32}
    />
  );

  async function createProject() {
    setCreating(true);
    try {
      const project = await createBlankProject();
      navigate(`/drawing/${project.id}`);
      onNavigate?.();
    } catch (error) {
      showToast({
        title: t("projects.createFailed"),
        description: errorText(error),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="sidebar-content" data-collapsed={collapsed}>
      <div className="sidebar-header">
        {mobile ? (
          <Link
            to="/projects"
            className="sidebar-mobile-brand"
            onClick={onNavigate}
          >
            <span className="sidebar-brand-button">{brandMark}</span>
            <span className="sidebar-label sidebar-brand-label">
              {t("app.name")}
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
            {brandMark}
            <PanelLeft className="sidebar-brand-toggle size-[19px]" />
          </Button>
        )}
        {!mobile && (
          <Link
            to="/projects"
            aria-hidden={collapsed || undefined}
            tabIndex={collapsed ? -1 : undefined}
            onClick={onNavigate}
            className="sidebar-label sidebar-brand-label"
          >
            {t("app.name")}
          </Link>
        )}
        <SidebarTooltip
          disabled={collapsed}
          side="bottom"
          label={
            <>
              {t("search.triggerLabel")}
              {!mobile && (
                <Kbd className="sidebar-search-shortcut" aria-hidden="true">
                  <span>{isMac ? "⌘" : "Ctrl"}</span>
                  <span>K</span>
                </Kbd>
              )}
            </>
          }
        >
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
        </SidebarTooltip>
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
        <SidebarTooltip label={t("projects.create")} disabled={!collapsed}>
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
            <SidebarTooltip key={url} label={t(label)} disabled={!collapsed}>
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
            </SidebarTooltip>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <SidebarProjects
          collapsed={collapsed}
          onNavigate={onNavigate}
          assetsOpen={false}
          onCreateProject={createProject}
          creating={creating}
        />
      </div>
      <div className="sidebar-footer">
        <SidebarTooltip label={t("settings.title")} disabled={!collapsed}>
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
