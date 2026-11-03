import { t, useLocale, getLocale, type MessageKey, type Values } from "@/i18n";
import { useSyncExternalStore } from "react";
import { requireConnection, type Capability } from "@/ai/settings";
import { ModelConnectionError } from "@/ai/errors";
import { api, APIError, type Recording } from "@/api/client";
import { blobForSource } from "@/api/backend";
import {
  chat,
  parseModelJSON,
  transcribeDetailed,
  type SpeechSegment,
} from "@/ai/provider";
import { extractRecordingAudio, type AudioChunk } from "./audio";
import {
  readAnalysis,
  readCheckpoint,
  readTranscript,
  normalizeReport,
  transcriptBatches,
  type AnalysisCheckpoint,
  type AnalysisReport,
  type Transcript,
} from "./report";
export * from "./report";

interface AnalysisTask {
  busy: boolean;
  progress: string;
  progressKey?: MessageKey;
  progressValues?: Values;
  error: string;
  modelCapability?: Capability;
  recording?: Recording;
  completed?: number;
  total?: number;
}
const idle: AnalysisTask = { busy: false, progress: "", error: "" };
const tasks = new Map<string, AnalysisTask>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
function updateTask(id: string, value: AnalysisTask) {
  tasks.set(id, value);
  listeners.forEach((listener) => listener());
}
function taskFor(id?: string) {
  return id ? tasks.get(id) || idle : idle;
}
export function getAnalysisTask(id?: string) {
  const task = taskFor(id);
  return task.progressKey
    ? { ...task, progress: t(task.progressKey, task.progressValues) }
    : task;
}
export function useAnalysisTask(id?: string) {
  useLocale();
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => taskFor(id),
  );
  return getAnalysisTask(id);
}
export function cancelAnalysis(id: string) {
  controllers.get(id)?.abort();
}

interface AudioSource {
  count: number;
  chunkSeconds: number;
  duration: number;
  get: (index: number) => Promise<AudioChunk>;
}
async function audioSource(
  recording: Recording,
  signal: AbortSignal,
): Promise<AudioSource> {
  try {
    const info = await api<{
      duration: number;
      has_audio: boolean;
      audio_chunk_seconds: number;
    }>(`/api/recordings/${recording.id}/media`, { signal });
    if (!info.has_audio)
      throw new Error(t("recordings.analysis.thisRecordingHasNoAudio"));
    if (info.duration > 0 && Number.isFinite(info.duration)) {
      const chunkSeconds = info.audio_chunk_seconds || 300;
      const count = Math.ceil(info.duration / chunkSeconds);
      return {
        count,
        chunkSeconds,
        duration: info.duration,
        get: async (index) => ({
          blob: await blobForSource(
            `/api/recordings/${recording.id}/audio?start=${index * chunkSeconds}&duration=${chunkSeconds}`,
            signal,
          ),
          start: index * chunkSeconds,
          duration: Math.min(
            chunkSeconds,
            info.duration - index * chunkSeconds,
          ),
        }),
      };
    }
  } catch (error) {
    if (
      !(
        error instanceof APIError &&
        (error.status === 404 || error.code === "AUDIO_DECODER_UNAVAILABLE")
      )
    )
      throw error;
  }
  const chunks = await extractRecordingAudio(
    await blobForSource(`/api/assets/${recording.asset_id}`, signal),
    signal,
  );
  return {
    count: chunks.length,
    chunkSeconds: 300,
    duration: chunks.reduce(
      (end, chunk) => Math.max(end, chunk.start + chunk.duration),
      0,
    ),
    get: async (index) => chunks[index],
  };
}

function textHash(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return String(hash >>> 0);
}
function groundedReport(
  report: AnalysisReport,
  transcript: Transcript,
): AnalysisReport {
  const segments = transcript.segments;
  if (!segments.length)
    return {
      ...report,
      chapters: report.chapters.map((chapter) => ({
        ...chapter,
        start_time: 0,
        end_time: 0,
      })),
      qa_pairs: report.qa_pairs.map((qa) => ({ ...qa, time: null })),
    };
  const start = Math.min(...segments.map((segment) => segment.start));
  const end = Math.max(...segments.map((segment) => segment.end));
  const nearest = (value: number) =>
    segments.reduce(
      (best, segment) =>
        Math.abs(segment.start - value) < Math.abs(best - value)
          ? segment.start
          : best,
      segments[0].start,
    );
  return {
    ...report,
    chapters: report.chapters
      .map((chapter) => ({
        ...chapter,
        start_time: Math.max(start, Math.min(end, chapter.start_time)),
        end_time: Math.max(start, Math.min(end, chapter.end_time)),
      }))
      .filter((chapter) => chapter.end_time >= chapter.start_time),
    qa_pairs: report.qa_pairs.map((qa) => ({
      ...qa,
      time:
        qa.time === null
          ? null
          : nearest(Math.max(start, Math.min(end, qa.time))),
    })),
  };
}

