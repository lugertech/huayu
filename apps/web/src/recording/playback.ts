import type { SpeechSegment } from "@/ai/provider";

export interface PlaybackView {
  time: number;
  rate: number;
}
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const playbackKey = (id: string) => `huayu:recording-view:v1:${id}`;
export function readPlayback(raw: string | null): PlaybackView {
  try {
    const value = JSON.parse(raw || "null");
    return {
      time: Number.isFinite(value?.time) && value.time >= 0 ? value.time : 0,
      rate: PLAYBACK_RATES.includes(value?.rate) ? value.rate : 1,
    };
  } catch {
    return { time: 0, rate: 1 };
  }
}
export function activeSegment(segments: SpeechSegment[], time: number) {
  return segments.findIndex(
    (segment, index) =>
      time >= segment.start &&
      (time < segment.end ||
        (segment.end === segment.start &&
          time < (segments[index + 1]?.start ?? segment.start + 1))),
  );
}
export function sentenceNavigation(segments: SpeechSegment[], time: number) {
  const active = activeSegment(segments, time);
  return {
    previous:
      active >= 0
        ? active - 1
        : segments.reduce(
            (previous, segment, index) =>
              segment.start < time ? index : previous,
            -1,
          ),
    next: segments.findIndex((segment) => segment.start > time + 0.05),
  };
}

/** Reading a result never writes playback preferences into a recording or export. */
export function loadPlayback(id: string): PlaybackView {
  try {
    return readPlayback(localStorage.getItem(playbackKey(id)));
  } catch {
    return readPlayback(null);
  }
}
