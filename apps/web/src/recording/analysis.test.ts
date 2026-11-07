import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  chat: vi.fn(),
  transcribe: vi.fn(),
  blob: vi.fn(),
  requireConnection: vi.fn(),
}));
vi.mock("@/ai/settings", async () => ({
  ...(await vi.importActual("@/ai/settings")),
  requireConnection: mocks.requireConnection,
}));
vi.mock("@/api/client", async () => ({
  ...(await vi.importActual("@/api/client")),
  api: mocks.api,
}));
vi.mock("@/api/backend", () => ({ blobForSource: mocks.blob }));
vi.mock("@/ai/provider", () => ({
  chat: mocks.chat,
  transcribeDetailed: mocks.transcribe,
  parseModelJSON: JSON.parse,
}));
import {
  analyzeRecording,
  readCheckpoint,
  readTranscript,
  readAnalysis,
  getAnalysisTask,
  recordingCapabilities,
  cancelAnalysis,
} from "./analysis";
import { ModelConnectionError } from "@/ai/errors";
import type { Recording } from "@/api/client";
import { setLanguage } from "@/i18n";
let saved: Recording;
const report = (summary: string) =>
  JSON.stringify({
    summary,
    notes: "完整内容记录",
    chapters: [
      { title: "章节", start_time: 0, end_time: 600, summary: "要点" },
    ],
    qa_pairs: [{ question: "原文中的问题？", answer: "原文回答。", time: 12 }],
  });
