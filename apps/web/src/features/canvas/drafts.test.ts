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

it("preserves pending changes from a legacy draft and newer edits until their own contents are acknowledged", async () => {
  const { mergeDraft, applyDraft } = await import("./drafts");
  const old = {
    client_id: "a",
    upsert: [{ id: "shape:a", text: "old" }],
    remove: ["shape:deleted"],
    schema: { version: 1 },
  };
  const other = {
    client_id: "b",
    upsert: [{ id: "shape:b", text: "other" }],
    remove: [],
  };
  const changed = {
    client_id: "b",
    upsert: [
      { id: "shape:a", text: "new" },
      { id: "shape:deleted", text: "restored" },
    ],
    remove: [],
  };
  let draft = mergeDraft(old, other, "pending");
  draft = mergeDraft(draft, changed, "pending");
  draft = mergeDraft(draft, old, "acknowledged");
  expect(applyDraft(null, draft)?.store).toEqual({
    "shape:a": changed.upsert[0],
    "shape:b": other.upsert[0],
    "shape:deleted": changed.upsert[1],
  });
  draft = mergeDraft(draft, other, "acknowledged");
  expect(mergeDraft(draft, changed, "acknowledged")).toBeUndefined();
});
