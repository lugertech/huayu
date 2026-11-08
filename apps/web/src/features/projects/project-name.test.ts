import { describe, expect, it } from "vite-plus/test";
import { projectCopyName } from "./project-name";

describe("project copy names", () => {
  it.each([115, 116, 120])(
    "keeps a %i-character English name within the server limit",
    (length) => {
      const name = "a".repeat(length);
      const result = projectCopyName(name, "en");
      expect(result).toBe(`${name.slice(0, 115)} copy`);
      expect(Array.from(result)).toHaveLength(120);
    },
  );

  it("uses the selected suffix without splitting Unicode characters", () => {
    const name = "😀".repeat(120);
    expect(projectCopyName(name, "zh-CN")).toBe(`${"😀".repeat(117)} 副本`);
    expect(projectCopyName(name, "en")).toBe(`${"😀".repeat(115)} copy`);
    expect(projectCopyName("我的项目", "en")).toBe("我的项目 copy");
  });
});
