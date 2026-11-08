import { describe, expect, it } from "vite-plus/test";
import { getTranslator, setLanguage } from "./index";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleContext } from "./index";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { validateFile } from "@/api/mentex";
import { parseProjectFile } from "@/features/canvas/transfer";
import { Editor, createCanvasStore } from "@/features/canvas/editor";
import { linkWorkflow } from "@/workflow/connections";
import {
  LocalizedError,
  errorText,
  knownErrorTranslation,
  readErrorTranslation,
  translatedErrorMessage,
} from "./errors";

describe("localized application errors", () => {
  it("retains language references through file validation, project import, and connection failures", () => {
    const validation = validateFile(new File(["too large"], "file.txt"), {
      maxSize: 1,
    });
    expect(validation.valid).toBe(false);
    if (validation.valid === false)
      expect(errorText(validation.error, "en")).toBe(
        "File exceeds the size limit",
      );
    const editor = new Editor(createCanvasStore());
    editor.createShape({ id: "shape:task", type: "instruction" });
    for (const operation of [
      () => parseProjectFile({}),
      () => linkWorkflow(editor, "shape:task", "shape:task"),
    ]) {
      let failure: unknown;
      try {
        operation();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(LocalizedError);
      expect(errorText(failure, "en")).not.toMatch(/\p{Script=Han}/u);
      expect(errorText(failure, "zh-CN")).toMatch(/\p{Script=Han}/u);
    }
  });

  it("renders the page crash fallback using the active locale context", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { failed: true };
    const english = renderToStaticMarkup(
      createElement(LocaleContext.Provider, { value: "en" }, boundary.render()),
    );
    const chinese = renderToStaticMarkup(
      createElement(
        LocaleContext.Provider,
        { value: "zh-CN" },
        boundary.render(),
      ),
    );
    expect(english).not.toMatch(/\p{Script=Han}/u);
    expect(chinese).toContain("刷新");
  });
  it("renders an existing error in the current or explicit interface language", () => {
    const error = new LocalizedError({
      key: "workflow.writeInstructionsOrConnectMaterials",
    });
    expect(errorText(error)).toBe("请输入指令或连接素材");
    expect(errorText(error, "en")).toBe(
      "Write instructions or connect materials",
    );
    setLanguage("en");
    expect(errorText(error)).toBe("Write instructions or connect materials");
    expect(errorText(new Error("Provider detail: 保留原文"))).toBe(
      "Provider detail: 保留原文",
    );
  });

  it("retains translatable parameters through a persisted checkpoint", () => {
    const error = new LocalizedError({
      key: "models.connection.missingKey",
      values: { capability: { key: "models.textGeneration" } },
    });
    const restored = readErrorTranslation(
      JSON.parse(JSON.stringify(error.translation)),
    );
    expect(restored).toEqual(error.translation);
    const english = translatedErrorMessage(restored!, "en");
    expect(english).toContain("Text generation");
    expect(english).not.toMatch(/\p{Script=Han}/u);
    expect(
      readErrorTranslation({ key: "missing.internal.key" }),
    ).toBeUndefined();
    expect(
      readErrorTranslation({
        key: "models.connection.missingKey",
        values: { capability: [] },
      }),
    ).toBeUndefined();
  });

  it("recognizes legacy system messages without treating arbitrary details as keys", () => {
    const translation = knownErrorTranslation("处理已停止，进度已保留");
    expect(translatedErrorMessage(translation!, "en")).toBe(
      "Processing stopped. Progress saved.",
    );
    expect(knownErrorTranslation("Provider detail: 保留原文")).toBeUndefined();
  });

  it("binds an explicit language while an unbound translator follows the application", () => {
    const english = getTranslator("en");
    const current = getTranslator();
    expect(current("common.image")).toBe("图片");
    expect(english("common.image")).toBe("Image");
    setLanguage("en");
    expect(current("common.image")).toBe("Image");
    setLanguage("zh-CN");
    expect(english("projects.copy", { arg0: "作品" })).toBe("作品 copy");
  });
});
