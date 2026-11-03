import { t, useLocale, getLocale } from "@/i18n";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Circle, Loader2, Mic, Pause, Play, Square } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/ui/dialog";
import { Switch } from "@/ui/switch";
import { Label } from "@/ui/label";
import { Input } from "@/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/ui/alert-dialog";
import { useToast } from "@/Components/common/ToastProvider";
import { api, uploadAsset, downloadBlob, type Recording } from "@/api/client";

type RecorderStatus = "idle" | "starting" | "recording" | "paused" | "saving";
interface RecorderState {
  status: RecorderStatus;
  elapsed: number;
  start: (microphone: boolean) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  hasPending: boolean;
  review: () => void;
}
const Context = createContext<RecorderState | null>(null);
export function RecorderProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<Blob | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [preview, setPreview] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const duration = useRef(0);
  const recordedMs = useRef(0);
  const startedAt = useRef<number | null>(null);
  const uploaded = useRef<Awaited<ReturnType<typeof uploadAsset>> | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
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
    if (!pending && status !== "recording" && status !== "paused") return;
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
  async function start(microphone: boolean) {
    if (status !== "idle" || pending) return;
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === "undefined"
    )
      throw new Error(
        t("recordings.recorder.thisBrowserDoesntSupportScreenRecording"),
      );
    setStatus("starting");
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streams.current.push(display);
      let microphoneStream: MediaStream | undefined;
      if (microphone) {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streams.current.push(microphoneStream);
      }
      const audioSources = [display, microphoneStream].filter(
        (stream) => stream?.getAudioTracks().length,
      ) as MediaStream[];
      const output = new MediaStream(display.getVideoTracks());
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
        setStatus("idle");
        if (blob.size) {
          setPending(blob);
          uploaded.current = null;
          setReviewing(true);
          setName(
            t("recordings.recorder.defaultName", {
              arg0: new Date().toLocaleString(getLocale(), { hour12: false }),
            }),
          );
          setSaveError("");
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
      display.getVideoTracks()[0].onended = () => {
        if (media.state !== "inactive") media.stop();
      };
      recorder.current = media;
      duration.current = 0;
      recordedMs.current = 0;
      startedAt.current = performance.now();
      setElapsed(0);
      media.start(1000);
      setStatus("recording");
    } catch (error) {
      release();
      setStatus("idle");
      throw error;
    }
  }
  async function save(open = true) {
    if (!pending || !name.trim()) return;
    setStatus("saving");
    setSaveError("");
    try {
      const extension = pending.type.includes("mp4") ? "mp4" : "webm";
      const asset =
        uploaded.current ||
        (await uploadAsset(
          pending,
          `${name.replace(/[\\/:]/g, "-")}.${extension}`,
        ));
      uploaded.current = asset;
      const saved = await api<Recording>("/api/recordings", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          asset_id: asset.id,
          duration: duration.current,
        }),
      });
      setPending(null);
      setReviewing(false);
      uploaded.current = null;
      showToast({ title: t("recordings.recorder.recordingSaved") });
      window.dispatchEvent(new Event("huayu:recordings-changed"));
      if (open) navigate(`/recordings/${saved.id}/analysis`);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : t("recordings.recorder.cannotSave"),
      );
    } finally {
      setStatus("idle");
    }
  }
  const value: RecorderState = {
    status,
    elapsed,
    hasPending: !!pending,
    review: () => setReviewing(true),
    start,
    stop: () => {
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
    },
    pause: () => {
      if (recorder.current?.state === "recording") {
        recorder.current.pause();
        pauseClock();
        setStatus("paused");
      }
    },
    resume: () => {
      if (recorder.current?.state === "paused") {
        recorder.current.resume();
        startedAt.current = performance.now();
        setStatus("recording");
      }
    },
  };
  return (
    <Context value={value}>
      {children}
      {(status === "recording" || status === "paused") && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-[1500] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border bg-popover p-3 shadow-lg"
        >
          <span
            className={`size-2 rounded-full ${status === "paused" ? "bg-muted-foreground" : "animate-pulse bg-destructive"}`}
          />
          <span className="min-w-20 text-sm tabular-nums">
            {status === "paused"
              ? t("recordings.recorder.paused")
              : t("recordings.recorder.recordingPrefix")}
            {formatDuration(elapsed)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              status === "paused"
                ? t("recordings.recorder.resumeRecording")
                : t("recordings.recorder.pauseRecording")
            }
            onClick={status === "paused" ? value.resume : value.pause}
          >
            {status === "paused" ? <Play /> : <Pause />}
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            aria-label={t("recordings.recorder.finishCapture")}
            onClick={value.stop}
          >
            <Square />
          </Button>
        </div>
      )}
      {pending && !reviewing && (
        <div
          className="fixed right-4 bottom-4 z-[1500] flex items-center gap-3 rounded-xl border bg-popover p-3 shadow-lg"
          role="status"
        >
          <span className="text-sm">
            {t("recordings.recorder.unsavedRecording")}
            {formatDuration(elapsed)}
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
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
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
            <Button
              variant="ghost"
              disabled={status === "saving" || !name.trim()}
              onClick={() => save(false)}
            >
              {t("recordings.recorder.saveOnly")}
            </Button>
            <Button
              disabled={status === "saving" || !name.trim()}
              onClick={() => save()}
            >
              {status === "saving" && <Loader2 className="animate-spin" />}
              {t("recordings.recorder.saveAndReview")}
            </Button>
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
                setPending(null);
                setReviewing(false);
                uploaded.current = null;
                setElapsed(0);
                setDiscarding(false);
              }}
            >
              {t("recordings.recorder.discardRecording")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context>
  );
}
export function useRecorder() {
  const value = useContext(Context);
  if (!value)
    throw new Error(t("recordings.recorder.theRecordingServiceIsntReady"));
  return value;
}
export function RecorderButton({ prominent = false }: { prominent?: boolean }) {
  useLocale();
  const recorder = useRecorder();
  const [open, setOpen] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [starting, setStarting] = useState(false);
  const { showToast } = useToast();
  return (
    <>
      <Button
        variant={prominent ? "default" : "ghost"}
        size="sm"
        aria-label={
          recorder.hasPending
            ? t("recordings.recorder.continueSavingRecording")
            : recorder.status === "recording" || recorder.status === "paused"
              ? t("recordings.recorder.finishRecording")
              : t("recordings.recorder.recordScreen")
        }
        disabled={
          recorder.status === "saving" ||
          recorder.status === "starting" ||
          starting
        }
        onClick={() =>
          recorder.hasPending
            ? recorder.review()
            : recorder.status === "recording" || recorder.status === "paused"
              ? recorder.stop()
              : setOpen(true)
        }
      >
        {starting ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Circle
            className={
              recorder.status === "recording"
                ? "fill-destructive text-destructive"
                : ""
            }
          />
        )}
        <span className={prominent ? "" : "hidden xl:inline"}>
          {recorder.status === "recording" || recorder.status === "paused"
            ? t("recordings.recorder.finishRecording")
            : recorder.hasPending
              ? t("recordings.recorder.continueSaving")
              : prominent
                ? t("recordings.recorder.startRecording")
                : t("navigation.recordings")}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{t("recordings.recorder.recordScreen")}</DialogTitle>
          <DialogDescription>
            {t("recordings.recorder.chooseAScreenWindowOrTab")}
          </DialogDescription>
          <div className="flex items-center justify-between py-3">
            <Label
              htmlFor="record-microphone"
              className="flex items-center gap-2"
            >
              <Mic className="size-4" />
              {t("recordings.recorder.recordMicrophone")}
            </Label>
            <Switch
              id="record-microphone"
              checked={microphone}
              onCheckedChange={setMicrophone}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                try {
                  await recorder.start(microphone);
                  setOpen(false);
                } catch (error) {
                  showToast({
                    title: t("recordings.recorder.cannotStartRecording"),
                    description:
                      error instanceof Error
                        ? error.message
                        : t(
                            "recordings.recorder.checkScreenRecordingPermissions",
                          ),
                    variant: "destructive",
                  });
                } finally {
                  setStarting(false);
                }
              }}
            >
              {t("recordings.recorder.chooseWhatToRecord")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
