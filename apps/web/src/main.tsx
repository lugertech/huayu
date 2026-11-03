import { t, useLocale } from "@/i18n";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { TooltipProvider } from "./ui/tooltip-provider";
import { ToastProvider } from "./Components/common/ToastProvider";
import { ErrorBoundary } from "./Components/common/ErrorBoundary";
import { RecorderProvider } from "./recording/Recorder";
import { ProjectsPage } from "./pages/ProjectsPage";
import { Shell } from "./Components/Shell";
const DrawingPage = lazy(() =>
  import("./pages/DrawingPage").then((module) => ({
    default: module.DrawingPage,
  })),
);
const AssetsPage = lazy(() =>
  import("./pages/AssetsPage").then((module) => ({
    default: module.AssetsPage,
  })),
);
const RecordingsPage = lazy(() =>
  import("./pages/RecordingsPage").then((module) => ({
    default: module.RecordingsPage,
  })),
);
const RecordingAnalysisPage = lazy(() =>
  import("./pages/RecordingAnalysisPage").then((module) => ({
    default: module.RecordingAnalysisPage,
  })),
);
import "./main.css";

(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
  "/assets/excalidraw/";

const container = document.getElementById("root")!;
const root = import.meta.hot?.data.root || createRoot(container);
if (import.meta.hot) {
  import.meta.hot.data.root = root;
  import.meta.hot.accept();
}
function WorkspaceLayout() {
  return (
    <Shell>
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("api.errors.opening")}
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </Shell>
  );
}
function Application() {
  useLocale();
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ToastProvider>
          <ErrorBoundary>
            <BrowserRouter>
              <RecorderProvider>
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {t("api.errors.opening")}
                    </div>
                  }
                >
                  <Routes>
                    <Route element={<WorkspaceLayout />}>
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/library" element={<AssetsPage />} />
                      <Route path="/recordings" element={<RecordingsPage />} />
                    </Route>
                    <Route path="/drawing/:id" element={<DrawingPage />} />
                    <Route
                      path="/recordings/:id/analysis"
                      element={<RecordingAnalysisPage />}
                    />
                    <Route
                      path="*"
                      element={<Navigate to="/projects" replace />}
                    />
                  </Routes>
                </Suspense>
              </RecorderProvider>
            </BrowserRouter>
          </ErrorBoundary>
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
root.render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
