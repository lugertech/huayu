import { t, useLocale } from "@/i18n";
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
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/dialog";
import { useIsMobile } from "@/lib/use-mobile";
import "./sidebar.css";
import { OPEN_SETTINGS_EVENT } from "@/lib/settings-event";
import type { Capability } from "@/ai/settings";

const AppSidebar = lazy(() =>
  import("./AppSidebar").then((module) => ({
    default: module.AppSidebar,
  })),
);
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

export function ShellSidebarTrigger() {
  useLocale();
  const sidebar = useContext(SidebarContext);
  if (!sidebar?.hidden) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
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
  onAssets,
  assetsOpen = false,
}: {
  children: ReactNode;
  canvas?: boolean;
  onAssets?: () => void;
  assetsOpen?: boolean;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [settingsCapability, setSettingsCapability] =
    useState<Capability>("text");
  const [settingsTab, setSettingsTab] = useState<"general" | "models">(
    "general",
  );
  useEffect(() => {
    const openModels = (event: Event) => {
      setSearchOpen(false);
      setSettingsCapability(
        (event as CustomEvent<Capability>).detail || "text",
      );
      setSettingsTab("models");
      setSettingsLoaded(true);
      setSettingsOpen(true);
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
        document.querySelector(
          '[role="dialog"][data-open], [role="alertdialog"][data-open]',
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMobileOpen(false);
      setSearchLoaded(true);
      setSearchOpen((value) => !value);
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
    setSettingsOpen(true);
  }

  function openSearch() {
    setMobileOpen(false);
    setSearchLoaded(true);
    setSearchOpen(true);
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
            <Suspense fallback={null}>
              <AppSidebar
                collapsed={!sidebarOpen}
                onClose={toggleSidebar}
                onSettings={openSettings}
                onSearch={openSearch}
                onAssets={onAssets}
                assetsOpen={assetsOpen}
              />
            </Suspense>
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
            <Suspense fallback={null}>
              <AppSidebar
                mobile
                onClose={() => setMobileOpen(false)}
                onNavigate={() => setMobileOpen(false)}
                onSettings={openSettings}
                onSearch={openSearch}
                onAssets={onAssets}
                assetsOpen={assetsOpen}
              />
            </Suspense>
          </DialogContent>
        </Dialog>
        {searchLoaded && (
          <Suspense fallback={null}>
            <QuickSearch
              open={searchOpen}
              onOpenChange={setSearchOpen}
              onModels={() => {
                setSettingsTab("models");
                setSettingsLoaded(true);
                setSettingsOpen(true);
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
              onOpenChange={setSettingsOpen}
            />
          </Suspense>
        )}
      </div>
    </SidebarContext>
  );
}
