import { t } from "@/i18n";
import type { SpeechSegment } from "@/ai/provider";

export interface Transcript {
  version: 1;
  text: string;
  segments: SpeechSegment[];
  complete?: boolean;
  sourceAssetId?: string;
  processedChunks?: number;
  totalChunks?: number;
  chunkSeconds?: number;
}
export interface AnalysisReport {
  version: 1;
  summary: string;
  notes?: string;
  chapters: Array<{
    title: string;
    start_time: number;
    end_time: number;
    summary: string;
  }>;
  qa_pairs: Array<{ question: string; answer: string; time: number | null }>;
}
export interface AnalysisCheckpoint {
  version: 1;
  kind: "analysis-checkpoint";
  status: "running" | "failed" | "cancelled";
  phase: string;
  sourceAssetId: string;
  transcriptHash: string;
  parts: AnalysisReport[];
  previousReport: AnalysisReport | null;
  updatedAt: string;
  error?: string;
}
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (
    typeof value !== "string" ||
    !/^\d{1,4}:\d{2}(?::\d{2})?(?:\.\d{1,3})?$/.test(value)
  )
    return null;
  return value
    .split(":")
    .reduce((seconds, part) => seconds * 60 + Number(part), 0);
}
export function readTranscript(value: string | null): Transcript {
  const fallback: Transcript = { version: 1, text: value || "", segments: [] };
  try {
    const parsed = JSON.parse(value || "");
    const source = parsed.transcripts?.[0]?.sentences;
    const items = Array.isArray(parsed.segments)
      ? parsed.segments
      : Array.isArray(source)
        ? source.map((item) => ({
            start: Number(item.begin_time) / 1000,
            end: Number(item.end_time) / 1000,
            text: item.text,
            speaker:
              item.speaker_id == null
                ? undefined
                : t("recordings.report.speaker", {
                    arg0: Number(item.speaker_id) + 1,
                  }),
          }))
        : Array.isArray(parsed.transcription)
          ? parsed.transcription.map((item) => ({
              start: parseTimestamp(item.timestamp),
              end: parseTimestamp(item.timestamp),
              text: item.content,
              speaker: item.speaker,
            }))
          : [];
    if (typeof parsed.text !== "string" && !items.length) return fallback;
    const segments: SpeechSegment[] = items
      .filter(
        (item) =>
          item &&
          Number.isFinite(item.start) &&
          Number.isFinite(item.end) &&
          item.start >= 0 &&
          item.end >= item.start &&
          typeof item.text === "string" &&
          item.text.trim(),
      )
      .map((item) => ({
        start: item.start,
        end: item.end,
        text: item.text,
        ...(typeof item.speaker === "string" ? { speaker: item.speaker } : {}),
      }))
      .sort((a, b) => a.start - b.start);
    return {
      version: 1,
      text:
        typeof parsed.text === "string"
          ? parsed.text
          : segments.map((segment) => segment.text).join("\n"),
      segments,
      ...(typeof parsed.complete === "boolean"
        ? { complete: parsed.complete }
        : {}),
      ...(typeof parsed.sourceAssetId === "string"
        ? { sourceAssetId: parsed.sourceAssetId }
        : {}),
      ...(Number.isInteger(parsed.processedChunks) &&
      parsed.processedChunks >= 0
        ? { processedChunks: parsed.processedChunks }
        : {}),
      ...(Number.isInteger(parsed.totalChunks) && parsed.totalChunks > 0
        ? { totalChunks: parsed.totalChunks }
        : {}),
      ...(Number.isFinite(parsed.chunkSeconds) && parsed.chunkSeconds > 0
        ? { chunkSeconds: parsed.chunkSeconds }
        : {}),
    };
  } catch {
    return fallback;
  }
}
export function normalizeReport(value: any): AnalysisReport | null {
  if (!value || typeof value !== "object") return null;
  const chapters = value.chapters || value.overview?.chapters;
  const qa = value.qa_pairs || value.qa_review?.qa_pairs;
  const summary = value.summary || value.overview?.title;
  if (
    typeof summary !== "string" ||
    !Array.isArray(chapters) ||
    !Array.isArray(qa)
  )
    return null;
  return {
    version: 1,
    summary,
    ...(typeof value.notes === "string" ? { notes: value.notes } : {}),
    chapters: chapters
      .filter(
        (item) =>
          item &&
          typeof item.title === "string" &&
          typeof item.summary === "string",
      )
      .map((item) => ({
        ...item,
        start_time: parseTimestamp(item.start_time) ?? 0,
        end_time: parseTimestamp(item.end_time) ?? 0,
      }))
      .filter((item) => item.end_time >= item.start_time)
      .sort((a, b) => a.start_time - b.start_time),
    qa_pairs: qa
      .filter(
        (item) =>
          item &&
          typeof item.question === "string" &&
          typeof item.answer === "string",
      )
      .map((item) => ({
        question: item.question,
        answer: item.answer,
        time: parseTimestamp(item.time),
      })),
  };
}
export function readCheckpoint(
  value: string | null,
): AnalysisCheckpoint | null {
  try {
    const parsed = JSON.parse(value || "");
    return parsed?.kind === "analysis-checkpoint" &&
      ["running", "failed", "cancelled"].includes(parsed.status) &&
      Array.isArray(parsed.parts) &&
      typeof parsed.sourceAssetId === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}
export function readAnalysis(value: string | null): AnalysisReport | null {
  try {
    const parsed = JSON.parse(value || "");
    return normalizeReport(
      parsed?.kind === "analysis-checkpoint" ? parsed.previousReport : parsed,
    );
  } catch {
    return null;
  }
}
export function formatTimestamp(seconds: number, milliseconds = false) {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3600000);
  const mins = Math.floor(total / 60000) % 60;
  const secs = Math.floor(total / 1000) % 60;
  const pad = (n: number, length = 2) => String(n).padStart(length, "0");
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}${milliseconds ? "," + pad(total % 1000, 3) : ""}`;
}
export function transcriptExport(
  transcript: Transcript,
  format: "txt" | "srt" | "vtt",
) {
  if (format === "txt") return transcript.text;
  const segments = transcript.segments.filter(
    (segment) => segment.end > segment.start,
  );
  if (!segments.length)
    throw new Error(t("recordings.report.thisTranscriptHasNoTimestamps"));
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    segments
      .map(
        (segment, index) =>
          `${format === "srt" ? index + 1 + "\n" : ""}${formatTimestamp(segment.start, true).replace(",", format === "vtt" ? "." : ",")} --> ${formatTimestamp(segment.end, true).replace(",", format === "vtt" ? "." : ",")}\n${segment.speaker ? segment.speaker + "：" : ""}${segment.text}`,
      )
      .join("\n\n")
  );
}
export function analysisMarkdown(value: string | null) {
  const report = readAnalysis(value);
  if (!report) return readCheckpoint(value) ? "" : value || "";
  return t("recordings.report.overviewChaptersQA", {
    arg0: report.summary,
    arg1: report.notes ? t("recordings.report.notes") + report.notes : "",
    arg2: report.chapters
      .map(
        (chapter) =>
          `## ${chapter.title}\n\n${formatTimestamp(chapter.start_time)} – ${formatTimestamp(chapter.end_time)}\n\n${chapter.summary}`,
      )
      .join("\n\n"),
    arg3: report.qa_pairs
      .map((qa) =>
        t("recordings.report.q", {
          arg0: qa.question,
          arg1: qa.answer,
          arg2: qa.time === null ? "" : "\n\n" + formatTimestamp(qa.time),
        }),
      )
      .join("\n\n"),
  });
}
export function transcriptBatches(
  transcript: Transcript,
  limit = 12000,
): Transcript[] {
  const source = transcript.segments.length
    ? transcript.segments
    : [{ start: 0, end: 0, text: transcript.text }];
  const batches: Transcript[] = [];
  const parts: SpeechSegment[] = [];
  let length = 0;
  function flush() {
    if (parts.length) {
      batches.push({
        version: 1,
        text: parts.map((part) => part.text).join("\n"),
        segments: transcript.segments.length ? [...parts] : [],
      });
      parts.length = 0;
      length = 0;
    }
  }
  for (const segment of source)
    for (let offset = 0; offset < segment.text.length; offset += limit) {
      const text = segment.text.slice(offset, offset + limit);
      if (length + text.length > limit) flush();
      parts.push({ ...segment, text });
      length += text.length;
    }
  flush();
  return batches;
}
