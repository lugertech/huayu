import { describe, expect, it } from "vite-plus/test";
import { getTranslator, setLanguage } from "./index";
import {
  LocalizedError,
  errorText,
  knownErrorTranslation,
  readErrorTranslation,
  translatedErrorMessage,
} from "./errors";

describe("localized application errors", () => {
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
