import { afterEach, expect, it, vi } from "vite-plus/test";
import { PROJECTS_CHANGED_EVENT } from "@/api/client";
import { setLanguage } from "@/i18n";
import { createBlankProject } from "./create-project";

afterEach(() => vi.unstubAllGlobals());

it("creates each blank project in the current language and notifies project views", async () => {
  const changed = vi.fn();
  const window = new EventTarget();
  window.addEventListener(PROJECTS_CHANGED_EVENT, changed);
  vi.stubGlobal("window", window);
  const fetchProject = vi.fn(async () => Response.json({ id: "new-project" }));
  vi.stubGlobal("fetch", fetchProject);

  for (const [locale, name] of [
    ["zh-CN", "未命名项目"],
    ["en", "Untitled project"],
  ] as const) {
    setLanguage(locale);
    await expect(createBlankProject()).resolves.toMatchObject({
      id: "new-project",
    });
    expect(fetchProject).toHaveBeenLastCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    );
  }
  expect(changed).toHaveBeenCalledTimes(2);
});
