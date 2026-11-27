import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  recognize: vi.fn(),
  document: vi.fn(),
}));
vi.mock("@/api/backend", () => ({
  audioRecognizeAPI: mocks.recognize,
  documentUploadAPI: mocks.document,
}));
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  uploadAsset: mocks.upload,
}));
import { applyComponentUpload, uploadComponentFile } from "./uploads";
import { Editor, createCanvasStore } from "@/features/canvas/editor";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.upload.mockResolvedValue({
    url: "/api/assets/uploaded",
  });
  mocks.recognize.mockResolvedValue({
    text: "录音正文",
    name: "会议",
    description: "会议摘要",
  });
  mocks.document.mockResolvedValue({
    src: "/api/assets/document",
    text: "文件正文",
    name: "report.txt",
    description: "文档内容",
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
      name: "会议",
      description: "会议摘要",
      isUploaded: true,
    });
    expect(mocks.upload).toHaveBeenCalledWith(file);
    expect(mocks.recognize).toHaveBeenCalledWith("/api/assets/uploaded");
  });
  it("rejects failed transcription instead of returning a replacement with no transcript", async () => {
    mocks.recognize.mockRejectedValue(new Error("识别失败"));
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
    expect(mocks.document).toHaveBeenCalledWith(file);
  });
  it("makes an uploaded image available as an image source and a text caption", async () => {
    const file = new File(["image"], "reference.png", { type: "image/png" });
    expect(await uploadComponentFile("ai-image", file)).toMatchObject({
      src: "/api/assets/uploaded",
      result: "reference.png",
      name: "reference.png",
      isUploaded: true,
    });
    expect(mocks.recognize).not.toHaveBeenCalled();
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