/** The browser owns model requests. Local checkpoints survive cancellation, failures and reloads. */
export function recordingCapabilities(
  recording: Recording,
  options: { forceTranscription?: boolean; transcriptionOnly?: boolean } = {},
): Capability[] {
  const transcript = readTranscript(recording.transcript);
  const capabilities: Capability[] = [];
  if (
    options.forceTranscription ||
    !transcript.text.trim() ||
    transcript.complete === false ||
    (transcript.sourceAssetId &&
      transcript.sourceAssetId !== recording.asset_id)
  )
    capabilities.push("transcription");
  if (!options.transcriptionOnly) capabilities.push("text");
  return capabilities;
}

export async function analyzeRecording(
  initial: Recording,
  options: { forceTranscription?: boolean; transcriptionOnly?: boolean } = {},
): Promise<Recording> {
  const outputLocale = getLocale();
  const prompt = (key: MessageKey) => t(key, undefined, outputLocale);
  if (controllers.has(initial.id))
    throw new Error(
      t("recordings.analysis.thisRecordingIsAlreadyBeingAnalyzed"),
    );
  try {
    for (const capability of recordingCapabilities(initial, options))
      requireConnection(capability);
  } catch (error) {
    if (error instanceof ModelConnectionError)
      updateTask(initial.id, {
        busy: false,
        progress: "",
        error: error.message,
        modelCapability: error.capability,
        recording: initial,
      });
    throw error;
  }
  const controller = new AbortController();
  const signal = controller.signal;
  controllers.set(initial.id, controller);
  let recording = initial;
  const previous = readCheckpoint(initial.analysis);
  let checkpoint: AnalysisCheckpoint = {
    version: 1,
    kind: "analysis-checkpoint",
    status: "running",
    phase: t("recordings.analysis.preparingAnalysis"),
    sourceAssetId: initial.asset_id,
    transcriptHash: previous?.transcriptHash || "",
    parts:
      !options.forceTranscription &&
      previous?.sourceAssetId === initial.asset_id
        ? previous.parts
        : [],
    previousReport: readAnalysis(initial.analysis),
    updatedAt: new Date().toISOString(),
  };
  function progress(
    message: { key: MessageKey; values?: Values },
    completed?: number,
    total?: number,
  ) {
    const phase = t(message.key, message.values);
    checkpoint.phase = phase;
    updateTask(initial.id, {
      busy: true,
      progress: phase,
      progressKey: message.key,
      progressValues: message.values,
      error: "",
      recording,
      completed,
      total,
    });
  }
  async function saveCheckpoint() {
    checkpoint.updatedAt = new Date().toISOString();
    if (!options.transcriptionOnly)
      recording = await api<Recording>(`/api/recordings/${recording.id}`, {
        method: "PATCH",
        body: JSON.stringify({ analysis: JSON.stringify(checkpoint) }),
      });
    window.dispatchEvent(new Event("huayu:recordings-changed"));
  }
  try {
    let transcript = options.forceTranscription
      ? { version: 1 as const, text: "", segments: [] }
      : readTranscript(recording.transcript);
    if (
      transcript.sourceAssetId &&
      transcript.sourceAssetId !== recording.asset_id
    )
      transcript = { version: 1, text: "", segments: [] };
    progress(
      transcript.text && transcript.complete !== false
        ? { key: "recordings.analysis.preparingContent" }
        : { key: "recordings.analysis.preparingAudio" },
    );
    await saveCheckpoint();
    if (!transcript.text.trim() || transcript.complete === false) {
      const source = await audioSource(recording, signal);
      if (!recording.duration && source.duration > 0) {
        recording = await api<Recording>(`/api/recordings/${recording.id}`, {
          method: "PATCH",
          body: JSON.stringify({ duration: Math.round(source.duration) }),
        });
      }
      const completed =
        transcript.complete === false &&
        transcript.chunkSeconds === source.chunkSeconds
          ? Math.min(transcript.processedChunks || 0, source.count)
          : 0;
      if (!completed) transcript = { version: 1, text: "", segments: [] };
      const segments: SpeechSegment[] = [...transcript.segments];
      const texts = transcript.text ? [transcript.text] : [];
      for (let index = completed; index < source.count; index++) {
        signal.throwIfAborted();
        progress(
          {
            key: "recordings.analysis.transcribingAudio",
            values: {
              arg0: index + 1,
              arg1: source.count,
            },
          },
          index,
          source.count,
        );
        const chunk = await source.get(index);
        const result = await transcribeDetailed(
          chunk.blob,
          "recording.wav",
          signal,
        );
        if (result.text.trim()) texts.push(result.text.trim());
        const timed = result.segments.length
          ? result.segments
          : [{ start: 0, end: chunk.duration, text: result.text }];
        segments.push(
          ...timed
            .filter((segment) => segment.text.trim())
            .map((segment) => ({
              ...segment,
              start:
                chunk.start +
                Math.max(0, Math.min(chunk.duration, segment.start)),
              end:
                chunk.start +
                Math.max(
                  0,
                  Math.min(
                    chunk.duration,
                    Math.max(segment.start, segment.end),
                  ),
                ),
            })),
        );
        transcript = {
          version: 1,
          text: texts.join("\n"),
          segments: [...segments].sort((a, b) => a.start - b.start),
          complete: index === source.count - 1,
          sourceAssetId: recording.asset_id,
          processedChunks: index + 1,
          totalChunks: source.count,
          chunkSeconds: source.chunkSeconds,
        };
        signal.throwIfAborted();
        recording = await api<Recording>(`/api/recordings/${recording.id}`, {
          method: "PATCH",
          body: JSON.stringify({ transcript: JSON.stringify(transcript) }),
        });
        await saveCheckpoint();
      }
      if (!transcript.text.trim())
        throw new Error(t("recordings.analysis.noSpeechWasRecognized"));
    }
    if (options.transcriptionOnly) {
      updateTask(recording.id, {
        busy: false,
        progress: "",
        error: "",
        recording,
      });
      window.dispatchEvent(new Event("huayu:recordings-changed"));
      return recording;
    }
    const hash = textHash(JSON.stringify(transcript));
    if (checkpoint.transcriptHash !== hash) checkpoint.parts = [];
    checkpoint.transcriptHash = hash;
    const batches = transcriptBatches(transcript);
    for (let index = checkpoint.parts.length; index < batches.length; index++) {
      signal.throwIfAborted();
      progress(
        batches.length > 1
          ? {
              key: "recordings.analysis.organizingContent",
              values: {
                arg0: index + 1,
                arg1: batches.length,
              },
            }
          : { key: "recordings.analysis.organizingNotesChaptersAndQA" },
        index,
        batches.length,
      );
      const raw = parseModelJSON(
        await chat(
          [
            {
              role: "system",
              content: prompt("recordings.prompts.analyzeTranscript"),
            },
            { role: "user", content: JSON.stringify(batches[index]) },
          ],
          { signal },
        ),
      );
      const report = normalizeReport(raw);
      if (!report)
        throw new Error(
          t("recordings.analysis.theModelReturnedAnInvalidAnalysisFormat"),
        );
      checkpoint.parts.push(groundedReport(report, batches[index]));
      await saveCheckpoint();
    }
    const parts = checkpoint.parts;
    let summary = parts[0]?.summary || "";
    if (parts.length > 1) {
      progress({ key: "recordings.analysis.summarizingTheFullRecording" });
      summary = await chat(
        [
          {
            role: "system",
            content: prompt("recordings.prompts.combineSummaries"),
          },
          {
            role: "user",
            content: parts.map((part) => part.summary).join("\n\n"),
          },
        ],
        { signal },
      );
    }
    const seen = new Set<string>();
    const report: AnalysisReport = {
      version: 1,
      summary,
      notes: parts
        .map((part) => part.notes || "")
        .filter(Boolean)
        .join("\n\n"),
      chapters: parts
        .flatMap((part) => part.chapters)
        .sort((a, b) => a.start_time - b.start_time),
      qa_pairs: parts
        .flatMap((part) => part.qa_pairs)
        .filter((qa) => {
          const key = qa.question + "\n" + qa.answer;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    };
    signal.throwIfAborted();
    recording = await api<Recording>(`/api/recordings/${recording.id}`, {
      method: "PATCH",
      body: JSON.stringify({ analysis: JSON.stringify(report) }),
    });
    updateTask(recording.id, {
      busy: false,
      progress: "",
      error: "",
      recording,
    });
    window.dispatchEvent(new Event("huayu:recordings-changed"));
    return recording;
  } catch (error) {
    const cancelled = signal.aborted;
    checkpoint = {
      ...checkpoint,
      status: cancelled ? "cancelled" : "failed",
      error: cancelled
        ? t("recordings.analysis.processingStopped")
        : error instanceof Error
          ? error.message
          : t("recordings.analysis.analysisFailed"),
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveCheckpoint();
    } catch {
      /* Completed transcript chunks remain independently persisted. */
    }
    updateTask(initial.id, {
      busy: false,
      progress: "",
      error: checkpoint.error || t("recordings.analysis.analysisFailed"),
      modelCapability:
        error instanceof ModelConnectionError ? error.capability : undefined,
      recording,
    });
    throw error;
  } finally {
    controllers.delete(initial.id);
  }
}
