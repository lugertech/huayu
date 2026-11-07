import type { ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import { t, useLocale } from "@/i18n";
import type { Project } from "@/api/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { LoadingRegion } from "@/ui/loading-region";
import { SidebarProjectsPlaceholder } from "./SidebarProjectsPlaceholder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

export function SidebarRecentMenu({
  collapsed,
  projects,
  loading,
  error,
  onReload,
  children,
}: {
  collapsed: boolean;
  projects: Project[];
  loading: boolean;
  error: boolean;
  onReload: () => void;
  children: ReactElement;
}) {
  useLocale();
  const { pathname } = useLocation();
  return (
    <DropdownMenu>
      <Tooltip disabled={!collapsed}>
        <TooltipTrigger render={<DropdownMenuTrigger render={children} />} />
        <TooltipContent side="right" sideOffset={10}>
          {t("navigation.projects")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side={collapsed ? "right" : "bottom"}
        align="start"
        sideOffset={10}
        className="w-64 max-w-[calc(100vw-80px)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-medium text-[#737373] dark:text-[#8c8c8c]">
            {t("navigation.projects")}
          </DropdownMenuLabel>
          <LoadingRegion
            id="huayu:sidebar-projects-menu"
            loading={loading}
            empty={!projects.length}
            error={error}
            placeholder={<SidebarProjectsPlaceholder />}
          >
            {error ? (
              <DropdownMenuItem onClick={onReload}>
                {t("projects.reload")}
              </DropdownMenuItem>
            ) : !projects.length ? (
              <DropdownMenuItem disabled>
                {t("projects.empty.title")}
              </DropdownMenuItem>
            ) : (
              projects.slice(0, 20).map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="font-medium"
                  render={<Link to={`/drawing/${project.id}`} />}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {project.name}
                  </span>
                  {pathname === `/drawing/${project.id}` && <Check />}
                </DropdownMenuItem>
              ))
            )}
          </LoadingRegion>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
