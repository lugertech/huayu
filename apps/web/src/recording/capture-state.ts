import type { uploadAsset } from "@/api/client";

type UploadedAsset = Awaited<ReturnType<typeof uploadAsset>>;
type Capture = { blob: Blob; asset: UploadedAsset | null };
export type CaptureState =
  | { status: "idle" | "starting" | "recording" | "paused" | "stopping" }
  | ({ status: "pending"; error: string } & Capture)
  | ({ status: "saving"; phase: "uploading" | "creating" } & Capture);
export type CaptureEvent =
  | {
      type:
        | "start"
        | "started"
        | "start-failed"
        | "pause"
        | "resume"
        | "stop"
        | "save"
        | "saved"
        | "discard";
    }
  | { type: "stopped"; blob: Blob }
  | { type: "uploaded"; asset: UploadedAsset }
  | { type: "save-failed"; error: string };

/** Owns the capture and its uploaded asset until save or explicit discard. */
export function transitionCapture(
  state: CaptureState,
  event: CaptureEvent,
): CaptureState {
  switch (event.type) {
    case "start":
      return state.status === "idle" ? { status: "starting" } : state;
    case "started":
      return state.status === "starting" ? { status: "recording" } : state;
    case "start-failed":
      return state.status === "starting" ? { status: "idle" } : state;
    case "pause":
      return state.status === "recording" ? { status: "paused" } : state;
    case "resume":
      return state.status === "paused" ? { status: "recording" } : state;
    case "stop":
      return state.status === "recording" || state.status === "paused"
        ? { status: "stopping" }
        : state;
    case "stopped":
      if (!["recording", "paused", "stopping"].includes(state.status))
        return state;
      return event.blob.size
        ? { status: "pending", blob: event.blob, asset: null, error: "" }
        : { status: "idle" };
    case "save":
      return state.status === "pending"
        ? {
            status: "saving",
            blob: state.blob,
            asset: state.asset,
            phase: state.asset ? "creating" : "uploading",
          }
        : state;
    case "uploaded":
      return state.status === "saving"
        ? { ...state, phase: "creating", asset: event.asset }
        : state;
    case "save-failed":
      return state.status === "saving"
        ? {
            status: "pending",
            blob: state.blob,
            asset: state.asset,
            error: event.error,
          }
        : state;
    case "saved":
      return state.status === "saving" ? { status: "idle" } : state;
    case "discard":
      return state.status === "pending" ? { status: "idle" } : state;
  }
}
