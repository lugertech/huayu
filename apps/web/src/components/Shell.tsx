import { t, useLocale, useTranslations } from "@/i18n";
import {
  createContext,
  useContext,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/use-mobile";
import "./sidebar.css";
import { OPEN_SETTINGS_EVENT } from "@/lib/settings-event";
import type { Capability } from "@/ai/settings";

import { AppSidebar } from "./AppSidebar";

const SettingsDialog = lazy(() =>
  import("./SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);
const QuickSearch = lazy(() =>
  import("./QuickSearch").then((module) => ({
    default: module.QuickSearch,
  })),
);

const SIDEBAR_STORAGE_KEY = "huayu:sidebar-open";
const SidebarContext = createContext<{
  hidden: boolean;
  open: boolean;
  toggle: () => void;
} | null>(null);

export function ShellSidebarTrigger({ className }: { className?: string }) {
  const { t } = useTranslations();
  const sidebar = useContext(SidebarContext);
  if (!sidebar?.hidden) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={sidebar.toggle}
      aria-label={t("navigation.expandSidebar")}
      aria-expanded={sidebar.open}
    >
      <PanelLeft />
    </Button>
  );
}

export function Shell({
  children,
  canvas = false,
}: {
  children: ReactNode;
  canvas?: boolean;
}) {
  useLocale();
  const { pathname } = useLocation();
  const content = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overlay, setOverlay] = useState<"none" | "settings" | "search">(
    "none",
  );
  const settingsOpen = overlay === "settings";
  const searchOpen = overlay === "search";
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [settingsCapability, setSettingsCapability] =
    useState<Capability>("text");
  const [settingsTab, setSettingsTab] = useState<"general" | "models">(
    "general",
  );
  useEffect(() => {
    const openModels = (event: Event) => {
      setOverlay((current) => (current === "search" ? "none" : current));
      setSettingsCapability(
        (event as CustomEvent<Capability>).detail || "text",
      );
      setSettingsTab("models");
      setSettingsLoaded(true);
      setOverlay("settings");
      setMobileOpen(false);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, openModels);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openModels);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      )
        return;
      if (
        !searchOpen &&
        event.target instanceof Element &&
        event.target.closest(".board-stage") &&
        !event.target.closest("[data-canvas-ui]")
      )
        return;
      if (
        !searchOpen &&
        document.querySelector(
          '[role="dialog"][data-open], [role="alertdialog"][data-open]',
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMobileOpen(false);
      setSearchLoaded(true);
      setOverlay((current) => (current === "search" ? "none" : "search"));
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [searchOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, isMobile]);

  useLayoutEffect(() => {
    content.current?.scrollTo(0, 0);
  }, [pathname]);

  function toggleSidebar() {
    if (isMobile) {
      setMobileOpen((open) => !open);
      return;
    }
    const next = !sidebarOpen;
    setSidebarOpen(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // The sidebar remains usable when browser preferences cannot be saved.
    }
  }

  function openSettings() {
    setSettingsTab("general");
    setMobileOpen(false);
    setSettingsLoaded(true);
    setOverlay("settings");
  }

  function openSearch() {
    setMobileOpen(false);
    setSearchLoaded(true);
    setOverlay("search");
  }

  return (
    <SidebarContext
      value={{
        hidden: isMobile,
        open: isMobile ? mobileOpen : sidebarOpen,
        toggle: toggleSidebar,
      }}
    >
      <div className="flex h-full min-h-0 overflow-hidden bg-background">
        {!isMobile && (
          <aside
            id="app-sidebar"
            aria-label={t("navigation.sidebar")}
            data-collapsed={!sidebarOpen}
            className="desktop-sidebar relative z-40 flex shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground"
          >
            <AppSidebar
              collapsed={!sidebarOpen}
              onClose={toggleSidebar}
              onSettings={openSettings}
              onSearch={openSearch}
            />
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={content}
            className={`flex min-h-0 flex-1 flex-col ${canvas ? "relative isolate overflow-hidden" : "overflow-y-auto"}`}
          >
            {children}
          </div>
        </div>
        <Dialog open={mobileOpen && isMobile} onOpenChange={setMobileOpen}>
          <DialogContent
            id="mobile-sidebar"
            showCloseButton={false}
            finalFocus={() => (searchOpen || settingsOpen ? false : undefined)}
            className="top-0 left-0 flex h-dvh w-72 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-sidebar p-0 text-sidebar-foreground data-open:zoom-in-100 data-closed:zoom-out-100"
          >
            <DialogTitle className="sr-only">
              {t("navigation.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("navigation.description")}
            </DialogDescription>
            <AppSidebar
              mobile
              onClose={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              onSettings={openSettings}
              onSearch={openSearch}
            />
          </DialogContent>
        </Dialog>
        {searchLoaded && (
          <Suspense fallback={null}>
            <QuickSearch
              open={searchOpen}
              onOpenChange={(open) =>
                setOverlay((current) =>
                  open ? "search" : current === "search" ? "none" : current,
                )
              }
              onModels={() => {
                setSettingsTab("models");
                setSettingsLoaded(true);
                setOverlay("settings");
              }}
            />
          </Suspense>
        )}
        {settingsLoaded && (
          <Suspense fallback={null}>
            <SettingsDialog
              initialTab={settingsTab}
              initialCapability={settingsCapability}
              open={settingsOpen}
              onOpenChange={(open) =>
                setOverlay((current) =>
                  open ? "settings" : current === "settings" ? "none" : current,
                )
              }
            />
          </Suspense>
        )}
      </div>
    </SidebarContext>
  );
}
