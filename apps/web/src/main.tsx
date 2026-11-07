import { useLocale } from "@/i18n";
import { StrictMode, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { TooltipProvider } from "./ui/tooltip-provider";
import { ToastProvider } from "./Components/common/ToastProvider";
import { ErrorBoundary } from "./Components/common/ErrorBoundary";
import { RecorderProvider } from "./recording/Recorder";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RecordingsPage } from "./pages/RecordingsPage";
import { WorkspaceLayout } from "./Components/WorkspaceLayout";
import { WorkspaceAccess } from "./Components/WorkspaceAccess";
const DrawingPage = lazy(() =>
  import("./pages/DrawingPage").then((module) => ({
    default: module.DrawingPage,
  })),
);
const LibraryPage = lazy(() =>
  import("./pages/LibraryPage").then((module) => ({
    default: module.LibraryPage,
  })),
);
const AssetsPage = lazy(() =>
  import("./pages/AssetsPage").then((module) => ({
    default: module.AssetsPage,
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
function Application() {
  useLocale();
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ToastProvider>
          <ErrorBoundary>
            <BrowserRouter>
              <RecorderProvider>
                <WorkspaceAccess>
                  <Routes>
                    <Route element={<WorkspaceLayout />}>
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/library" element={<LibraryPage />} />
                      <Route path="/assets" element={<AssetsPage />} />
                      <Route path="/recordings" element={<RecordingsPage />} />
                      <Route path="/drawing/:id" element={<DrawingPage />} />
                      <Route
                        path="/recordings/:id/analysis"
                        element={<RecordingAnalysisPage />}
                      />
                    </Route>
                    <Route
                      path="*"
                      element={<Navigate to="/projects" replace />}
                    />
                  </Routes>
                </WorkspaceAccess>
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
