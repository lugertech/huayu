import { describe, expect, it } from "vite-plus/test";
import { searchScore } from "./search";

describe("search ranking", () => {
  it("puts exact names before prefixes, substrings and secondary labels", () => {
    const scores = [
      searchScore("灵感", "灵感"),
      searchScore("灵感", "灵感写作"),
      searchScore("灵感", "我的灵感"),
      searchScore("灵感", "旅行记录", "灵感"),
    ];
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(new Set(scores).size).toBe(4);
  });
  it("requires every word and handles full-width characters and surrounding spaces", () => {
    expect(searchScore("  ａｉ   灵感 ", "AI 灵感写作")).toBeGreaterThan(0);
    expect(searchScore("AI 绘画", "AI 灵感写作")).toBe(0);
    expect(searchScore("录屏 讨论", "产品讨论", "录屏")).toBeGreaterThan(0);
  });
  it("keeps an empty search usable without treating missing names as a match", () => {
    expect(searchScore("  ", "未命名项目")).toBe(1);
    expect(searchScore("不存在", "未命名项目")).toBe(0);
  });
});
