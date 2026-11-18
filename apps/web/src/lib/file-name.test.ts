import { expect, it } from "vite-plus/test";
import { limitName, mediaFileName } from "./file-name";

it("truncates imported names at the same Unicode boundary as the API", () => {
  const name = "A".repeat(119) + "😀";
  expect(limitName(name + ".wav")).toBe(name);
});
it.each([
  ["leaf.JPG", "image/jpeg", "leaf.JPG"],
  ["leaf.JPEG", "image/jpeg", "leaf.JPEG"],
  ["leaf", "image/jpeg", "leaf.jpg"],
  ["talk.wav", "audio/wav", "talk.wav"],
  ["Interview 1.2", "audio/wav", "Interview 1.2.wav"],
  ["Interview.final", "audio/wav", "Interview.final.wav"],
  ["talk.mp4", "audio/mp4", "talk.mp4"],
  ["original.mkv", "application/octet-stream", "original.mkv"],
  ["talk", "audio/webm;codecs=opus", "talk.webm"],
])(
  "preserves or supplies the download extension for %s",
  (name, mime, expected) => {
    expect(mediaFileName(name, mime)).toBe(expected);
  },
);
