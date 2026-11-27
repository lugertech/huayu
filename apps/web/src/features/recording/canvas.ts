import { LocalizedError } from "@/i18n/errors";
import { t } from "@/i18n";
import {
  createCanvasStore,
  Editor,
  createShapeId,
} from "@/features/canvas/editor";
import { getDefaultComponentProps } from "@/config/components";
import { connectShapes } from "@/features/canvas/connection-parser";
import type { Recording } from "@/api/client";
import { analysisMarkdown, readAnalysis, readTranscript } from "./report";

export interface RecordingExcerpt {
  title: string;
  text: string;
  start: number;
  end?: number;
}
export function excerptsForSelection(
  recording: Recording,
  indices: number[],
): RecordingExcerpt[] {
  const segments = readTranscript(recording.transcript).segments;
  return [...new Set(indices)]
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const segment = segments[index];
      return segment
        ? [
            {
              title: t("recordings.analysis.segment", { arg0: index + 1 }),
              text: segment.text,
              start: segment.start,
              end: segment.end,
            },
          ]
        : [];
    });
}
export function excerptForChapter(
  recording: Recording,
  chapter: {
    title: string;
    summary: string;
    start_time: number;
    end_time: number;
  },
): RecordingExcerpt {
  const segments = readTranscript(recording.transcript).segments.filter(
    (segment) =>
      segment.end > chapter.start_time && segment.start < chapter.end_time,
  );
  return {
    title: chapter.title,
    text: [chapter.summary, ...segments.map((segment) => segment.text)]
      .filter(Boolean)
      .join("\n\n"),
    start: chapter.start_time,
    end: chapter.end_time,
  };
}

/** Build an ordinary editable document, without running models or copying their browser configuration. */
export function recordingCanvas(
  recording: Recording,
  excerpt?: RecordingExcerpt | RecordingExcerpt[],
) {
  const store = createCanvasStore();
  const editor = new Editor(store);
  const transcript = readTranscript(recording.transcript);
  const analysis = readAnalysis(recording.analysis);
  const materials = excerpt
    ? Array.isArray(excerpt)
      ? excerpt
      : [excerpt]
    : [
        ...(analysis
          ? [
              {
                title: t("recordings.analysis.notes"),
                text: analysisMarkdown(recording.analysis),
                start: 0,
                end: recording.duration,
              },
            ]
          : []),
        ...(transcript.text
          ? [
              {
                title: t("recordings.canvas.originalTranscript"),
                text: transcript.text,
                start: 0,
                end: recording.duration,
              },
            ]
          : []),
      ];
  if (!materials.some((material) => material.text.trim()))
    throw new LocalizedError({ key: "recordings.canvas.transcriptRequired" });
  const ids: string[] = [];
  editor.run(() => {
    for (const [index, material] of materials.entries()) {
      const id = createShapeId();
      editor.createShape({
        id,
        type: "ai-text",
        x: index * 480,
        y: 0,
        props: {
          ...getDefaultComponentProps("ai-text"),
          w: 400,
          h: 360,
          name: material.title,
          text: material.text,
          recordingSource: {
            id: recording.id,
            name: recording.name,
            start: Math.max(0, material.start),
            end: material.end,
          },
        },
      });
      ids.push(id);
    }
    const task = createShapeId();
    editor.createShape({
      id: task,
      type: "instruction",
      x: materials.length * 480,
      y: 0,
      props: {
        ...getDefaultComponentProps("instruction"),
        h: 360,
        text: t("recordings.prompts.createFromMaterials"),
      },
    });
    ids.forEach((id) => connectShapes(editor, id, task));
  });
  return {
    name: `${recording.name}${excerpt ? ` · ${Array.isArray(excerpt) ? t("recordings.canvas.excerpts", { arg0: excerpt.length }) : excerpt.title}` : t("recordings.canvas.creation")}`.slice(
      0,
      120,
    ),
    document: store.getDocumentSnapshot(),
  };
}
