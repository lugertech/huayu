import { describe, expect, it } from "vite-plus/test";
import {
  analysisMarkdown,
  normalizeReport,
  readAnalysis,
  readTranscript,
  transcriptBatches,
  transcriptExport,
} from "./report";
describe("recording report compatibility", () => {
  it("keeps checkpoints and valid speaker timestamps while filtering malformed segments", () => {
    const transcript = readTranscript(
      JSON.stringify({
        version: 1,
        text: "内容",
        complete: true,
        processedChunks: 2,
        chunkSeconds: 300,
        segments: [
          { start: 3, end: 4, text: "保留", speaker: "发言人 2" },
          { start: -3, end: 1, text: "忽略" },
          { start: 1, end: 2, text: "前一句" },
        ],
      }),
    );
    expect(transcript.complete).toBe(true);
    expect(transcript.processedChunks).toBe(2);
    expect(transcript.segments.map((segment) => segment.start)).toEqual([1, 3]);
    expect(transcript.segments[1].speaker).toBe("发言人 2");
  });
  it("reads the original backend's formatted analysis and transcription", () => {
    const report = normalizeReport({
      overview: {
        title: "内容概要",
        chapters: [
          { title: "章节", start_time: 4, end_time: 30, summary: "要点" },
        ],
      },
      qa_review: {
        qa_pairs: [
          { question: "为什么？", answer: "因为。", time: "00:04:14" },
        ],
      },
    });
    expect(report.qa_pairs[0].time).toBe(254);
    const transcript = readTranscript(
      JSON.stringify({
        transcripts: [
          {
            sentences: [
              {
                begin_time: 1200,
                end_time: 3200,
                text: "原始转写",
                speaker_id: 0,
              },
            ],
          },
        ],
      }),
    );
    expect(transcript.segments[0]).toEqual({
      start: 1.2,
      end: 3.2,
      text: "原始转写",
      speaker: "发言人 1",
    });
  });
  it("partitions long transcripts without losing text or original timestamps", () => {
    const source = {
      version: 1 as const,
      text: "x".repeat(33000),
      segments: [{ start: 20, end: 55, text: "x".repeat(33000) }],
    };
    const batches = transcriptBatches(source, 12000);
    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.text).join("")).toBe(source.text);
    expect(
      batches.every(
        (batch) => batch.text.length <= 12000 && batch.segments[0].start === 20,
      ),
    ).toBe(true);
  });
  it("exports accurate SRT/VTT and hides checkpoint internals from reports", () => {
    const transcript = {
      version: 1 as const,
      text: "你好",
      segments: [
        { start: 3661.25, end: 3662.5, text: "你好", speaker: "发言人 1" },
      ],
    };
    expect(transcriptExport(transcript, "srt")).toContain(
      "01:01:01,250 --> 01:01:02,500",
    );
    expect(transcriptExport(transcript, "vtt")).toContain(
      "WEBVTT\n\n01:01:01.250",
    );
    const checkpoint = JSON.stringify({
      kind: "analysis-checkpoint",
      status: "failed",
      parts: [],
      sourceAssetId: "asset",
      previousReport: null,
    });
    expect(analysisMarkdown(checkpoint)).toBe("");
    expect(readAnalysis(checkpoint)).toBeNull();
  });
});
