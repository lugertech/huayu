import { t, useLocale, getLocale } from "@/i18n";
import { errorText, translatedErrorMessage } from "@/i18n/errors";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  FileText,
  Link2,
  ListMusic,
  Loader2,
  MessageSquare,
  Pencil,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Video,
  ArrowUpRight,
  PanelsTopLeft,
  Play,
  Pause,
  X,
  Settings2,
} from "lucide-react";
import { ShellSidebarTrigger } from "@/components/Shell";
import { Markdown } from "@/components/common/Markdown";
import { useToast } from "@/components/common/ToastProvider";
import { api, downloadBlob, type Recording, type Project } from "@/api/client";
import {
  recordingCanvas,
  excerptForChapter,
  excerptsForSelection,
  type RecordingExcerpt,
} from "@/features/recording/canvas";
import { downloadRecording } from "@/features/recording/files";
import {
  analyzeRecording,
  cancelAnalysis,
  useAnalysisTask,
  getAnalysisTask,
  readAnalysis,
  readCheckpoint,
  readTranscript,
  analysisMarkdown,
  transcriptExport,
  type Transcript,
} from "@/features/recording/analysis";
import { formatDuration } from "@/features/recording/duration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { openModelSettings } from "@/lib/settings-event";
import {
  CAPABILITY_LABELS,
  connectionIssue,
  useModelSettings,
} from "@/ai/settings";
import { recordingCapabilities } from "@/features/recording/analysis";
import {
  activeSegment,
  sentenceNavigation,
  loadPlayback,
  playbackKey,
  PLAYBACK_RATES,
} from "@/features/recording/playback";

