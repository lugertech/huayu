import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => vi.unstubAllGlobals());

it("reopens recovery storage after an unsuccessful open instead of caching its rejection", async () => {
  vi.resetModules();
  const connection = {
    transaction: () => {
      const tx = {
        oncomplete: null as null | (() => void),
        objectStore: () => ({ get: () => ({}) }),
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
  const open = vi.fn(() => {
    const request = {
      result: connection,
      onerror: null as null | (() => void),
      onsuccess: null as null | (() => void),
    };
    const first = open.mock.calls.length === 1;
    queueMicrotask(() => (first ? request.onerror?.() : request.onsuccess?.()));
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  const { readDraft } = await import("./drafts");
  await expect(readDraft("first")).rejects.toThrow();
  await expect(readDraft("second")).resolves.toBeUndefined();
  await expect(readDraft("third")).resolves.toBeUndefined();
  expect(open).toHaveBeenCalledTimes(2);
});
