import { t, useLocale, getLocale } from "@/i18n";
import { errorText, LocalizedError } from "@/i18n/errors";
import { useNavigate } from "react-router-dom";
import { useAnalysisTask } from "@/features/recording/analysis-task";
import {
  readTranscript,
  readAnalysis,
  readCheckpoint,
} from "@/features/recording/report";
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  MoreHorizontal,
  Search,
  Upload,
  Video,
  Play,
  Check,
  FileText,
  X,
} from "lucide-react";
import { ShellSidebarTrigger } from "@/components/Shell";
import { useToast } from "@/components/common/ToastProvider";
import { api, uploadAsset, type Recording } from "@/api/client";
import { RecorderButton } from "@/features/recording/RecorderButton";
import { formatDuration } from "@/features/recording/duration";
import { RecordingCover } from "@/features/recording/RecordingCover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingRegion } from "@/components/ui/loading-region";
import { searchScore } from "@/lib/search";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { RecordingCardMenuProps } from "../features/recording/RecordingCardMenu";

const DeferredRecordingCardMenu = lazy(() =>
  import("../features/recording/RecordingCardMenu").then((module) => ({
    default: module.RecordingCardMenu,
  })),
);

export function RecordingsPage() {
  useLocale();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Recording | null>(null);
  const [renaming, setRenaming] = useState<Recording | null>(null);
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const refreshRequest = useRef<AbortController | null>(null);
  const { showToast } = useToast();
  function failed(error: unknown) {
    showToast({
      title: t("common.operationFailed"),
      description: errorText(error),
      variant: "destructive",
    });
  }
  async function refresh() {
    refreshRequest.current?.abort();
    const controller = new AbortController();
    refreshRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const recordings = await api<Recording[]>("/api/recordings", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRecordings(recordings);
      setHasLoaded(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure =
        error instanceof Error
          ? error
          : new LocalizedError({ key: "recordings.cannotLoadRecording" });
      setError(failure);
      if (hasLoaded)
        showToast({ title: errorText(failure), variant: "destructive" });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const refreshFromEvent = useEffectEvent(refresh);
  useEffect(() => {
    void refreshFromEvent();
    const listener = () => {
      void refreshFromEvent();
    };
    window.addEventListener("huayu:recordings-changed", listener);
    return () => {
      refreshRequest.current?.abort();
      window.removeEventListener("huayu:recordings-changed", listener);
    };
  }, []);
  async function update(value: Recording) {
    setRecordings((current) =>
      current.map((recording) =>
        recording.id === value.id ? value : recording,
      ),
    );
  }
  const shown = recordings.filter((recording) =>
    searchScore(search, recording.name),
  );
  async function rename() {
    if (!renaming || !name.trim() || renamingBusy) return;
    if (renaming.name === name.trim()) {
      setRenaming(null);
      return;
    }
    setRenamingBusy(true);
    try {
      update(
        await api<Recording>(`/api/recordings/${renaming.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() }),
        }),
      );
      setRenaming(null);
    } catch (error) {
      failed(error);
    } finally {
      setRenamingBusy(false);
    }
  }
  const pageActions = (
    <>
      <RecorderButton prominent />
      <input
        ref={input}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const [asset, duration] = await Promise.all([
              uploadAsset(file),
              import("@/features/recording/files").then(({ mediaDuration }) =>
                mediaDuration(file),
              ),
            ]);
            const value = await api<Recording>("/api/recordings", {
              method: "POST",
              body: JSON.stringify({
                name: file.name.slice(0, 120),
                asset_id: asset.id,
                duration,
              }),
            });
            setRecordings((current) => [value, ...current]);
            navigate(`/recordings/${value.id}/analysis`);
          } catch (error) {
            failed(error);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        variant="outline"
        aria-label={t("recordings.importRecording")}
        title={t("recordings.importRecording")}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        <span className="hidden md:inline">
          {t("recordings.importRecording")}
        </span>
      </Button>
    </>
  );
  return (
    <>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShellSidebarTrigger />
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("recordings.myRecordings")}
              </h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("recordings.reviewRecordingsExtractTextAndOrganizeKeyPoints")}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {pageActions}
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-8 pl-9"
                aria-label={t("recordings.search.label")}
                placeholder={t("recordings.search.placeholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label={t("recordings.clearSearch")}
                  onClick={() => setSearch("")}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        </div>
        <LoadingRegion
          id="huayu:recording-list"
          loading={loading && !hasLoaded}
          empty={!shown.length}
          error={!!error && !hasLoaded}
          placeholder={
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {["72%", "56%", "84%", "64%"].map((width) => (
                <Card key={width} className="gap-0 overflow-hidden py-0">
                  <div skullet-block="" className="aspect-video border-b" />
                  <CardContent className="p-4">
                    <div className="flex h-6 items-center">
                      <span
                        skullet-block=""
                        className="h-3.5 rounded"
                        style={{ width }}
                      />
                    </div>
                    <div className="mt-2 flex h-4 items-center">
                      <span skullet-block="" className="h-3 w-28 rounded" />
                    </div>
                    <div className="mt-3 flex h-4 items-center">
                      <span skullet-block="" className="h-3 w-32 rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          }
        >
          {error && !hasLoaded ? (
            <div role="alert" className="rounded-xl border p-8 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                {errorText(error)}
              </p>
              <Button variant="outline" onClick={refresh}>
                {t("common.reload")}
              </Button>
            </div>
          ) : shown.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((recording) => (
                <Card key={recording.id} className="gap-0 overflow-hidden py-0">
                  <button
                    className="group relative isolate flex aspect-video w-full items-center justify-center overflow-hidden border-b bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    aria-label={t("recordings.open", { arg0: recording.name })}
                    onClick={() =>
                      navigate(`/recordings/${recording.id}/analysis`)
                    }
                  >
                    <RecordingCover
                      key={recording.asset_id}
                      recording={recording}
                    />
                    <span
                      className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      aria-hidden="true"
                    >
                      <span className="flex size-10 items-center justify-center rounded-full bg-black/65 text-white shadow-sm">
                        <Play className="ml-0.5 size-4 fill-current" />
                      </span>
                    </span>
                    {recording.duration > 0 && (
                      <span
                        className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums"
                        aria-hidden="true"
                      >
                        {formatDuration(recording.duration)}
                      </span>
                    )}
                  </button>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                        onClick={() =>
                          navigate(`/recordings/${recording.id}/analysis`)
                        }
                      >
                        {recording.name}
                      </button>
                      <RecordingCardMenu
                        name={recording.name}
                        onPreview={() =>
                          navigate(`/recordings/${recording.id}/analysis`)
                        }
                        onRename={() => {
                          setRenaming(recording);
                          setName(recording.name);
                        }}
                        onDownload={async () => {
                          try {
                            const { downloadRecording } =
                              await import("@/features/recording/files");
                            await downloadRecording(recording);
                          } catch (error) {
                            failed(error);
                          }
                        }}
                        onDelete={() => setDeleting(recording)}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {recording.duration > 0
                        ? formatDuration(recording.duration)
                        : t("recordings.analysis.durationUnavailable")}{" "}
                      ·{" "}
                      {new Date(recording.created_at).toLocaleDateString(
                        getLocale(),
                      )}
                    </p>
                    <RecordingStatus recording={recording} />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed py-20">
              <Video className="mb-4 size-9 text-muted-foreground" />
              <p className="font-medium">
                {search.trim()
                  ? t("recordings.noMatchingRecordings")
                  : t("recordings.noRecordingsYet")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {search.trim()
                  ? t("recordings.tryDifferentKeywords")
                  : t(
                      "recordings.startRecordingOrImportAnExistingVideoOrAudioFile",
                    )}
              </p>
              {search.trim() && (
                <Button
                  variant="outline"
                  className="mt-5"
                  onClick={() => setSearch("")}
                >
                  {t("recordings.viewAllRecordings")}
                </Button>
              )}
            </div>
          )}
        </LoadingRegion>
      </main>
      <Dialog
        open={!!renaming}
        onOpenChange={(open) => {
          if (!open && !renamingBusy) setRenaming(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{t("recordings.renameRecording")}</DialogTitle>
          <Input
            aria-label={t("recordings.newRecordingName")}
            value={name}
            maxLength={120}
            disabled={renamingBusy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                void rename();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={renamingBusy}
              onClick={() => setRenaming(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={!name.trim() || renamingBusy} onClick={rename}>
              {renamingBusy && <Loader2 className="animate-spin" />}
              {renamingBusy ? t("recordings.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {t("recordings.delete", { name: deleting?.name || "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("recordings.theRecordingAndItsAnalysisWillBeDeleted")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await api(`/api/recordings/${deleting!.id}`, {
                    method: "DELETE",
                  });
                  setRecordings((current) =>
                    current.filter((item) => item.id !== deleting!.id),
                  );
                  setDeleting(null);
                } catch (error) {
                  failed(error);
                }
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RecordingCardMenu({
  name,
  ...props
}: Omit<RecordingCardMenuProps, "trigger"> & { name: string }) {
  const trigger = {
    variant: "ghost",
    size: "icon-xs",
    "aria-label": t("recordings.actionsFor", { arg0: name }),
  } as const;
  return (
    <Suspense
      fallback={
        <Button {...trigger} disabled>
          <MoreHorizontal />
        </Button>
      }
    >
      <DeferredRecordingCardMenu
        {...props}
        trigger={
          <Button {...trigger}>
            <MoreHorizontal />
          </Button>
        }
      />
    </Suspense>
  );
}

function RecordingStatus({ recording }: { recording: Recording }) {
  useLocale();
  const task = useAnalysisTask(recording.id);
  const transcript = readTranscript(recording.transcript);
  const analysis = readAnalysis(recording.analysis);
  const resumable =
    !!readCheckpoint(recording.analysis) || transcript.complete === false;
  return (
    <p
      className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
    >
      {task.busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : analysis ? (
        <Check className="size-3" />
      ) : (
        <FileText className="size-3" />
      )}
      {task.busy
        ? task.progress
        : resumable
          ? t("recordings.progressSavedReadyToContinue")
          : analysis
            ? t("recordings.organizedReadyToReviewAndCreate")
            : transcript.text
              ? t("recordings.transcribedReadyToOrganize")
              : t("recordings.analysis.notTranscribed")}
    </p>
  );
}
