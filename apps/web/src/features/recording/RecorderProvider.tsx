import { errorText, LocalizedError } from "@/i18n/errors";
import { getLocale, t, useLocale, type MessageKey } from "@/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Pause, Play, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/common/ToastProvider";
import {
  api,
  APIError,
  uploadAsset,
  downloadBlob,
  type Project,
  type Recording,
} from "@/api/client";
import { isSharedCanvas } from "@/lib/canvas-access";
import {
  transitionCapture,
  type CaptureState,
  type CaptureEvent,
} from "./capture-state";

import {
  RecorderContext,
  type RecorderState,
  type StartRecordingResult,
} from "./use-recorder";

import { formatDuration } from "./duration";

export function RecorderProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [capture, setCapture] = useState<CaptureState>({ status: "idle" });
  const captureRef = useRef(capture);
  function send(event: CaptureEvent) {
    const next = transitionCapture(captureRef.current, event);
    captureRef.current = next;
    setCapture(next);
  }
  const status = capture.status;
  const pending =
    capture.status === "pending" || capture.status === "saving"
      ? capture.blob
      : null;
  const saveError = capture.status === "pending" ? capture.error : null;
  const [elapsed, setElapsed] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [preview, setPreview] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [name, setName] = useState("");
  const [boardId, setBoardId] = useState("");
  const [boards, setBoards] = useState<
    Pick<Project, "id" | "name">[] | "loading" | "unavailable"
  >("loading");
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const duration = useRef(0);
  const recordedMs = useRef(0);
  const startedAt = useRef<number | null>(null);
  const navigate = useNavigate();
  const shared = isSharedCanvas();
  const { showToast } = useToast();
  const boardUnavailable =
    !!boardId &&
    Array.isArray(boards) &&
    !boards.some(({ id }) => id === boardId);
  const canSave =
    !shared && status === "pending" && !!name.trim() && !boardUnavailable;
  useEffect(() => {
    if (status !== "recording") return;
    const interval = setInterval(() => {
      duration.current = Math.floor(
        (recordedMs.current +
          (startedAt.current == null
            ? 0
            : performance.now() - startedAt.current)) /
          1000,
      );
      setElapsed(duration.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);
  useEffect(() => {
    if (!pending) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);
  useEffect(() => {
    if (!pending || !reviewing || shared) return;
    const controller = new AbortController();
    void api<Pick<Project, "id" | "name">[]>("/api/projects", {
      signal: controller.signal,
    })
      .then((projects) => {
        if (!controller.signal.aborted) setBoards(projects);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setBoards((current) =>
            Array.isArray(current) ? current : "unavailable",
          );
      });
    return () => controller.abort();
  }, [pending, reviewing, shared]);
  useEffect(() => {
    if (
      !pending &&
      status !== "recording" &&
      status !== "paused" &&
      status !== "stopping"
    )
      return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending, status]);
  function pauseClock() {
    if (startedAt.current != null)
      recordedMs.current += performance.now() - startedAt.current;
    startedAt.current = null;
    duration.current = Math.floor(recordedMs.current / 1000);
    setElapsed(duration.current);
  }
  function release() {
    for (const stream of streams.current)
      stream.getTracks().forEach((track) => track.stop());
    streams.current = [];
    void audioContext.current?.close();
    audioContext.current = null;
  }
  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      release();
    },
    [],
  );
  async function start(microphone: boolean): Promise<StartRecordingResult> {
    if (captureRef.current.status !== "idle") return "cancelled";
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === "undefined"
    )
      return "recordings.recorder.thisBrowserDoesntSupportScreenRecording";
    send({ type: "start" });
    let choosingDisplay = true;
    let failureMessage: MessageKey = "recordings.recorder.tryAnotherSource";
    try {
      const options: DisplayMediaStreamOptions & {
        selfBrowserSurface: "include";
      } = {
        video: true,
        audio: true,
        selfBrowserSurface: "include",
      };
      const display = await navigator.mediaDevices.getDisplayMedia(options);
      choosingDisplay = false;
      streams.current.push(display);
      const displayTrack = display.getVideoTracks()[0];
      let microphoneStream: MediaStream | undefined;
      if (microphone) {
        failureMessage = "recordings.recorder.microphoneUnavailable";
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streams.current.push(microphoneStream);
      }
      failureMessage = "recordings.recorder.tryAnotherSource";
      if (displayTrack.readyState === "ended") {
        release();
        send({ type: "start-failed" });
        return "cancelled";
      }
      const audioSources = [display, microphoneStream].filter(
        (stream) => stream?.getAudioTracks().length,
      ) as MediaStream[];
      const output = new MediaStream([displayTrack]);
      if (audioSources.length) {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        audioContext.current = context;
        for (const source of audioSources)
          context.createMediaStreamSource(source).connect(destination);
        destination.stream
          .getAudioTracks()
          .forEach((track) => output.addTrack(track));
      }
      streams.current.push(output);
      const mime = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(
        output,
        mime ? { mimeType: mime } : undefined,
      );
      const chunks: Blob[] = [];
      let bytes = 0;
      media.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
          if (bytes > 480 * 1024 * 1024 && media.state !== "inactive")
            media.stop();
        }
      };
      media.onstop = () => {
        pauseClock();
        const blob = new Blob(chunks, { type: media.mimeType || "video/webm" });
        release();
        recorder.current = null;
        send({ type: "stopped", blob });
        if (blob.size) {
          setBoardId("");
          setBoards("loading");
          setReviewing(true);
          setName(
            t("recordings.recorder.defaultName", {
              arg0: new Date().toLocaleString(getLocale(), { hour12: false }),
            }),
          );
        }
      };
      media.onerror = () => {
        showToast({
          title: t("recordings.recorder.recordingInterrupted"),
          description: t("recordings.recorder.saveWhatYouveRecordedSoFar"),
          variant: "destructive",
        });
        if (media.state !== "inactive") media.stop();
      };
      displayTrack.onended = () => {
        if (media.state !== "inactive") media.stop();
      };
      recorder.current = media;
      duration.current = 0;
      recordedMs.current = 0;
      startedAt.current = performance.now();
      setElapsed(0);
      media.start(1000);
      send({ type: "started" });
      return "started";
    } catch (error) {
      release();
      recorder.current = null;
      startedAt.current = null;
      send({ type: "start-failed" });
      if (choosingDisplay && error instanceof DOMException) {
        if (error.name === "NotAllowedError") return "cancelled";
        if (error.name === "NotReadableError" || error.name === "SecurityError")
          return "recordings.recorder.checkScreenRecordingPermissions";
      }
      return failureMessage;
    }
  }
  async function save(open = true) {
    const current = captureRef.current;
    if (current.status !== "pending" || !canSave) return;
    send({ type: "save" });
    try {
      const extension = current.blob.type.includes("mp4") ? "mp4" : "webm";
      const asset =
        current.asset ||
        (await uploadAsset(
          current.blob,
          `${name.replace(/[\\/:]/g, "-")}.${extension}`,
        ));
      send({ type: "uploaded", asset });
      const saved = await api<Recording>("/api/recordings", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          asset_id: asset.id,
          project_id: boardId || undefined,
          duration: duration.current,
        }),
      });
      send({ type: "saved" });
      setReviewing(false);
      showToast({ title: t("recordings.recorder.recordingSaved") });
      window.dispatchEvent(new Event("huayu:recordings-changed"));
      if (open) navigate(`/recordings/${saved.id}/analysis`);
    } catch (error) {
      send({
        type: "save-failed",
        error:
          error instanceof APIError
            ? error
            : new LocalizedError({ key: "recordings.recorder.cannotSave" }),
      });
    }
  }
  const value: RecorderState = {
    status,
    elapsed,
    hasPending: !!pending,
    review: () => setReviewing(true),
    start,
    stop: () => {
      if (
        captureRef.current.status !== "recording" &&
        captureRef.current.status !== "paused"
      )
        return;
      send({ type: "stop" });
      recorder.current?.stop();
    },
    pause: () => {
      if (recorder.current?.state === "recording") {
        recorder.current.pause();
        pauseClock();
        send({ type: "pause" });
      }
    },
    resume: () => {
      if (recorder.current?.state === "paused") {
        recorder.current.resume();
        startedAt.current = performance.now();
        send({ type: "resume" });
      }
    },
  };
  const isPaused = status === "paused";
  const pauseActionLabel = t(
    isPaused
      ? "recordings.recorder.resumeRecording"
      : "recordings.recorder.pauseRecording",
  );
  const finishActionLabel = t("recordings.recorder.finishCapture");
  const elapsedLabel = formatDuration(elapsed);
  return (
    <RecorderContext value={value}>
      {children}
      {(status === "recording" || isPaused) && (
        <div className="recording-toolbar fixed right-4 bottom-5 z-[1500] flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border bg-popover/95 p-1 text-popover-foreground shadow-sm backdrop-blur-md">
          <span role="status" className="sr-only">
            {t(
              isPaused
                ? "recordings.recorder.paused"
                : "recordings.recorder.recording",
            )}
          </span>
          <span role="timer" className="sr-only">
            {elapsedLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={pauseActionLabel}
            title={pauseActionLabel}
            onClick={isPaused ? value.resume : value.pause}
          >
            {isPaused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            className="rounded-full bg-red-700 px-3 text-white hover:bg-red-800 hover:text-white dark:hover:bg-red-800"
            aria-label={finishActionLabel}
            title={finishActionLabel}
            onClick={value.stop}
          >
            <Square aria-hidden="true" className="size-3 fill-current" />
            <span aria-hidden="true" className="tabular-nums">
              {elapsedLabel}
            </span>
          </Button>
        </div>
      )}
      {pending && !reviewing && (
        <div
          className="fixed right-4 bottom-4 z-[1500] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border bg-popover p-3 shadow-lg"
          role="status"
        >
          <span className="min-w-0 text-sm tabular-nums">
            {t("recordings.recorder.unsavedRecording")}
            {" · "}
            {elapsedLabel}
          </span>
          <Button size="sm" onClick={() => setReviewing(true)}>
            {t("recordings.recorder.continueSaving")}
          </Button>
        </div>
      )}
      <Dialog
        open={!!pending && reviewing}
        onOpenChange={(open) => {
          if (status !== "saving") setReviewing(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>{t("recordings.recorder.saveRecording")}</DialogTitle>
          <DialogDescription>
            {t("recordings.recorder.recorded", {
              duration: formatDuration(elapsed),
            })}
          </DialogDescription>
          {preview && (
            <video
              src={preview}
              controls
              className="max-h-64 w-full rounded-lg bg-black"
            />
          )}
          <Input
            aria-label={t("recordings.recorder.recordingName")}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
          {!shared && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="recording-board" className="shrink-0">
                {t("recordings.recorder.linkBoard")}
              </Label>
              <NativeSelect
                id="recording-board"
                className="w-60 min-w-0 max-w-[65%]"
                value={boardId}
                disabled={status === "saving"}
                onChange={(event) => setBoardId(event.target.value)}
              >
                <NativeSelectOption value="">
                  {t("recordings.recorder.noLinkedBoard")}
                </NativeSelectOption>
                {Array.isArray(boards) ? (
                  boards.map(({ id, name }) => (
                    <NativeSelectOption key={id} value={id}>
                      {name}
                    </NativeSelectOption>
                  ))
                ) : (
                  <NativeSelectOption disabled>
                    {t(
                      boards === "loading"
                        ? "common.loading"
                        : "projects.cannotLoadProjects",
                    )}
                  </NativeSelectOption>
                )}
                {boardUnavailable && (
                  <NativeSelectOption value={boardId} disabled>
                    {t("recordings.recorder.boardUnavailable")}
                  </NativeSelectOption>
                )}
              </NativeSelect>
            </div>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {errorText(saveError)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={status === "saving"}
              onClick={() => setDiscarding(true)}
            >
              {t("recordings.recorder.discardRecording")}
            </Button>
            <Button
              variant="outline"
              disabled={status === "saving"}
              onClick={() => {
                if (pending)
                  downloadBlob(
                    pending,
                    `${name || t("navigation.recordings")}.${pending.type.includes("mp4") ? "mp4" : "webm"}`,
                  );
              }}
            >
              {t("recordings.recorder.downloadToComputer")}
            </Button>
            {shared ? (
              <Button onClick={() => navigate("/recordings")}>
                {t("recordings.recorder.saveFromRecordings")}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  disabled={!canSave}
                  onClick={() => save(false)}
                >
                  {t("recordings.recorder.saveOnly")}
                </Button>
                <Button disabled={!canSave} onClick={() => save()}>
                  {status === "saving" && <Loader2 className="animate-spin" />}
                  {t("recordings.recorder.saveAndReview")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {t("recordings.recorder.discardThisRecording")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("recordings.recorder.thisRecordingHasntBeenSaved")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("recordings.recorder.continueSaving")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                send({ type: "discard" });
                setReviewing(false);
                setElapsed(0);
                setDiscarding(false);
              }}
            >
              {t("recordings.recorder.discardRecording")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RecorderContext>
  );
}
