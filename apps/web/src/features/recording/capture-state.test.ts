import { describe, expect, it } from "vite-plus/test";
import { transitionCapture, type CaptureState } from "./capture-state";
import type { Asset } from "@/api/client";
import { errorText, LocalizedError } from "@/i18n/errors";
import { setLanguage } from "@/i18n";

describe("capture ownership", () => {
  const blob = new Blob(["recording"]);
  it("retains a save failure for translation after changing language", () => {
    const error = new LocalizedError({ key: "recordings.recorder.cannotSave" });
    const state = transitionCapture(
      { status: "saving", phase: "creating", blob, asset: null },
      { type: "save-failed", error },
    );
    expect(state.status).toBe("pending");
    if (state.status !== "pending") return;
    expect(state.error).toBe(error);
    expect(errorText(state.error)).toMatch(/\p{Script=Han}/u);
    setLanguage("en");
    expect(errorText(state.error)).not.toMatch(/\p{Script=Han}/u);
  });
  it("keeps an unsaved capture after stopping and refuses another start", () => {
    const pending = transitionCapture(
      { status: "stopping" },
      { type: "stopped", blob },
    );
    expect(pending).toMatchObject({ status: "pending", blob });
    expect(transitionCapture(pending, { type: "start" })).toBe(pending);
    expect(
      transitionCapture(pending, { type: "stopped", blob: new Blob(["late"]) }),
    ).toBe(pending);
  });
  it("retries record creation with the already uploaded asset", () => {
    const asset = { id: "uploaded" } as Asset;
    let state: CaptureState = {
      status: "pending",
      blob,
      asset: null,
      error: null,
    };
    state = transitionCapture(state, { type: "save" });
    state = transitionCapture(state, { type: "uploaded", asset });
    state = transitionCapture(state, {
      type: "save-failed",
      error: new Error("offline"),
    });
    expect(state).toMatchObject({
      status: "pending",
      asset,
      blob,
      error: new Error("offline"),
    });
    state = transitionCapture(state, { type: "save" });
    expect(state).toMatchObject({ status: "saving", phase: "creating", asset });
    expect(transitionCapture(state, { type: "discard" })).toBe(state);
    expect(transitionCapture(state, { type: "saved" })).toEqual({
      status: "idle",
    });
  });
  it("does not retain an empty capture or revive a discarded capture", () => {
    expect(
      transitionCapture(
        { status: "stopping" },
        { type: "stopped", blob: new Blob() },
      ),
    ).toEqual({ status: "idle" });
    const discarded = transitionCapture(
      { status: "pending", blob, asset: null, error: null },
      { type: "discard" },
    );
    expect(
      transitionCapture(discarded, {
        type: "save-failed",
        error: new Error("late"),
      }),
    ).toBe(discarded);
  });
});
