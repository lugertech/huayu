import type { Recording } from "@/api/client";

/** A null cover identifies audio; decoding failure is handled by the card. */
export async function loadRecordingCover(
  recording: Pick<Recording, "id" | "asset_id">,
  signal: AbortSignal,
): Promise<Blob | null> {
  try {
    const response = await fetch(`/api/recordings/${recording.id}/cover`, {
      signal,
      credentials: "omit",
      cache: "force-cache",
    });
    if (response.status === 204) return null;
    if (response.ok) return await response.blob();
  } catch (error) {
    if (signal.aborted) throw error;
  }
  signal.throwIfAborted();

  // The browser can read the original when the optional local decoder is absent.
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let phase: "loading" | "seeking" | "capturing" | "settled" = "loading";
    const finish = (cover: Blob | null, error?: Error) => {
      if (phase === "settled") return;
      phase = "settled";
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      if (error) reject(error);
      else resolve(cover);
    };
    const abort = () =>
      finish(null, new DOMException("Preview cancelled", "AbortError"));
    const timer = setTimeout(
      () => finish(null, new Error("Preview timed out")),
      8000,
    );
    const capture = () => {
      if (phase === "settled" || phase === "capturing") return;
      phase = "capturing";
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        640 / video.videoWidth,
        360 / video.videoHeight,
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        finish(null, new Error("Preview is unavailable"));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) =>
          finish(blob, blob ? undefined : new Error("Preview is unavailable")),
        "image/jpeg",
        0.82,
      );
    };
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(null);
        return;
      }
      phase = "seeking";
      video.currentTime =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(1, video.duration / 10)
          : 0.1;
    };
    video.onloadeddata = () => {
      if (!video.seeking && video.videoWidth && video.videoHeight) capture();
    };
    video.onseeked = capture;
    video.onerror = () => finish(null, new Error("Preview is unavailable"));
    signal.addEventListener("abort", abort, { once: true });
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = `/api/assets/${recording.asset_id}`;
    video.load();
  });
}
