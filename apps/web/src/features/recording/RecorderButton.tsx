import { useTranslations } from "@/i18n";
import { useState, type ReactNode, type ReactElement } from "react";
import { Circle, Loader2, Mic, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/common/ToastProvider";

import { useRecorder } from "./use-recorder";

export function RecorderButton({
  prominent = false,
  toolbar = false,
  renderTrigger,
}: {
  prominent?: boolean;
  toolbar?: boolean;
  renderTrigger?: (trigger: ReactElement, label: string) => ReactNode;
}) {
  const { t } = useTranslations();
  const recorder = useRecorder();
  const [open, setOpen] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [starting, setStarting] = useState(false);
  const { showToast } = useToast();
  const active =
    recorder.status === "recording" || recorder.status === "paused";
  const recordingLabel = recorder.hasPending
    ? t("recordings.recorder.continueSavingRecording")
    : active
      ? t("recordings.recorder.finishRecording")
      : prominent
        ? t("recordings.recorder.startRecording")
        : t("recordings.recorder.recordScreen");
  const RecordIcon = active ? Square : toolbar ? Video : Circle;
  const trigger = (
    <Button
      variant={prominent ? "default" : "ghost"}
      size={prominent ? "default" : "sm"}
      className={toolbar ? "board-toolbar-button" : undefined}
      aria-label={recordingLabel}
      disabled={
        recorder.status === "saving" ||
        recorder.status === "stopping" ||
        recorder.status === "starting" ||
        starting
      }
      onClick={() =>
        recorder.hasPending
          ? recorder.review()
          : active
            ? recorder.stop()
            : setOpen(true)
      }
    >
      {starting ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <RecordIcon aria-hidden="true" />
      )}
      <span
        className={
          toolbar
            ? "board-toolbar-utility-label"
            : prominent
              ? ""
              : "hidden xl:inline"
        }
      >
        {active
          ? recordingLabel
          : recorder.hasPending
            ? t("recordings.recorder.continueSaving")
            : prominent
              ? t("recordings.recorder.startRecording")
              : toolbar
                ? t("canvas.recordScreen")
                : t("navigation.recordings")}
      </span>
    </Button>
  );
  return (
    <>
      {renderTrigger ? renderTrigger(trigger, recordingLabel) : trigger}
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
                  const result = await recorder.start(microphone);
                  if (result === "started") {
                    setOpen(false);
                  } else if (result !== "cancelled") {
                    showToast({
                      title: t("recordings.recorder.cannotStartRecording"),
                      description: t(result),
                      variant: "destructive",
                    });
                  }
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
