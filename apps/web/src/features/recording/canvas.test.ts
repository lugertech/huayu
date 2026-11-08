import { describe, expect, it } from "vite-plus/test";
import {
  recordingCanvas,
  excerptForChapter,
  excerptsForSelection,
} from "./canvas";
import type { Recording } from "@/api/client";
const recording: Recording = {
  id: "recording-1",
  name: "设计讨论",
  asset_id: "asset-1",
  duration: 90,
  size: 1000,
  created_at: "2026-10-24",
  analysis: null,
  transcript: JSON.stringify({
    text: "开场。重要的片段。结束。",
    segments: [
      { start: 0, end: 10, text: "开场。" },
      { start: 10, end: 30, text: "重要的片段。" },
      { start: 30, end: 90, text: "结束。" },
    ],
  }),
};
describe("recording to canvas", () => {
  it("creates separate materials for selected sentences and preserves each source time", () => {
    const excerpts = excerptsForSelection(recording, [2, 0, 2, 99]);
    const { document } = recordingCanvas(recording, excerpts);
    const materials = Object.values(document.store).filter(
      (item: any) => item.type === "ai-text",
    ) as any[];
    expect(materials.map((item) => item.props.text)).toEqual([
      "开场。",
      "结束。",
    ]);
    expect(materials.map((item) => item.props.recordingSource.start)).toEqual([
      0, 30,
    ]);
    expect(JSON.stringify(document)).not.toContain("重要的片段。");
    expect(() => recordingCanvas(recording, [])).toThrow("先分析录屏");
  });
  it("keeps a chapter grounded in its time range and creates editable material with a source link", () => {
    const excerpt = excerptForChapter(recording, {
      title: "核心观点",
      summary: "章节摘要",
      start_time: 10,
      end_time: 30,
    });
    expect(excerpt.text).toBe("章节摘要\n\n重要的片段。");
    const { document } = recordingCanvas(recording, excerpt);
    const shapes = Object.values(document.store).filter(
      (item: any) => item.typeName === "shape",
    ) as any[];
    const material = shapes.find((shape) => shape.type === "ai-text");
    expect(material.props).toMatchObject({
      text: excerpt.text,
      recordingSource: { id: recording.id, start: 10, end: 30 },
    });
    expect(shapes.filter((shape) => shape.type === "instruction")).toHaveLength(
      1,
    );
    expect(
      Object.values(document.store).filter(
        (item: any) => item.typeName === "binding",
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(document)).not.toMatch(/apiKey|baseUrl|connections/);
    expect(material.props.result).toBeUndefined();
  });
  it("uses the whole transcription without altering the original recording", () => {
    const before = structuredClone(recording);
    const { name, document } = recordingCanvas(recording);
    expect(name).toBe("设计讨论 · 创作");
    expect(
      Object.values(document.store).some(
        (item: any) => item.props?.text === "开场。重要的片段。结束。",
      ),
    ).toBe(true);
    expect(recording).toEqual(before);
  });
  it("rejects empty recordings and does not substitute unrelated transcript text for a chapter", () => {
    expect(() => recordingCanvas({ ...recording, transcript: null })).toThrow(
      "先分析录屏",
    );
    const excerpt = excerptForChapter(
      { ...recording, transcript: "不含时间的整段文字" },
      { title: "一章", summary: "这一章的摘要", start_time: 10, end_time: 20 },
    );
    expect(excerpt.text).toBe("这一章的摘要");
  });
});
