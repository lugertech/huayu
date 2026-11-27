import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  transcribe: vi.fn(),
  document: vi.fn(),
  resource: vi.fn(),
}));
vi.mock("@/ai/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ai/provider")>()),
  transcribe: mocks.transcribe,
}));
vi.mock("@/ai/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ai/settings")>()),
  requireConnection: vi.fn(() => ({})),
}));
vi.mock("@/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/resources")>()),
  blobForSource: mocks.resource,
}));
vi.mock("@/features/recording/audio", () => ({
  extractRecordingAudio: async (blob: Blob) => [{ blob }],
}));
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  uploadAsset: mocks.upload,
  api: mocks.document,
}));
import { errorText, LocalizedError } from "@/i18n/errors";
import { t } from "@/i18n";
import { uploadComponentFile } from "./uploads";
import { applyComponentUpload } from "./results";
import { Editor } from "@/features/canvas/engine/editor";
import { createCanvasStore } from "@/features/canvas/engine/store";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.upload.mockResolvedValue({
    url: "/api/assets/uploaded",
  });
  mocks.resource.mockResolvedValue(new Blob(["audio"]));
  mocks.transcribe.mockResolvedValue("录音正文");
  mocks.document.mockResolvedValue({
    asset: { url: "/api/assets/document" },
    text: "文件正文",
  });
});

describe("canvas component uploads", () => {
  it("keeps the old attachment if the node becomes locked before processing finishes", async () => {
    const editor = new Editor(createCanvasStore());
    editor.createShape({
      id: "shape:upload",
      type: "speech",
      props: { src: "old", result: "old transcript" },
    });
    const result = await uploadComponentFile(
      "speech",
      new File(["audio"], "meeting.mp3", { type: "audio/mpeg" }),
    );
    editor.updateShape({ id: "shape:upload", props: { isLocked: true } });
    expect(() =>
      applyComponentUpload(editor, "shape:upload", result),
    ).toThrow();
    expect(editor.getShape("shape:upload").props).toMatchObject({
      src: "old",
      result: "old transcript",
    });
    editor.deleteShape("shape:upload");
    expect(() =>
      applyComponentUpload(editor, "shape:upload", result),
    ).toThrow();
  });
  it("transcribes uploaded audio before returning the node's new source and text", async () => {
    const file = new File(["audio"], "meeting.mp3", { type: "audio/mpeg" });
    expect(await uploadComponentFile("speech", file)).toMatchObject({
      src: "/api/assets/uploaded",
      result: "录音正文",
      text: "",
      name: t("api.transcription"),
      description: file.name,
      isUploaded: true,
    });
    expect(mocks.upload).toHaveBeenCalledWith(file);
    expect(mocks.resource.mock.calls[0][0]).toBe("/api/assets/uploaded");
    expect(mocks.transcribe).toHaveBeenCalledOnce();
  });
  it("rejects failed transcription instead of returning a replacement with no transcript", async () => {
    mocks.transcribe.mockRejectedValue(new Error("识别失败"));
    await expect(
      uploadComponentFile(
        "speech",
        new File(["audio"], "meeting.mp3", { type: "audio/mpeg" }),
      ),
    ).rejects.toThrow("识别失败");
  });
  it("returns the parsed document body along with its downloadable file metadata", async () => {
    const file = new File(["source"], "report.txt", { type: "text/plain" });
    expect(await uploadComponentFile("file", file)).toMatchObject({
      src: "/api/assets/document",
      text: "文件正文",
      result: "文件正文",
      fileName: "report.txt",
      fileExtension: "txt",
      fileSize: file.size,
      description: "文档内容",
      isUploaded: true,
    });
    const [path, request] = mocks.document.mock.calls[0];
    expect(path).toBe("/api/documents/parse");
    expect(request.method).toBe("POST");
    expect(request.body.get("file")).toBe(file);
  });
  it("makes an uploaded image available as an image source and a text caption", async () => {
    const file = new File(["image"], "reference.png", { type: "image/png" });
    expect(await uploadComponentFile("ai-image", file)).toMatchObject({
      src: "/api/assets/uploaded",
      result: "reference.png",
      name: "reference.png",
      isUploaded: true,
    });
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
  it("rejects oversized attachments before sending a request and retains their localized error", async () => {
    const file = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      "oversized.txt",
    );
    const error: unknown = await uploadComponentFile("file", file).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(LocalizedError);
    expect(errorText(error, "en")).toBe("File exceeds the size limit");
    expect(errorText(error, "zh-CN")).toBe("文件大小超过限制");
    expect(mocks.document).not.toHaveBeenCalled();
  });
  it("rejects a non-image file before uploading it as an image", async () => {
    await expect(
      uploadComponentFile(
        "ai-image",
        new File(["text"], "note.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("图片");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
