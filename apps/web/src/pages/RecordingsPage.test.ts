import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Recording } from "@/api/client";
import { errorText, LocalizedError } from "@/i18n/errors";
import { setLanguage } from "@/i18n";

// Exercise the page's actual async callback without replacing it with a second
// implementation or requiring a DOM for the rest of the recording workspace.
const source = ts.createSourceFile(
  "RecordingsPage.tsx",
  readFileSync(new URL("./RecordingsPage.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback: ts.FunctionDeclaration | undefined;
function findRefresh(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "refresh")
    callback = node;
  ts.forEachChild(node, findRefresh);
}
findRefresh(source);
if (!callback) throw new Error("Recording refresh callback was not found");
const compiled = ts.transpileModule(callback.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function page() {
  const requests: Array<{
    resolve: (value: Recording[]) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
  }> = [];
  const state = {
    recordings: [] as Recording[],
    loading: false,
    error: null as Error | null,
  };
  const showToast = vi.fn();
  const refresh = runInNewContext(`${compiled}\nrefresh`, {
    AbortController,
    Error,
    LocalizedError,
    errorText,
    refreshRequest: { current: null },
    hasLoaded: true,
    setRecordings: (value: Recording[]) => (state.recordings = value),
    setLoading: (value: boolean) => (state.loading = value),
    setError: (value: Error | null) => (state.error = value),
    setHasLoaded: vi.fn(),
    showToast,
    t: (key: string) => key,
    api: (_path: string, options?: RequestInit) =>
      new Promise<Recording[]>((resolve, reject) => {
        requests.push({
          resolve,
          reject,
          signal: options?.signal ?? undefined,
        });
      }),
  }) as () => Promise<void>;
  return { refresh, requests, state, showToast };
}

describe("recording list refresh ordering", () => {
  it("keeps the latest list when an older request finishes last", async () => {
    const { refresh, requests, state } = page();
    const older = refresh();
    const latest = refresh();
    const current = [{ id: "recording", name: "Updated" }] as Recording[];
    requests[1].resolve(current);
    await latest;
    requests[0].resolve([{ id: "recording", name: "Old" }] as Recording[]);
    await older;
    expect(state.recordings).toEqual(current);
    expect(requests[0].signal?.aborted).toBe(true);
    expect(state.loading).toBe(false);
  });

  it.each(["success", "failure"])(
    "does not let an older %s finish the current loading state",
    async (outcome) => {
      const { refresh, requests, state, showToast } = page();
      const older = refresh();
      const latest = refresh();
      if (outcome === "success") requests[0].resolve([]);
      else requests[0].reject(new Error("Old failure"));
      await older;
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
      expect(showToast).not.toHaveBeenCalled();
      requests[1].reject(new Error("Current failure"));
      await latest;
      expect(state.loading).toBe(false);
      expect(state.error?.message).toBe("Current failure");
      expect(showToast).toHaveBeenCalledOnce();
    },
  );

  it("retains the received error so its wording can follow a later language change", async () => {
    const { refresh, requests, state } = page();
    const pending = refresh();
    const error = new LocalizedError({ key: "api.errors.contentNotFound" });
    requests[0].reject(error);
    await pending;
    expect(state.error).toBe(error);
    setLanguage("en");
    expect(errorText(state.error)).toBe("Content not found");
    setLanguage("zh-CN");
    expect(errorText(state.error)).toBe("未找到对应内容");
  });
});
