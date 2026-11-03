import { t, useLocale, getLocale } from "@/i18n";
import { useNavigate } from "react-router-dom";
import {
  useAnalysisTask,
  readTranscript,
  readAnalysis,
  readCheckpoint,
} from "@/recording/analysis";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  Video,
  Play,
  Check,
  FileText,
  X,
} from "lucide-react";
import { ShellSidebarTrigger } from "@/Components/Shell";
import { useToast } from "@/Components/common/ToastProvider";
import { api, uploadAsset, type Recording } from "@/api/client";
import { downloadRecording, mediaDuration } from "@/recording/files";
import { RecorderButton, formatDuration } from "@/recording/Recorder";
import { RecordingCover } from "@/recording/RecordingCover";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { searchScore } from "@/lib/search";
import { Card, CardContent } from "@/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/ui/alert-dialog";

export function RecordingsPage() {
  useLocale();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Recording | null>(null);
  const [renaming, setRenaming] = useState<Recording | null>(null);
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  function failed(error: unknown) {
    showToast({
      title: t("common.operationFailed"),
      description:
        error instanceof Error ? error.message : t("common.tryAgain"),
      variant: "destructive",
    });
  }
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setRecordings(await api<Recording[]>("/api/recordings"));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("recordings.cannotLoadRecording"),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const listener = () => {
      void refresh();
    };
    window.addEventListener("huayu:recordings-changed", listener);
    return () => {
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
      <RecorderButton />
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
              mediaDuration(file),
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
        size="sm"
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
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border p-8 text-center">
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("recordings.actionsFor", {
                              arg0: recording.name,
                            })}
                          >
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            navigate(`/recordings/${recording.id}/analysis`)
                          }
                        >
                          <Video />
                          {t("recordings.previewRecording")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenaming(recording);
                            setName(recording.name);
                          }}
                        >
                          <Pencil />
                          {t("recordings.rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await downloadRecording(recording);
                            } catch (error) {
                              failed(error);
                            }
                          }}
                        >
                          <Download />
                          {t("recordings.downloadRecording")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(recording)}
                        >
                          <Trash2 />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            {search.trim() ? (
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => setSearch("")}
              >
                {t("recordings.viewAllRecordings")}
              </Button>
            ) : (
              <div className="mt-6 flex gap-2">
                <RecorderButton prominent />
                <Button
                  variant="outline"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  <Upload />
                  {t("recordings.importRecording")}
                </Button>
              </div>
            )}
          </div>
        )}
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
