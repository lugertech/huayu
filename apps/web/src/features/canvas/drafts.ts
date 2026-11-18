import { LocalizedError } from "@/i18n/errors";
import type { CanvasDocument } from "@/api/client";

export interface RecordPatch {
  upsert: unknown[];
  remove: string[];
  schema?: unknown;
  client_id: string;
  sequence?: number;
}
type DatabaseState =
  | { phase: "closed" }
  | { phase: "opening"; promise: Promise<IDBDatabase> }
  | { phase: "open"; connection: IDBDatabase };
let database: DatabaseState = { phase: "closed" };
function openDatabase(): Promise<IDBDatabase> {
  if (database.phase === "open") return Promise.resolve(database.connection);
  if (database.phase === "opening") return database.promise;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("huayu-local", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts");
      request.result.createObjectStore("views");
    };
    request.onsuccess = () => {
      const connection = request.result;
      database = { phase: "open", connection };
      connection.onversionchange = () => {
        connection.close();
        database = { phase: "closed" };
      };
      connection.onclose = () => {
        if (database.phase === "open" && database.connection === connection)
          database = { phase: "closed" };
      };
      resolve(connection);
    };
    request.onerror = () =>
      reject(
        new LocalizedError({ key: "canvas.theBrowserCannotSaveRecoveryData" }),
      );
  }).catch((error) => {
    database = { phase: "closed" };
    throw error;
  });
  database = { phase: "opening", promise };
  return promise;
}
async function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
  onResult?: (result: T, store: IDBObjectStore) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const objectStore = tx.objectStore(store);
    const request = operation(objectStore);
    let result: T;
    request.onsuccess = () => {
      result = request.result;
      onResult?.(result, objectStore);
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () =>
      reject(
        new LocalizedError({ key: "canvas.theBrowserCannotSaveRecoveryData" }),
      );
    tx.onabort = () =>
      reject(new LocalizedError({ key: "canvas.localSavingInterrupted" }));
  });
}
export const canvasDraftKey = (id: string, shareToken: string | null) =>
  shareToken === null ? id : `${id}:share:${shareToken}`;

export const readDraft = (id: string) =>
  transaction<RecordPatch | undefined>("drafts", "readonly", (store) =>
    store.get(id),
  );
function draftChanges(patch?: RecordPatch) {
  const changes = new Map<string, object | null>();
  for (const id of patch?.remove ?? []) changes.set(id, null);
  for (const record of patch?.upsert ?? []) {
    if (
      record &&
      typeof record === "object" &&
      typeof record["id"] === "string"
    )
      changes.set(record["id"], record);
  }
  return changes;
}

export function mergeDraft(
  previous: RecordPatch | undefined,
  patch: RecordPatch,
  mode: "pending" | "acknowledged",
) {
  const changes = draftChanges(previous);
  for (const [id, record] of draftChanges(patch)) {
    if (mode === "pending") changes.set(id, record);
    else if (JSON.stringify(changes.get(id)) === JSON.stringify(record))
      changes.delete(id);
  }
  if (!changes.size) return undefined;
  const upsert: object[] = [];
  const remove: string[] = [];
  for (const [id, record] of changes) {
    if (record === null) remove.push(id);
    else upsert.push(record);
  }
  return { ...patch, schema: patch.schema ?? previous?.schema, upsert, remove };
}

/** Merge with the stored recovery data in a single cross-tab transaction. */
export function saveDraft(
  id: string,
  patch: RecordPatch,
  mode: "pending" | "acknowledged" = "pending",
) {
  return transaction<RecordPatch | undefined>(
    "drafts",
    "readwrite",
    (store) => store.get(id),
    (previous, store) => {
      const next = mergeDraft(previous, patch, mode);
      if (next) store.put(next, id);
      else store.delete(id);
    },
  );
}

export const clearDraft = (id: string) =>
  transaction("drafts", "readwrite", (store) => store.delete(id));

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
  for (const [id, record] of draftChanges(patch)) {
    if (record === null) delete store[id];
    else store[id] = record;
  }
  return { store, schema: patch.schema || document?.schema };
}
