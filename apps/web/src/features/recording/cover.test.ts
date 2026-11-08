import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadRecordingCover } from "./cover";

const recording = { id: "recording", asset_id: "video-file" };
afterEach(() => vi.unstubAllGlobals());

function browserMedia(width = 1920, height = 1080, duration = 12) {
  let time = 0;
  const video = {
    videoWidth: width,
    videoHeight: height,
    duration,
    src: "",
    seeking: false,
    onloadedmetadata: null as (() => void) | null,
    onloadeddata: null as (() => void) | null,
    onseeked: null as (() => void) | null,
    onerror: null as (() => void) | null,
    get currentTime() {
      return time;
    },
    set currentTime(value: number) {
      time = value;
      queueMicrotask(() => video.onseeked?.());
    },
    removeAttribute: vi.fn(() => {
      video.src = "";
    }),
    load: vi.fn(() => {
      if (video.src) queueMicrotask(() => video.onloadedmetadata?.());
    }),
  };
  const frame = new Blob(["frame"], { type: "image/jpeg" });
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (done: (value: Blob) => void) => done(frame),
  };
  vi.stubGlobal("document", {
    createElement: (tag: string) => (tag === "video" ? video : canvas),
  });
  return { video, canvas, drawImage, frame };
}

describe("recording covers", () => {
  it("loads the actual local cover without decoding the recording in the browser", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(["jpeg"], { type: "image/jpeg" })),
      );
    vi.stubGlobal("fetch", fetch);
    const cover = await loadRecordingCover(
      recording,
      new AbortController().signal,
    );
    expect(await cover!.text()).toBe("jpeg");
    expect(fetch).toHaveBeenCalledWith(
      "/api/recordings/recording/cover",
      expect.objectContaining({ credentials: "omit", cache: "force-cache" }),
    );
  });
  it("identifies audio without downloading the original media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });
    await expect(
      loadRecordingCover(recording, new AbortController().signal),
    ).resolves.toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });
  it("falls back to a real browser frame when the local decoder is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const { video, canvas, drawImage, frame } = browserMedia();
    await expect(
      loadRecordingCover(recording, new AbortController().signal),
    ).resolves.toBe(frame);
    expect([canvas.width, canvas.height]).toEqual([640, 360]);
    expect(video.currentTime).toBe(1);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(video.src).toBe("");
    expect(video.load).toHaveBeenCalledTimes(2);
    expect(video.onloadedmetadata).toBeNull();
  });
  it("keeps portrait proportions and seeks within very short recordings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const { video, canvas } = browserMedia(300, 700, 0.04);
    await loadRecordingCover(recording, new AbortController().signal);
    expect([canvas.width, canvas.height]).toEqual([154, 360]);
    expect(video.currentTime).toBeCloseTo(0.004);
  });
  it("recognizes audio-only media in the browser fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 422 })),
    );
    const { video, drawImage } = browserMedia(0, 0);
    await expect(
      loadRecordingCover(recording, new AbortController().signal),
    ).resolves.toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(video.src).toBe("");
  });
  it("aborts and releases the media element while a fallback frame is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const { video } = browserMedia();
    video.load.mockImplementation(() => {});
    const controller = new AbortController();
    const pending = loadRecordingCover(recording, controller.signal);
    await vi.waitFor(() => expect(video.load).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(video.src).toBe("");
    expect(video.onseeked).toBeNull();
  });
});
