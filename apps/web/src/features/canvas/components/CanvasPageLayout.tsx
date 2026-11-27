import {
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LocaleContext, t } from "@/i18n";
import { DocumentTitle } from "@/components/DocumentTitle";
import { OPEN_SETTINGS_EVENT } from "@/lib/settings-event";
import type { Capability } from "@/ai/model-config";

const SettingsDialog = lazy(() =>
  import("@/components/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);

export function CanvasPageLayout({
  shared,
  projectName,
  children,
}: {
  shared: boolean;
  projectName?: string;
  children: ReactNode;
}) {
  const locale = useContext(LocaleContext);
  const untitled =
    projectName === t("projects.untitled", undefined, "zh-CN") ||
    projectName === t("projects.untitled", undefined, "en");
  const content = (
    <>
      <DocumentTitle pageName={untitled ? undefined : projectName} />
      {children}
    </>
  );
  if (!shared) return content;
  // Keep shared-canvas settings in the app locale.
  return (
    <LocaleContext value={undefined}>
      <SharedCanvasLayout>
        <LocaleContext value={locale}>{content}</LocaleContext>
      </SharedCanvasLayout>
    </LocaleContext>
  );
}

/** Collaboration has its own shell: no workspace navigation, search or management panels. */
function SharedCanvasLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [capability, setCapability] = useState<Capability>("text");
  useEffect(() => {
    const openSettings = (event: Event) => {
      setCapability((event as CustomEvent<Capability>).detail || "text");
      setLoaded(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openSettings);
  }, []);
  return (
    <div className="relative isolate flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {children}
      {loaded && (
        <Suspense fallback={null}>
          <SettingsDialog
            open={open}
            onOpenChange={setOpen}
            initialTab="models"
            initialCapability={capability}
          />
        </Suspense>
      )}
    </div>
  );
}