beforeEach(() => {
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  mocks.api.mockReset();
  mocks.chat.mockReset();
  mocks.transcribe.mockReset();
  mocks.blob.mockReset();
  mocks.requireConnection.mockReset();
  saved = {
    id: crypto.randomUUID(),
    name: "测试录屏",
    asset_id: "asset-local",
    duration: 660,
    size: 2000,
    transcript: null,
    analysis: null,
    created_at: "2026-10-24T00:00:00Z",
  };
  mocks.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.endsWith("/media"))
      return { duration: 660, has_audio: true, audio_chunk_seconds: 300 };
    if (options?.method === "PATCH") {
      saved = { ...saved, ...JSON.parse(options.body as string) };
      return structuredClone(saved);
    }
    throw new Error("Unexpected request: " + path);
  });
  mocks.blob.mockResolvedValue(new Blob(["audio"], { type: "audio/wav" }));
  mocks.chat.mockResolvedValue(report("整理结果"));
});
describe("recording analysis recovery", () => {
  it("keeps cancellation distinct from a stopped checkpoint and permits resuming", async () => {
    saved.transcript = JSON.stringify({
      version: 1,
      text: "已转写",
      segments: [],
      complete: true,
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (value: string) => void;
    mocks.chat.mockImplementationOnce(() => {
      started();
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    const running = analyzeRecording(saved);
    await ready;
    expect(getAnalysisTask(saved.id)).toMatchObject({
      phase: "analyzing",
      busy: true,
    });
    cancelAnalysis(saved.id);
    expect(getAnalysisTask(saved.id)).toMatchObject({
      phase: "cancelling",
      busy: true,
    });
    finish(report("已完成的片段"));
    await expect(running).rejects.toThrow();
    expect(getAnalysisTask(saved.id)).toMatchObject({
      phase: "cancelled",
      busy: false,
    });
    expect(readCheckpoint(saved.analysis)?.status).toBe("cancelled");
    await analyzeRecording(saved);
    expect(getAnalysisTask(saved.id)).toMatchObject({
      phase: "completed",
      busy: false,
    });
    expect(readAnalysis(saved.analysis)?.summary).toBe("已完成的片段");
  });
  it("only needs transcription for transcribing and only text for an existing transcript", () => {
    expect(recordingCapabilities(saved, { transcriptionOnly: true })).toEqual([
      "transcription",
    ]);
    saved.transcript = JSON.stringify({
      version: 1,
      text: "已有转写",
      segments: [],
      complete: true,
    });
    expect(recordingCapabilities(saved)).toEqual(["text"]);
    expect(recordingCapabilities(saved, { transcriptionOnly: true })).toEqual(
      [],
    );
    expect(recordingCapabilities(saved, { forceTranscription: true })).toEqual([
      "transcription",
      "text",
    ]);
  });
  it("does not process audio or replace an existing report when a required connection is missing", async () => {
    saved.analysis = report("已有报告");
    const before = structuredClone(saved);
    mocks.requireConnection.mockImplementation((capability) => {
      if (capability === "text")
        throw new ModelConnectionError(
          "text",
          "请配置文字生成",
          "configuration",
        );
    });
    await expect(analyzeRecording(saved)).rejects.toThrow("请配置文字生成");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(saved).toEqual(before);
    expect(getAnalysisTask(saved.id)).toMatchObject({
      busy: false,
      modelCapability: "text",
      error: "请配置文字生成",
    });
  });
  it("updates running progress on language changes while keeping a report in its starting language", async () => {
    saved.transcript = JSON.stringify({
      version: 1,
      text: "source ".repeat(2000),
      segments: [],
      complete: true,
    });
    const originalTranscript = saved.transcript;
    setLanguage("en");
    let calls = 0;
    mocks.chat.mockImplementation(async (messages) => {
      expect(messages[0].content).toMatch(/English/);
      if (calls++ === 0) {
        expect(getAnalysisTask(saved.id).progress).toContain(
          "Organizing content 1/2",
        );
        setLanguage("zh-CN");
        expect(getAnalysisTask(saved.id).progress).toContain(
          "正在整理内容 1/2",
        );
      }
      return calls < 3 ? report("English result") : "Combined result";
    });
    const result = await analyzeRecording(structuredClone(saved));
    expect(mocks.chat).toHaveBeenCalledTimes(3);
    expect(result.transcript).toBe(originalTranscript);
    expect(readAnalysis(result.analysis).summary).toBe("Combined result");
  });
  it("fills an imported recording's duration from local media inspection", async () => {
    saved.duration = 0;
    mocks.transcribe.mockResolvedValue({ text: "识别文字", segments: [] });
    const result = await analyzeRecording(structuredClone(saved), {
      transcriptionOnly: true,
    });
    expect(result.duration).toBe(660);
    expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("can transcribe without requesting text generation or replacing an existing report", async () => {
    saved.analysis = report("已有的内容记录");
    mocks.transcribe.mockResolvedValue({
      text: "识别文字",
      segments: [{ start: 0, end: 2, text: "识别文字" }],
    });
    const result = await analyzeRecording(structuredClone(saved), {
      transcriptionOnly: true,
    });
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(readTranscript(result.transcript).complete).toBe(true);
    expect(readAnalysis(result.analysis)?.summary).toBe("已有的内容记录");
    expect(mocks.transcribe).toHaveBeenCalledTimes(3);
  });
  it("resumes a stopped transcription without starting report generation", async () => {
    mocks.transcribe
      .mockResolvedValueOnce({ text: "第一段", segments: [] })
      .mockRejectedValueOnce(new DOMException("Stopped", "AbortError"));
    await expect(
      analyzeRecording(structuredClone(saved), { transcriptionOnly: true }),
    ).rejects.toThrow("Stopped");
    expect(readTranscript(saved.transcript).processedChunks).toBe(1);
    expect(saved.analysis).toBeNull();
    mocks.transcribe.mockResolvedValue({ text: "后续段落", segments: [] });
    const result = await analyzeRecording(structuredClone(saved), {
      transcriptionOnly: true,
    });
    expect(readTranscript(result.transcript).complete).toBe(true);
    expect(mocks.transcribe).toHaveBeenCalledTimes(4);
    expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("persists each audio chunk and resumes without paying for completed chunks again", async () => {
    mocks.transcribe
      .mockResolvedValueOnce({
        text: "第一段",
        segments: [{ start: 2, end: 4, text: "第一段", speaker: "发言人 1" }],
      })
      .mockRejectedValueOnce(new Error("识别暂时失败"));
    await expect(analyzeRecording(structuredClone(saved))).rejects.toThrow(
      "识别暂时失败",
    );
    const partial = readTranscript(saved.transcript);
    expect(partial.processedChunks).toBe(1);
    expect(partial.complete).toBe(false);
    expect(readCheckpoint(saved.analysis).status).toBe("failed");
    mocks.transcribe
      .mockResolvedValueOnce({
        text: "第二段",
        segments: [{ start: 1, end: 8, text: "第二段" }],
      })
      .mockResolvedValueOnce({
        text: "第三段",
        segments: [{ start: 3, end: 5, text: "第三段" }],
      });
    const result = await analyzeRecording(structuredClone(saved));
    const transcript = readTranscript(result.transcript);
    expect(mocks.transcribe).toHaveBeenCalledTimes(4);
    expect(transcript.complete).toBe(true);
    expect(transcript.segments.map((segment) => segment.start)).toEqual([
      2, 301, 603,
    ]);
    expect(transcript.text).toBe("第一段\n第二段\n第三段");
    expect(readAnalysis(result.analysis).summary).toBe("整理结果");
  });
  it("reuses completed analysis batches after an interruption", async () => {
    saved.transcript = JSON.stringify({
      version: 1,
      text: "x".repeat(27000),
      segments: [
        { start: 0, end: 300, text: "x".repeat(9000) },
        { start: 300, end: 600, text: "x".repeat(9000) },
        { start: 600, end: 660, text: "x".repeat(9000) },
      ],
      complete: true,
      sourceAssetId: saved.asset_id,
      processedChunks: 3,
      totalChunks: 3,
      chunkSeconds: 300,
    });
    mocks.chat
      .mockResolvedValueOnce(report("片段一"))
      .mockRejectedValueOnce(new Error("生成中断"));
    await expect(analyzeRecording(structuredClone(saved))).rejects.toThrow(
      "生成中断",
    );
    expect(readCheckpoint(saved.analysis).parts).toHaveLength(1);
    mocks.chat
      .mockResolvedValueOnce(report("片段二"))
      .mockResolvedValueOnce(report("片段三"))
      .mockResolvedValueOnce("整段概述");
    const result = await analyzeRecording(structuredClone(saved));
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.chat).toHaveBeenCalledTimes(5);
    expect(readAnalysis(result.analysis).summary).toBe("整段概述");
    expect(readAnalysis(result.analysis).chapters).toHaveLength(3);
  });
  it("keeps an existing report visible while a rerun fails", async () => {
    saved.transcript = JSON.stringify({
      version: 1,
      text: "短转写",
      segments: [],
    });
    saved.analysis = report("已经完成的报告");
    mocks.chat.mockRejectedValueOnce(new Error("模型不可用"));
    await expect(analyzeRecording(structuredClone(saved))).rejects.toThrow(
      "模型不可用",
    );
    expect(getAnalysisTask(saved.id).error).toBe("模型不可用");
    expect(readAnalysis(saved.analysis).summary).toBe("已经完成的报告");
    expect(readCheckpoint(saved.analysis).error).toBe("模型不可用");
  });
});
