import { LocalizedError } from "@/i18n/errors";
import { type MessageKey } from "@/i18n";
import { createContext, useContext } from "react";
import { type CaptureState } from "./capture-state";

type RecorderStatus = CaptureState["status"];

export type StartRecordingResult = "started" | "cancelled" | MessageKey;

export interface RecorderState {
  status: RecorderStatus;
  elapsed: number;
  start: (microphone: boolean) => Promise<StartRecordingResult>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  hasPending: boolean;
  review: () => void;
}

export const RecorderContext = createContext<RecorderState | null>(null);

export function useRecorder() {
  const value = useContext(RecorderContext);
  if (!value)
    throw new LocalizedError({
      key: "recordings.recorder.theRecordingServiceIsntReady",
    });
  return value;
}
