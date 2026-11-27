import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import {
  resolveLocale,
  readLanguagePreference,
  translate,
  interpolate,
} from "./locale";
import { en, zhCN, messages } from "./messages";
import { assetMessages } from "@/features/asset-library/messages";
import {
  getLocale,
  t,
  setLanguage,
  getLanguagePreference,
  formatDate,
  formatNumber,
} from "./index";
import { localizeTemplate, templateTag } from "./templates";
import { modelPrompts } from "@/ai/prompts";
import { Editor, createCanvasStore } from "@/features/canvas/editor";
import { applyRecipe } from "@/features/canvas/recipes";
import { generationFingerprint } from "@/workflow/freshness";
import { analysisMarkdown } from "@/features/recording/report";

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage("zh-CN");
});

describe("language detection and persistence", () => {
  it("resolves the same semantic key after each language change", () => {
    setLanguage("zh-CN");
    expect(t("canvas.share.title")).toBe("分享画布");
    setLanguage("en");
    expect(t("canvas.share.title")).toBe("Share canvas");
    setLanguage("zh-CN");
    expect(t("canvas.share.title")).toBe("分享画布");
  });
  it("falls back to Chinese copy and never renders unknown internal keys", () => {
    const catalogs = { "zh-CN": { "dialog.title": "对话框" }, en: {} };
    expect(translate(catalogs, "en", "dialog.title")).toBe("对话框");
    expect(translate(catalogs, "en", "missing.internal.key")).toBe("");
    expect(translate(catalogs, "en", "toString")).toBe("");
  });
  it("matches browser languages in preference order, including Chinese variants", () => {
    for (const language of ["zh", "zh-TW", "ZH-hans-CN", "zh-HK"])
      expect(resolveLocale("system", [language])).toBe("zh-CN");
    expect(resolveLocale("system", ["en-GB", "zh-CN"])).toBe("en");
    expect(resolveLocale("system", ["fr-FR", "zh-TW"])).toBe("zh-CN");
    expect(resolveLocale("system", ["de-DE"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
  });
  it("gives a valid explicit choice precedence and discards invalid stored values", () => {
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    for (const value of [null, "fr", {}, "EN", "system"])
      expect(readLanguagePreference(value)).toBe("system");
  });
  it("follows the browser again after clearing the explicit choice", () => {
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    const storage = new Map<string, string>([
      ["huayu:model-settings:v1", "unchanged-browser-settings"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    setLanguage("zh-CN");
    expect(getLocale()).toBe("zh-CN");
    expect(storage.get("huayu:language")).toBe("zh-CN");
    setLanguage("system");
    expect(getLanguagePreference()).toBe("system");
    expect(getLocale()).toBe("en");
    expect(storage.has("huayu:language")).toBe(false);
    expect(storage.get("huayu:model-settings:v1")).toBe(
      "unchanged-browser-settings",
    );
  });
  it("still switches when browser storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    });
    setLanguage("en");
    expect(getLocale()).toBe("en");
    setLanguage("zh-CN");
    expect(getLocale()).toBe("zh-CN");
  });
  it("formats dates, numbers and singular/plural messages in the selected language", () => {
    setLanguage("en");
    expect(
      formatDate(new Date(2026, 9, 26), { month: "long", day: "numeric" }),
    ).toBe("October 26");
    expect(formatNumber(12345)).toBe("12,345");
    expect(translate(messages, "en", "search.resultCount", { count: 1 })).toBe(
      "1 result",
    );
    expect(translate(messages, "en", "search.resultCount", { count: 2 })).toBe(
      "2 results",
    );
    expect(
      translate(messages, "zh-CN", "search.resultCount", { count: 1 }),
    ).toBe("1 项结果");
  });
  it("interpolates without interpreting dollar signs, HTML, or JSON braces", () => {
    expect(
      interpolate("Work {name}: {unknown}", { name: "$& <test> {name}" }),
    ).toBe("Work $& <test> {name}: {unknown}");
    expect(interpolate('{"summary":"text"}')).toBe('{"summary":"text"}');
    expect(translate(messages, "en", "missing.internal.key")).toBe("");
  });
});

describe("content and model boundaries", () => {
  it("switches new examples without rewriting existing user content or freshness", () => {
    const editor = new Editor(createCanvasStore());
    applyRecipe(editor, "writing");
    const before = editor.store.getDocumentSnapshot();
    const first = editor.getCurrentPageShapes()[0];
    const fingerprint = generationFingerprint(editor, first.id);
    setLanguage("en");
    expect(editor.store.getDocumentSnapshot()).toEqual(before);
    expect(generationFingerprint(editor, first.id)).toBe(fingerprint);
    const english = new Editor(createCanvasStore());
    applyRecipe(english, "writing");
    expect(
      english
        .getCurrentPageShapes()
        .some((shape) =>
          shape.props.text?.includes("Topic: A day in the city"),
        ),
    ).toBe(true);
  });
  it("localizes only built-in template metadata, leaving custom names, content and tags intact", () => {
    setLanguage("en");
    const template = {
      id: "custom",
      name: "图文创作",
      description: "私人文案",
      tags: ["图文设计"],
      document: { store: { text: "画语" } },
    } as any;
    expect(localizeTemplate(template)).toBe(template);
    const builtin = { ...template, id: "builtin-image" };
    expect(localizeTemplate(builtin).name).toBe("Words and images");
    expect(localizeTemplate(builtin).document).toBe(builtin.document);
    expect(localizeTemplate(builtin).description).toBe(
      "Turn a written idea into an image and caption.",
    );
    expect(templateTag(template, "图文设计")).toBe("图文设计");
    expect(templateTag(builtin, "图文设计")).toBe("Visual creation");
    expect(templateTag(builtin, "私人标签")).toBe("私人标签");
    expect(builtin.name).toBe("图文创作");
  });
  it("uses English prompts without changing JSON/action contracts", () => {
    const prompts = modelPrompts("en");
    expect(prompts.procedure).toContain('"outputDescription"');
    expect(prompts.execute).toContain('"text"');
    expect(prompts.flowchart).toContain('"nodeType"');
    expect(prompts.mindmap).toContain('"children"');
    expect(prompts.agent).toContain("`_type`");
    expect(prompts.website).toContain("self-contained");
    expect(prompts.procedure).toContain("another language");
    expect(modelPrompts("zh-CN").execute).toContain("中文");
  });
  it("localizes export headings while preserving the actual recording content", () => {
    const value = JSON.stringify({
      summary: "保留原文",
      notes: "已有记录",
      chapters: [],
      qa_pairs: [],
    });
    setLanguage("en");
    const report = analysisMarkdown(value);
    expect(report).toContain("# Overview");
    expect(report).toContain("# Notes");
    expect(report).toContain("保留原文");
    expect(report).toContain("已有记录");
    expect(JSON.parse(value).summary).toBe("保留原文");
  });
});

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? files(resolve(dir, item.name))
      : [resolve(dir, item.name)],
  );
}
function literalKeys(file: string) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const keys: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (["t", "prompt"].includes(node.expression.text) ||
        (file.endsWith("QuickSearch.tsx") &&
          node.expression.text === "text")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      keys.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return keys;
}

describe("translation coverage and static documentation", () => {
  it("keeps the asset library catalog complete with matching interpolation parameters", () => {
    expect(Object.keys(assetMessages.en).sort()).toEqual(
      Object.keys(assetMessages["zh-CN"]).sort(),
    );
    for (const [key, chinese] of Object.entries(assetMessages["zh-CN"])) {
      const english = assetMessages.en[key];
      const parameters = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(english, key).not.toMatch(/\p{Script=Han}/u);
      expect(parameters(english), key).toEqual(parameters(chinese));
    }
  });
  it("keeps system exceptions as semantic translations until they are rendered", () => {
    const frozen: string[] = [];
    for (const file of files(resolve(import.meta.dirname, "..")).filter(
      (file) => /\.tsx?$/.test(file) && !file.includes(".test."),
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      function visit(node: ts.Node) {
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text.endsWith("Error")
        ) {
          const message = node.arguments?.[0];
          if (
            message &&
            ts.isCallExpression(message) &&
            ts.isIdentifier(message.expression) &&
            message.expression.text === "t"
          ) {
            frozen.push(
              `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(frozen).toEqual([]);
  });
  it("uses semantic keys with both translations at every literal call site", () => {
    for (const file of files(resolve(import.meta.dirname, "..")).filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !file.includes(".test.") &&
        !file.endsWith("messages.ts"),
    ))
      for (const key of literalKeys(file)) {
        expect(key, file).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
        expect(zhCN[key], `${file}: ${key} (zh-CN)`).toBeTruthy();
        expect(en[key], `${file}: ${key} (en)`).toBeTruthy();
      }
  });
  it("keeps interpolation parameters equivalent in both language catalogs", () => {
    const placeholders = (text: string) =>
      [
        ...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1])),
      ].sort();
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort());
    for (const key of Object.keys(zhCN))
      expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
    for (const [key, message] of Object.entries(en))
      for (const text of typeof message === "string"
        ? [message]
        : [message.one, message.other])
        expect(placeholders(text), key).toEqual(placeholders(zhCN[key]));
  });
});