export function RecordingAnalysisPage() {
  useLocale();
  const { id } = useParams();
  return <AnalysisWorkspace key={id} id={id!} />;
}
function AnalysisWorkspace({ id }: { id: string }) {
  useLocale();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [time, setTime] = useState(0);
  const [search, setSearch] = useState("");
  const [follow, setFollow] = useState(true);
  const [transcriptEdit, setTranscriptEdit] = useState<
    { phase: "closed" } | { phase: "editing" | "saving"; draft: Transcript }
  >({ phase: "closed" });
  const editing = transcriptEdit.phase !== "closed";
  const saving = transcriptEdit.phase === "saving";
  const draft = transcriptEdit.phase === "closed" ? null : transcriptEdit.draft;
  function setDraft(
    update: Transcript | ((current: Transcript) => Transcript),
  ) {
    setTranscriptEdit((current) =>
      current.phase === "editing"
        ? {
            ...current,
            draft:
              typeof update === "function" ? update(current.draft) : update,
          }
        : current,
    );
  }
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTime =
    searchParams.has("t") && Number.isFinite(Number(searchParams.get("t")))
      ? Math.max(0, Number(searchParams.get("t")))
      : null;
  const [view] = useState(() => loadPlayback(id));
  const [rate, setRate] = useState(view.rate);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<"source" | "notes">("source");
  const [selectedSegments, setSelectedSegments] = useState<number[]>([]);
  const lastSavedTime = useRef(-1);
  const pendingSeek = useRef<number | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const activeItem = useRef<HTMLButtonElement>(null);
  const task = useAnalysisTask(id);
  const modelSettings = useModelSettings();
  const missingCapabilities = recording
    ? recordingCapabilities(recording).filter((capability) =>
        connectionIssue(capability, modelSettings.connections[capability]),
      )
    : [];
  const { showToast } = useToast();
  const seekFromLocation = useEffectEvent((seconds: number) => seek(seconds));
  useEffect(() => {
    let cancelled = false;
    setRecording(null);
    setTime(0);
    setError(null);
    api<Recording>(`/api/recordings/${id}`)
      .then((value) => {
        if (!cancelled) setRecording(value);
      })
      .catch((error: Error) => {
        if (!cancelled) setError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    if (task.recording?.id === id) setRecording(task.recording);
  }, [task.recording, id]);
  useEffect(() => {
    if (
      player.current &&
      player.current.readyState >= 1 &&
      requestedTime !== null
    )
      seekFromLocation(requestedTime);
  }, [requestedTime, recording?.asset_id]);
  const transcript = readTranscript(recording?.transcript);
  const analysis = readAnalysis(recording?.analysis);
  const checkpoint = readCheckpoint(recording?.analysis);
  const segments = transcript.segments.length
    ? transcript.segments
    : transcript.text
      ? [
          {
            start: 0,
            end: recording?.duration || 0,
            text: transcript.text,
            speaker: undefined,
          },
        ]
      : [];
  const activeIndex = activeSegment(segments, time);
  const neighbors = sentenceNavigation(segments, time);
  useEffect(() => setSelectedSegments([]), [recording?.transcript]);
  const visible = segments
    .map((segment, index) => ({ segment, index }))
    .filter(
      ({ segment }) =>
        !search ||
        segment.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );
  useEffect(() => {
    if (!follow || search || panel !== "source" || !activeItem.current) return;
    const list = activeItem.current.closest<HTMLElement>(
      "[data-transcript-list]",
    );
    if (!list) return;
    const row = activeItem.current.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    const delta =
      row.top < viewport.top
        ? row.top - viewport.top
        : row.bottom > viewport.bottom
          ? row.bottom - viewport.bottom
          : 0;
    if (delta) list.scrollBy({ top: delta, behavior: "smooth" });
  }, [activeIndex, follow, search, panel]);
  function persistPlayback(current = player.current?.currentTime || 0) {
    try {
      localStorage.setItem(
        playbackKey(id),
        JSON.stringify({
          time: current,
          rate: player.current?.playbackRate || rate,
        }),
      );
    } catch {
      /* Playback works without browser storage. */
    }
  }
  function metadataLoaded() {
    if (!player.current) return;
    player.current.playbackRate = rate;
    const duration = player.current.duration;
    const stored =
      Number.isFinite(duration) && view.time >= duration - 1 ? 0 : view.time;
    seek(pendingSeek.current ?? requestedTime ?? stored);
    pendingSeek.current = null;
    if (
      recording &&
      !recording.duration &&
      Number.isFinite(duration) &&
      duration > 0
    )
      void api<Recording>(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        body: JSON.stringify({ duration: Math.round(duration) }),
      })
        .then((value) =>
          setRecording((current) =>
            current ? { ...current, duration: value.duration } : value,
          ),
        )
        .catch(() => {});
  }
  function togglePlayback() {
    if (!player.current) return;
    if (player.current.paused) void player.current.play().catch(failed);
    else player.current.pause();
  }
  function seek(seconds: number) {
    if (player.current && Number.isFinite(seconds)) {
      if (panel !== "source") workspace.current?.scrollTo({ top: 0 });
      setPanel("source");
      if (player.current.readyState < 1) {
        pendingSeek.current = seconds;
        setTime(seconds);
        return;
      }
      const duration = player.current.duration;
      const target = Math.min(
        Math.max(0, seconds),
        Number.isFinite(duration) ? duration : Infinity,
      );
      player.current.currentTime = target;
      setTime(target);
      persistPlayback(target);
    }
  }
  function failed(error: unknown) {
    showToast({
      title: t("recordings.analysis.actionIncomplete"),
      description: errorText(error),
      variant: "destructive",
    });
  }
  async function analyze(
    forceTranscription = false,
    transcriptionOnly = false,
  ) {
    if (!recording) return;
    if (task.busy) {
      cancelAnalysis(recording.id);
      return;
    }
    try {
      setRecording(
        await analyzeRecording(recording, {
          forceTranscription,
          transcriptionOnly,
        }),
      );
      if (transcriptionOnly) setPanel("source");
      else setPanel("notes");
      showToast({
        title: transcriptionOnly
          ? t("recordings.analysis.transcriptionComplete")
          : t("recordings.analysis.contentOrganized"),
      });
    } catch (error) {
      if (
        !(error instanceof Error && error.name === "AbortError") &&
        !getAnalysisTask(recording.id).error
      )
        failed(error);
    }
  }
  async function openCanvas(excerpt?: RecordingExcerpt | RecordingExcerpt[]) {
    if (!recording || creatingCanvas) return;
    setCreatingCanvas(true);
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(recordingCanvas(recording, excerpt)),
      });
      const material = Object.values(project.document?.store || {})
        .sort((a: any, b: any) => (a.x || 0) - (b.x || 0))
        .find(
          (record: any) =>
            record.type === "ai-text" && record.props?.recordingSource,
        ) as { id: string } | undefined;
      navigate(`/drawing/${project.id}`, {
        state: { inspectShapeId: material?.id },
      });
    } catch (error) {
      failed(error);
    } finally {
      setCreatingCanvas(false);
    }
  }
  async function exportTranscript(format: "txt" | "srt" | "vtt") {
    try {
      downloadBlob(
        new Blob([transcriptExport(transcript, format)], {
          type: "text/plain;charset=utf-8",
        }),
        `${recording!.name}.${format}`,
      );
    } catch (error) {
      failed(error);
    }
  }
  async function saveTranscript() {
    if (!recording || transcriptEdit.phase !== "editing" || task.busy) return;
    setTranscriptEdit({ ...transcriptEdit, phase: "saving" });
    try {
      const updated = {
        ...draft,
        text: draft.segments.length
          ? draft.segments.map((segment) => segment.text).join("\n")
          : draft.text,
      };
      const saved = await api<Recording>(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          transcript: JSON.stringify(updated),
          analysis: "",
        }),
      });
      setRecording(saved);
      setTranscriptEdit({ phase: "closed" });
      window.dispatchEvent(new Event("huayu:recordings-changed"));
      showToast({
        title: t("recordings.analysis.transcriptUpdated"),
        description: t(
          "recordings.analysis.youCanNowRegenerateNotesChaptersAndQA",
        ),
      });
    } catch (error) {
      failed(error);
    } finally {
      setTranscriptEdit((current) =>
        current.phase === "saving" ? { ...current, phase: "editing" } : current,
      );
    }
  }
  const canResume = !!checkpoint || transcript.complete === false;
  const analysisLabel = task.busy
    ? t("recordings.analysis.stopProcessing")
    : canResume
      ? t("recordings.analysis.continueProcessing")
      : analysis
        ? t("recordings.analysis.organizeAgain")
        : transcript.text && transcript.complete !== false
          ? t("recordings.analysis.organizeContent")
          : t("recordings.analysis.transcribeAndOrganize");
  const pageActions = (
    <>
      <Link
        to="/recordings"
        aria-label={t("recordings.analysis.backToRecordings")}
        className="rounded-lg p-1.5 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" />
      </Link>
      {recording?.project_id && (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to={`/drawing/${recording.project_id}`} />}
          aria-label={t("recordings.recorder.openLinkedBoard")}
          title={t("recordings.recorder.openLinkedBoard")}
        >
          <Link2 />
          <span className="hidden md:inline">
            {t("recordings.recorder.openLinkedBoard")}
          </span>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={
          creatingCanvas || !recording || (!analysis && !transcript.text)
        }
        onClick={() => openCanvas()}
        aria-label={t("recordings.analysis.createACanvas")}
      >
        {creatingCanvas ? (
          <Loader2 className="animate-spin" />
        ) : (
          <PanelsTopLeft />
        )}
        <span className="hidden md:inline">
          {t("recordings.analysis.createACanvas")}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={t("recordings.analysis.exportRecordingContent")}
              disabled={!recording}
            >
              <Download />
              <span className="hidden sm:inline">
                {t("recordings.analysis.export")}
              </span>
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!transcript.text}
            onClick={() => exportTranscript("txt")}
          >
            <FileText />
            {t("recordings.analysis.transcriptTxt")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !transcript.segments.some(
                (segment) => segment.end > segment.start,
              )
            }
            onClick={() => exportTranscript("srt")}
          >
            <ListMusic />
            {t("recordings.analysis.subtitlesSrt")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !transcript.segments.some(
                (segment) => segment.end > segment.start,
              )
            }
            onClick={() => exportTranscript("vtt")}
          >
            <ListMusic />
            {t("recordings.analysis.subtitlesVtt")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!analysis}
            onClick={() =>
              downloadBlob(
                new Blob([analysisMarkdown(recording!.analysis)], {
                  type: "text/markdown;charset=utf-8",
                }),
                t("recordings.analysis.analysisMd", {
                  arg0: recording!.name,
                }),
              )
            }
          >
            <FileText />
            {t("recordings.analysis.analysisMarkdown")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => downloadRecording(recording!).catch(failed)}
          >
            <Video />
            {t("recordings.analysis.originalRecording")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        onClick={() => analyze()}
        disabled={!recording}
        aria-label={analysisLabel}
        title={analysisLabel}
      >
        {task.busy ? <Square /> : <Sparkles />}
        <span className="hidden sm:inline">{analysisLabel}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!recording || task.busy}
              aria-label={t("recordings.analysis.moreAnalysisOptions")}
            >
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!!transcript.text && transcript.complete !== false}
            onClick={() => analyze(false, true)}
          >
            <FileText />
            {t("recordings.analysis.transcribeOnly")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => analyze(true)}>
            <Sparkles />
            {t("recordings.analysis.transcribeAndAnalyzeAgain")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!transcript.text}
            onClick={() => {
              setTranscriptEdit({
                phase: "editing",
                draft: structuredClone(transcript),
              });
            }}
          >
            <Pencil />
            {t("recordings.analysis.editTranscript")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
  const pageTitle = (
    <span className="truncate">
      {recording?.name || t("recordings.analysis.title")}
    </span>
  );
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ShellSidebarTrigger />
          {pageTitle}
        </div>
        <div className="flex shrink-0 items-center gap-1">{pageActions}</div>
      </div>
      {!recording ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          {!error && <Loader2 className="size-4 animate-spin" />}
          {error ? errorText(error) : t("recordings.analysis.openingRecording")}
        </div>
      ) : (
        <div
          ref={workspace}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div
            className="sticky top-0 z-10 flex shrink-0 gap-1 border-b bg-background px-4 py-2 lg:hidden"
            aria-label={t("recordings.analysis.recordingWorkspace")}
          >
            <Button
              variant={panel === "source" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={panel === "source"}
              onClick={() => setPanel("source")}
            >
              <Video />
              {t("recordings.analysis.playback")}
            </Button>
            <Button
              variant={panel === "notes" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={panel === "notes"}
              onClick={() => setPanel("notes")}
            >
              <FileText />
              {t("recordings.analysis.notesTab")}
            </Button>
          </div>
          {!task.busy && !!missingCapabilities.length && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-6 py-3 text-xs leading-5 text-muted-foreground">
              <p>
                {t("recordings.analysis.missingConnections", {
                  capabilities: missingCapabilities
                    .map((capability) => CAPABILITY_LABELS[capability])
                    .join(" / "),
                })}
              </p>
              <Button
                variant="outline"
                size="xs"
                onClick={() => openModelSettings(missingCapabilities[0])}
              >
                <Settings2 /> {t("models.connection.openSettings")}
              </Button>
            </div>
          )}
          {(task.busy || task.error || checkpoint) && (
            <div
              role="status"
              className="shrink-0 border-b bg-muted/30 px-6 py-3"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {task.busy && <Loader2 className="size-3.5 animate-spin" />}
                {task.progress ||
                  task.error ||
                  (checkpoint?.errorTranslation
                    ? translatedErrorMessage(checkpoint.errorTranslation)
                    : checkpoint?.error) ||
                  t("recordings.analysis.analysisIncomplete")}
              </div>
              {!task.busy && (task.error || checkpoint) && (
                <div className="mt-2 flex gap-2">
                  <Button size="xs" variant="outline" onClick={() => analyze()}>
                    {t("recordings.analysis.continueProcessing")}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      openModelSettings(
                        task.modelCapability ||
                          missingCapabilities[0] ||
                          "text",
                      )
                    }
                  >
                    <Settings2 />
                    {t("recordings.analysis.modelSettings")}
                  </Button>
                </div>
              )}
              {task.busy && task.total != null && (
                <Progress
                  className="mt-2 h-1"
                  value={Math.round(((task.completed || 0) / task.total) * 100)}
                />
              )}
            </div>
          )}
          <div className="analysis-workspace" data-panel={panel}>
            <section
              className="analysis-source"
              aria-label={t("recordings.analysis.recordingAndTranscript")}
            >
              <ol
                className="flex shrink-0 items-center gap-2 border-b px-5 py-3 text-[11px] text-muted-foreground"
                aria-label={t("recordings.analysis.processingProgress")}
              >
                <li className="flex items-center gap-1">
                  <Check className="size-3" />
                  {t("recordings.analysis.saved")}
                </li>
                <li aria-hidden="true">/</li>
                <li
                  className={`flex items-center gap-1 ${transcript.text ? "text-foreground" : ""}`}
                >
                  {transcript.text && transcript.complete !== false && (
                    <Check className="size-3" />
                  )}
                  {transcript.complete === false
                    ? t("recordings.analysis.transcriptionIncomplete")
                    : transcript.text
                      ? t("recordings.analysis.transcribed")
                      : t("recordings.analysis.notTranscribed")}
                </li>
                <li aria-hidden="true">/</li>
                <li
                  className={`flex items-center gap-1 ${analysis ? "text-foreground" : ""}`}
                >
                  {analysis && <Check className="size-3" />}
                  {analysis
                    ? t("recordings.analysis.organized")
                    : t("recordings.analysis.notOrganized")}
                </li>
              </ol>
              <div className="shrink-0 p-4 pb-3 sm:p-5 sm:pb-4">
                <video
                  ref={player}
                  src={`/api/assets/${recording.asset_id}`}
                  controls
                  preload="metadata"
                  onLoadedMetadata={metadataLoaded}
                  onPlay={() => setPlaying(true)}
                  onPause={() => {
                    setPlaying(false);
                    persistPlayback();
                  }}
                  onSeeked={() => persistPlayback()}
                  onError={() =>
                    showToast({
                      title: t("recordings.analysis.recordingCannotBePlayed"),
                      description: t(
                        "recordings.analysis.downloadTheOriginalRecordingToReviewIt",
                      ),
                      variant: "destructive",
                    })
                  }
                  onTimeUpdate={(event) => {
                    const current = event.currentTarget.currentTime;
                    setTime(current);
                    if (Math.floor(current) !== lastSavedTime.current) {
                      lastSavedTime.current = Math.floor(current);
                      persistPlayback(current);
                    }
                  }}
                  className="aspect-video max-h-64 w-full rounded-xl bg-black"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {recording.duration > 0
                      ? formatDuration(recording.duration)
                      : t("recordings.analysis.durationUnavailable")}
                  </span>
                  <span>
                    {new Date(recording.created_at).toLocaleDateString(
                      getLocale(),
                    )}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-y px-5 py-3">
                <h2 className="text-sm font-medium">
                  {t("recordings.analysis.transcriptTab")}
                </h2>
                <div className="flex items-center gap-1">
                  <Button
                    variant={follow ? "secondary" : "ghost"}
                    size="xs"
                    aria-pressed={follow}
                    onClick={() => setFollow(!follow)}
                  >
                    {t("recordings.analysis.followPlayback")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("recordings.analysis.copyTranscript")}
                    disabled={!transcript.text}
                    onClick={() =>
                      navigator.clipboard
                        .writeText(transcript.text)
                        .then(() =>
                          showToast({
                            title: t("recordings.analysis.transcriptCopied"),
                          }),
                        )
                        .catch(failed)
                    }
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("recordings.analysis.editTranscript")}
                    disabled={!transcript.text || task.busy}
                    onClick={() => {
                      setTranscriptEdit({
                        phase: "editing",
                        draft: structuredClone(transcript),
                      });
                    }}
                  >
                    <Pencil />
                  </Button>
                </div>
              </div>
              <div className="relative m-3 shrink-0">
                <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t("recordings.analysis.search.label")}
                  placeholder={t("recordings.analysis.search.placeholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-8 border-transparent bg-muted/60 pl-8 text-xs shadow-none"
                />
              </div>
              {transcript.complete === false && !task.busy && (
                <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                  <span>
                    {t("recordings.analysis.transcriptionProgressSaved")}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => analyze(false, true)}
                  >
                    {t("recordings.analysis.continueTranscription")}
                  </Button>
                </div>
              )}
              <div
                className="min-h-40 flex-1 overflow-y-auto px-3 pb-4"
                data-transcript-list
                aria-label={t("recordings.analysis.transcriptTitle")}
              >
                {visible.length ? (
                  visible.map(({ segment, index }) => (
                    <div
                      key={index}
                      className="group flex items-start rounded-lg hover:bg-muted/60"
                    >
                      {transcript.segments.length > 0 && (
                        <div className="pt-4 pl-2">
                          <Checkbox
                            aria-label={t(
                              "recordings.analysis.selectTranscriptSegment",
                              {
                                arg0: index + 1,
                              },
                            )}
                            checked={selectedSegments.includes(index)}
                            onCheckedChange={(checked) =>
                              setSelectedSegments((current) =>
                                checked
                                  ? [...current, index]
                                  : current.filter((item) => item !== index),
                              )
                            }
                          />
                        </div>
                      )}
                      <button
                        aria-current={
                          activeIndex === index ? "true" : undefined
                        }
                        ref={activeIndex === index ? activeItem : undefined}
                        onClick={() => seek(segment.start)}
                        className={`mb-1 flex min-w-0 flex-1 gap-3 rounded-lg px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeIndex === index ? "bg-accent" : ""}`}
                      >
                        <span
                          className={`pt-0.5 text-xs tabular-nums ${activeIndex === index ? "font-medium text-foreground" : "text-muted-foreground"}`}
                        >
                          {formatDuration(segment.start)}
                        </span>
                        <span className="min-w-0 flex-1">
                          {segment.speaker && (
                            <span className="mb-1 block text-xs font-medium text-muted-foreground">
                              {segment.speaker}
                            </span>
                          )}
                          <span className="text-sm leading-7">
                            {segment.text}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mt-3 mr-1 shrink-0 text-muted-foreground opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                        aria-label={t("recordings.analysis.createFrom", {
                          arg0: formatDuration(segment.start),
                        })}
                        title={t("recordings.analysis.createFromThisText")}
                        disabled={creatingCanvas}
                        onClick={() =>
                          openCanvas({
                            title: t("recordings.analysis.segment", {
                              arg0: formatDuration(segment.start),
                            }),
                            text: segment.text,
                            start: segment.start,
                            end: segment.end,
                          })
                        }
                      >
                        <ArrowUpRight />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center">
                    <FileText className="mx-auto mb-3 size-6 text-muted-foreground opacity-60" />
                    <p className="text-sm text-muted-foreground">
                      {search
                        ? t("recordings.analysis.noMatchingContent")
                        : t("recordings.analysis.transcriptDescription")}
                    </p>
                    {!search && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        disabled={task.busy}
                        onClick={() => analyze(false, true)}
                      >
                        {task.busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <FileText />
                        )}
                        {task.busy
                          ? t("recordings.analysis.transcribing")
                          : t("recordings.analysis.startTranscription")}
                      </Button>
                    )}
                    {!search && (
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2"
                        disabled={task.busy}
                        onClick={() => {
                          setTranscriptEdit({
                            phase: "editing",
                            draft: { version: 1, text: "", segments: [] },
                          });
                        }}
                      >
                        {t("recordings.analysis.enterText")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {selectedSegments.length > 0 && (
                <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2">
                  <span className="text-xs text-muted-foreground">
                    {t("recordings.selectedSegmentCount", {
                      count: selectedSegments.length,
                    })}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("recordings.analysis.clearSelection")}
                      onClick={() => setSelectedSegments([])}
                    >
                      <X />
                    </Button>
                    <Button
                      size="xs"
                      disabled={creatingCanvas}
                      onClick={() =>
                        openCanvas(
                          excerptsForSelection(recording, selectedSegments),
                        )
                      }
                    >
                      <PanelsTopLeft />
                      {t("recordings.analysis.turnIntoCanvas")}
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    playing
                      ? t("recordings.analysis.pausePlayback")
                      : t("recordings.analysis.playRecording")
                  }
                  onClick={togglePlayback}
                >
                  {playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("recordings.analysis.previousSentence")}
                  disabled={neighbors.previous < 0}
                  onClick={() => seek(segments[neighbors.previous].start)}
                >
                  <SkipBack />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("recordings.analysis.nextSentence")}
                  disabled={neighbors.next < 0}
                  onClick={() => seek(segments[neighbors.next].start)}
                >
                  <SkipForward />
                </Button>
                <span className="flex-1 text-xs text-muted-foreground tabular-nums">
                  {formatDuration(time)}
                </span>
                <NativeSelect
                  size="sm"
                  aria-label={t("recordings.analysis.playbackSpeed")}
                  value={rate}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setRate(next);
                    if (player.current) player.current.playbackRate = next;
                    persistPlayback();
                  }}
                >
                  {PLAYBACK_RATES.map((rate) => (
                    <NativeSelectOption key={rate} value={rate}>
                      {rate}×
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </section>
            <section
              className="analysis-reading"
              aria-label={t("recordings.analysis.resultTitle")}
            >
              <Tabs defaultValue="notes" className="min-h-0 flex-1 gap-0">
                <div className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
                  <TabsList variant="line">
                    <TabsTrigger value="notes">
                      <FileText className="size-3.5" />
                      {t("recordings.analysis.notes")}
                    </TabsTrigger>
                    <TabsTrigger value="chapters">
                      {t("recordings.analysis.chapters")}
                    </TabsTrigger>
                    <TabsTrigger value="qa">
                      {t("recordings.analysis.qA")}
                    </TabsTrigger>
                  </TabsList>
                  {analysis && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("recordings.analysis.copyAnalysis")}
                      onClick={() =>
                        navigator.clipboard
                          .writeText(analysisMarkdown(recording.analysis))
                          .then(() =>
                            showToast({
                              title: t("recordings.analysis.analysisCopied"),
                            }),
                          )
                          .catch(failed)
                      }
                    >
                      <Copy />
                    </Button>
                  )}
                </div>
                <TabsContent value="notes" className="min-h-0 overflow-y-auto">
                  <div className="mx-auto max-w-3xl px-5 py-7 sm:px-8 sm:py-8">
                    {analysis ? (
                      <>
                        <div className="mb-7 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          {t("recordings.analysis.organized")}
                        </div>
                        <h1 className="mb-4 text-2xl leading-snug font-semibold tracking-tight">
                          {recording.name}
                        </h1>
                        <p className="mb-8 text-sm leading-8 text-muted-foreground">
                          {analysis.summary}
                        </p>
                        {analysis.notes ? (
                          <Markdown>{analysis.notes}</Markdown>
                        ) : (
                          <div className="space-y-6">
                            {analysis.chapters.map((chapter, index) => (
                              <section key={index}>
                                <h2 className="mb-2 text-base font-medium">
                                  {chapter.title}
                                </h2>
                                <p className="text-sm leading-8 text-muted-foreground">
                                  {chapter.summary}
                                </p>
                              </section>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <AnalysisEmpty
                        busy={task.busy}
                        onAnalyze={() => analyze()}
                        hasTranscript={!!transcript.text}
                        onTranscribe={() => analyze(false, true)}
                      />
                    )}
                  </div>
                </TabsContent>
                <TabsContent
                  value="chapters"
                  className="min-h-0 overflow-y-auto"
                >
                  <div className="mx-auto max-w-3xl px-5 py-7 sm:px-8">
                    <h2 className="mb-2 text-lg font-semibold">
                      {t("recordings.analysis.chapters")}
                    </h2>
                    <p className="mb-6 text-sm text-muted-foreground">
                      {t("recordings.analysis.chaptersHint")}
                    </p>
                    {analysis?.chapters.length ? (
                      <div>
                        {analysis.chapters.map((chapter, index) => (
                          <div
                            key={index}
                            className="group flex items-start border-b"
                          >
                            <button
                              onClick={() => seek(chapter.start_time)}
                              className={`flex min-w-0 flex-1 gap-4 px-1 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${time >= chapter.start_time && time < chapter.end_time ? "bg-accent/50" : "hover:bg-muted/30"}`}
                            >
                              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="mb-2 block text-sm font-medium">
                                  {chapter.title}
                                </span>
                                <span className="block text-sm leading-7 text-muted-foreground">
                                  {chapter.summary}
                                </span>
                                <span className="mt-3 block text-xs text-muted-foreground tabular-nums">
                                  {formatDuration(chapter.start_time)} –{" "}
                                  {formatDuration(chapter.end_time)}
                                </span>
                              </span>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="mt-5 shrink-0 text-muted-foreground"
                              aria-label={t(
                                "recordings.analysis.createFromChapter",
                                {
                                  arg0: chapter.title,
                                },
                              )}
                              title={t(
                                "recordings.analysis.createFromThisChapter",
                              )}
                              disabled={creatingCanvas}
                              onClick={() =>
                                openCanvas(
                                  excerptForChapter(recording, chapter),
                                )
                              }
                            >
                              <ArrowUpRight />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <AnalysisEmpty
                        busy={task.busy}
                        onAnalyze={() => analyze()}
                        hasTranscript={!!transcript.text}
                        onTranscribe={() => analyze(false, true)}
                      />
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="qa" className="min-h-0 overflow-y-auto">
                  <div className="mx-auto max-w-3xl px-5 py-7 sm:px-8">
                    <h2 className="mb-2 text-lg font-semibold">
                      {t("recordings.analysis.qA")}
                    </h2>
                    <p className="mb-6 text-sm text-muted-foreground">
                      {t("recordings.analysis.questionsDescription")}
                    </p>
                    {analysis?.qa_pairs.length ? (
                      <div className="space-y-7">
                        {analysis.qa_pairs.map((qa, index) => (
                          <section key={index} className="border-b pb-7">
                            <h3 className="mb-3 flex gap-3 text-sm leading-7 font-medium">
                              <MessageSquare className="mt-1 size-4 shrink-0 text-muted-foreground" />
                              {qa.question}
                            </h3>
                            <div className="pl-7">
                              <Markdown>{qa.answer}</Markdown>
                              {qa.time !== null && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="mt-2 px-0 text-xs text-muted-foreground"
                                  onClick={() => seek(qa.time!)}
                                >
                                  <Clock3 className="size-3" />
                                  {formatDuration(qa.time)}
                                </Button>
                              )}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="py-20 text-center text-sm text-muted-foreground">
                        {analysis
                          ? t("recordings.analysis.questionsEmpty")
                          : t("recordings.analysis.questionsEmptyHint")}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </section>
          </div>
        </div>
      )}
      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!saving && !open) setTranscriptEdit({ phase: "closed" });
        }}
      >
        <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-2xl">
          <DialogTitle>{t("recordings.analysis.editTranscript")}</DialogTitle>
          <DialogDescription>
            {t("recordings.analysis.correctTheTextWhileKeepingTimestamps")}
          </DialogDescription>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {draft?.segments.length ? (
              draft.segments.map((segment, index) => (
                <div key={index}>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {formatDuration(segment.start)}
                    {segment.speaker ? " · " + segment.speaker : ""}
                  </p>
                  <Textarea
                    aria-label={t("recordings.analysis.transcriptSegment", {
                      arg0: index + 1,
                    })}
                    value={segment.text}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current!,
                        segments: current!.segments.map((item, i) =>
                          i === index
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </div>
              ))
            ) : (
              <Textarea
                aria-label={t("recordings.analysis.transcriptText")}
                className="min-h-64"
                value={draft?.text || ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current!,
                    text: event.target.value,
                  }))
                }
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setTranscriptEdit({ phase: "closed" })}
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={saving} onClick={saveTranscript}>
              {saving && <Loader2 className="animate-spin" />}
              {t("recordings.analysis.saveTranscript")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnalysisEmpty({
  busy,
  onAnalyze,
  hasTranscript,
  onTranscribe,
}: {
  busy: boolean;
  onAnalyze: () => void;
  hasTranscript: boolean;
  onTranscribe?: () => void;
}) {
  useLocale();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border bg-muted/30">
        <Sparkles className="size-5 text-muted-foreground" />
      </div>
      <h2 className="mb-3 text-lg font-medium">
        {t("recordings.analysis.turnPlaybackIntoUnderstanding")}
      </h2>
      <p className="mb-6 text-sm leading-7 text-muted-foreground">
        {hasTranscript
          ? t("recordings.analysis.organizeDescription")
          : t("recordings.analysis.description")}
      </p>
      <Button variant="outline" disabled={busy} onClick={onAnalyze}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy
          ? t("recordings.analysis.processing")
          : hasTranscript
            ? t("recordings.analysis.organizeContent")
            : t("recordings.analysis.transcribeAndOrganize")}
      </Button>
      {!hasTranscript && onTranscribe && (
        <Button
          variant="ghost"
          className="mt-2"
          disabled={busy}
          onClick={onTranscribe}
        >
          {t("recordings.analysis.transcribeOnly")}
        </Button>
      )}
    </div>
  );
}
