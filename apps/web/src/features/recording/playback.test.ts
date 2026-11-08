import { describe, expect, it } from "vite-plus/test";
import {
  activeSegment,
  sentenceNavigation,
  readPlayback,
  playbackKey,
} from "./playback";

const segments = [
  { start: 2, end: 4, text: "开场" },
  { start: 8, end: 12, text: "重点" },
  { start: 15, end: 15, text: "旧格式时间点" },
];
describe("recording playback", () => {
  it("does not highlight a sentence before speech, during silence, or after the recording", () => {
    expect(
      [0, 2, 4, 8, 12, 15, 16].map((time) => activeSegment(segments, time)),
    ).toEqual([-1, 0, -1, 1, -1, 2, -1]);
  });
  it("finds previous and next sentences from silence and exact sentence boundaries", () => {
    expect(sentenceNavigation(segments, 0)).toEqual({ previous: -1, next: 0 });
    expect(sentenceNavigation(segments, 6)).toEqual({ previous: 0, next: 1 });
    expect(sentenceNavigation(segments, 8)).toEqual({ previous: 0, next: 2 });
    expect(sentenceNavigation(segments, 20)).toEqual({ previous: 2, next: -1 });
  });
  it("restores only valid browser playback values and isolates recordings", () => {
    expect(readPlayback('{"time":23.5,"rate":1.5,"apiKey":"ignored"}')).toEqual(
      { time: 23.5, rate: 1.5 },
    );
    expect(readPlayback('{"time":-1,"rate":9}')).toEqual({ time: 0, rate: 1 });
    expect(readPlayback("invalid")).toEqual({ time: 0, rate: 1 });
    expect(playbackKey("a")).not.toBe(playbackKey("b"));
  });
});
