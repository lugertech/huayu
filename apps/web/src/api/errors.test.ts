import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { apiErrorTranslations, readApiError } from "./errors";
import { translatedErrorMessage } from "@/i18n/errors";

describe("local API error contract", () => {
  it("covers every error code exposed by the Rust API in both interface languages", () => {
    const source = readFileSync(
      new URL(
        "../../../api-rust/crates/huayu-server/src/error.rs",
        import.meta.url,
      ),
      "utf8",
    );
    const variants = source.match(/pub enum ErrorCode \{([\s\S]*?)\n\}/)![1];
    const codes = variants
      .split(",")
      .map((variant) => variant.trim())
      .filter(Boolean)
      .map((variant) =>
        variant.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase(),
      );
    expect(Object.keys(apiErrorTranslations).sort()).toEqual(codes.sort());
    for (const definition of Object.values(apiErrorTranslations)) {
      const english = translatedErrorMessage(definition, "en");
      const chinese = translatedErrorMessage(definition, "zh-CN");
      expect(english).not.toMatch(/\p{Script=Han}|\{\w+\}/u);
      expect(chinese).toMatch(/\p{Script=Han}/u);
      expect(chinese).not.toMatch(/\{\w+\}/u);
    }
  });

  it("validates unknown error parameters and retains usable defaults", () => {
    const error = readApiError({
      code: "INVALID_NAME",
      params: { min: { value: 5 }, max: 80, ignored: [] },
    });
    expect(error).toEqual({
      code: "INVALID_NAME",
      message: { key: "api.errors.invalidName", values: { min: 1, max: 80 } },
    });
    expect(
      readApiError({ code: "toString", message: "External detail" }),
    ).toEqual({ code: "toString", message: "External detail" });
    expect(readApiError(null)).toEqual({
      code: "REQUEST_FAILED",
      message: { key: "common.operationFailedRetry" },
    });
  });

  it("translates all recording cover errors without matching server text", () => {
    for (const code of [
      "COVER_DECODER_UNAVAILABLE",
      "COVER_TIMEOUT",
      "RECORDING_COVER_UNAVAILABLE",
    ]) {
      const error = readApiError({ code, message: "Changed wording" });
      expect(typeof error.message).toBe("object");
      if (typeof error.message !== "string") {
        expect(translatedErrorMessage(error.message, "en")).not.toMatch(
          /\p{Script=Han}/u,
        );
        expect(translatedErrorMessage(error.message, "zh-CN")).toMatch(/录屏/u);
      }
    }
  });
});
