import { t } from "@/i18n";
import {
  normalizeRecord,
  SCHEMA,
  type CanvasRecord,
  type DocumentSnapshot,
} from "./model";

type Source = "user" | "remote";
export interface ChangeEntry {
  changes: {
    added: Record<string, CanvasRecord>;
    updated: Record<string, [CanvasRecord, CanvasRecord]>;
    removed: Record<string, CanvasRecord>;
  };
  source: Source;
  scope: "document" | "session";
}
type Listener = {
  fn: (entry: ChangeEntry) => void;
  source?: Source;
  scope?: string;
};
type HistoryFrame = Map<
  string,
  { before?: CanvasRecord; after?: CanvasRecord }
>;
export class CanvasStore {
  private records = new Map<string, CanvasRecord>();
  private listeners = new Set<Listener>();
  private subscribers = new Set<() => void>();
  private before?: Map<string, CanvasRecord>;
  private source: Source = "user";
  private depth = 0;
  private revision = 0;
  private past: HistoryFrame[] = [];
  private future: HistoryFrame[] = [];
  private replaying = false;
  private group = false;
  private groupRecorded = false;
  private lastHistoryAt = 0;
  private schemaValue: unknown = SCHEMA;
  session: any;
  readonly schema = { serialize: () => this.schemaValue };
  constructor(_options?: unknown) {
    this.records.set("document:document", {
      id: "document:document",
      typeName: "document",
      name: "",
      gridSize: 10,
      meta: {},
    });
    this.records.set("page:page", {
      id: "page:page",
      typeName: "page",
      name: "Page 1",
      index: "a1",
      meta: {},
    });
  }
  get = <T extends CanvasRecord = CanvasRecord>(id: string) =>
    this.records.get(id) as T | undefined;
  allRecords = () => [...this.records.values()];
  serialize = (_scope = "document") => Object.fromEntries(this.records);
  subscribe = (listener: () => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };
  getVersion = () => this.revision;
  listen(fn: Listener["fn"], options: Omit<Listener, "fn"> = {}) {
    const item = { fn, ...options };
    this.listeners.add(item);
    return () => {
      this.listeners.delete(item);
    };
  }
  private emit(entry: ChangeEntry) {
    this.revision++;
    for (const listener of this.listeners)
      if (
        (!listener.scope ||
          listener.scope === entry.scope ||
          listener.scope === "all") &&
        (!listener.source || listener.source === entry.source)
      )
        listener.fn(entry);
    this.subscribers.forEach((listener) => listener());
  }
  notifySession() {
    this.emit({
      changes: { added: {}, updated: {}, removed: {} },
      source: "user",
      scope: "session",
    });
  }
  batch<T>(operation: () => T, source: Source = this.source): T {
    const outer = this.depth === 0;
    const previousSource = this.source;
    if (outer) {
      this.before = new Map(this.records);
      this.source = source;
    }
    this.depth++;
    try {
      return operation();
    } catch (error) {
      if (outer) this.records = this.before!;
      throw error;
    } finally {
      this.depth--;
      if (outer) {
        const before = this.before!;
        this.before = undefined;
        const changes: ChangeEntry["changes"] = {
          added: {},
          updated: {},
          removed: {},
        };
        for (const [id, record] of this.records) {
          const previous = before.get(id);
          if (!previous) changes.added[id] = record;
          else if (JSON.stringify(previous) !== JSON.stringify(record))
            changes.updated[id] = [previous, record];
        }
        for (const [id, record] of before)
          if (!this.records.has(id)) changes.removed[id] = record;
        if (
          Object.keys(changes.added).length ||
          Object.keys(changes.updated).length ||
          Object.keys(changes.removed).length
        ) {
          if (source === "user" && !this.replaying) {
            const now = Date.now();
            if (
              !this.past.length ||
              (this.group && !this.groupRecorded) ||
              (!this.group && now - this.lastHistoryAt > 350)
            ) {
              this.past.push(new Map());
              if (this.past.length > 100) this.past.shift();
              this.groupRecorded = true;
            }
            const frame = this.past[this.past.length - 1];
            const changed = new Set([
              ...Object.keys(changes.added),
              ...Object.keys(changes.updated),
              ...Object.keys(changes.removed),
            ]);
            for (const id of changed) {
              const first = frame.get(id);
              const entry = {
                before: first ? first.before : before.get(id),
                after: this.records.get(id),
              };
              if (JSON.stringify(entry.before) === JSON.stringify(entry.after))
                frame.delete(id);
              else frame.set(id, entry);
            }
            this.lastHistoryAt = now;
            this.future = [];
          }
          this.emit({ changes, source, scope: "document" });
        }
        this.source = previousSource;
      }
    }
  }
  put(records: CanvasRecord[]) {
    const normalized = records.map((record) => normalizeRecord(record));
    this.batch(() => {
      for (const record of normalized) this.records.set(record.id, record);
    });
  }
  remove(ids: string[]) {
    this.batch(() => {
      for (const id of ids) this.records.delete(id);
    });
  }
  mergeRemoteChanges<T>(operation: () => T) {
    return this.batch(operation, "remote");
  }
  replace(snapshot: DocumentSnapshot, source: Source = "remote") {
    if (
      !snapshot?.store ||
      typeof snapshot.store !== "object" ||
      Array.isArray(snapshot.store) ||
      Object.keys(snapshot.store).length > 50000
    )
      throw new Error(t("canvas.invalidCanvasData"));
    const records = Object.entries(snapshot.store).map(([id, record]) =>
      normalizeRecord(record, id),
    );
    if (!records.some((record) => record.typeName === "page"))
      throw new Error(t("canvas.theCanvasHasNoPages"));
    this.batch(() => {
      this.records = new Map(records.map((record) => [record.id, record]));
      this.schemaValue = snapshot.schema || SCHEMA;
    }, source);
  }
  beginHistoryGroup() {
    this.group = true;
    this.groupRecorded = false;
  }
  historyBoundary() {
    if (!this.depth && !this.group) this.lastHistoryAt = 0;
  }
  endHistoryGroup() {
    this.group = false;
    this.groupRecorded = false;
    this.lastHistoryAt = 0;
  }
  get canUndo() {
    return !!this.past.length;
  }
  get canRedo() {
    return !!this.future.length;
  }
  restoreHistory(direction: "undo" | "redo") {
    const from = direction === "undo" ? this.past : this.future;
    const to = direction === "undo" ? this.future : this.past;
    const frame = from.pop();
    if (!frame) return;
    this.replaying = true;
    try {
      this.batch(() => {
        for (const [id, change] of frame) {
          const expected = direction === "undo" ? change.after : change.before;
          const next = direction === "undo" ? change.before : change.after;
          // A newer edit from another browser must not be replaced by a stale history snapshot.
          if (JSON.stringify(this.records.get(id)) !== JSON.stringify(expected))
            continue;
          if (next) this.records.set(id, next);
          else this.records.delete(id);
        }
      });
      to.push(frame);
    } finally {
      this.replaying = false;
      this.lastHistoryAt = 0;
    }
  }
}
export const createCanvasStore = (options?: unknown) =>
  new CanvasStore(options);
