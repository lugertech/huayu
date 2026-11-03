import { t } from "@/i18n";
import type { CanvasDocument } from "@/api/client";

export interface RecordPatch {
  upsert: unknown[];
  remove: string[];
  schema?: unknown;
  client_id: string;
}
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("huayu-local", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("drafts");
        request.result.createObjectStore("views");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error(t("canvas.theBrowserCannotSaveRecoveryData")));
    });
  return database;
}
async function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () =>
      reject(new Error(t("canvas.theBrowserCannotSaveRecoveryData")));
    tx.onabort = () => reject(new Error(t("canvas.localSavingInterrupted")));
  });
}
export const readDraft = (id: string) =>
  transaction<RecordPatch | undefined>("drafts", "readonly", (store) =>
    store.get(id),
  );
export const saveDraft = (id: string, patch: RecordPatch) =>
  transaction("drafts", "readwrite", (store) =>
    patch.upsert.length || patch.remove.length
      ? store.put(patch, id)
      : store.delete(id),
  );
export const readView = (id: string) =>
  transaction<unknown>("views", "readonly", (store) => store.get(id));
export const saveView = (id: string, view: unknown) =>
  transaction("views", "readwrite", (store) => store.put(view, id));

export function applyDraft(
  document: CanvasDocument | null,
  patch?: RecordPatch,
): CanvasDocument | null {
  if (!patch) return document;
  const store = { ...(document?.store || {}) };
  for (const id of patch.remove) delete store[id];
  for (const record of patch.upsert) {
    if (
      record &&
      typeof record === "object" &&
      typeof record["id"] === "string"
    )
      store[record["id"]] = record;
  }
  return { store, schema: patch.schema || document?.schema };
}
