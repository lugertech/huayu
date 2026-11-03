import { t } from "@/i18n";
import {
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
  type CanvasRecord,
  type CanvasStore,
  type DocumentSnapshot,
} from "@/canvas/editor";
import { api, APIError, type CanvasDocument, type Project } from "@/api/client";
import { applyDraft, saveDraft, type RecordPatch } from "./drafts";
import { mergeCanvasPages } from "./single-canvas";

export type SaveStatus = "saved" | "saving" | "offline" | "error";
export interface SyncState {
  status: SaveStatus;
  connected: boolean;
  error: string;
  revision: number;
}

export function documentSnapshot(store: CanvasStore): CanvasDocument {
  return getSnapshot(store).document;
}
export function sanitizedRecord(record: CanvasRecord): CanvasRecord {
  if (record.typeName !== "shape") return record;
  const props = { ...record.props };
  if ("isRunning" in props) props["isRunning"] = false;
  if ("isSubmitting" in props) props["isSubmitting"] = false;
  return { ...record, props } as CanvasRecord;
}

/** Owns record-level autosave, an IndexedDB recovery journal, and local WebSocket updates. */
export class CanvasSync {
  readonly store: CanvasStore;
  readonly mergedPages: boolean;
  readonly clientId = crypto.randomUUID();
  private pending = new Map<string, CanvasRecord | null>();
  private inFlight = new Map<string, CanvasRecord | null>();
  private deferredRemote = new Map<
    string,
    { record: CanvasRecord | null; revision: number }
  >();
  private listeners = new Set<() => void>();
  private state: SyncState;
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  private stopped = true;
  private retryDelay = 1000;
  private saving?: Promise<void>;
  private deleted = false;
  private accessRevoked = false;
  private remoteRevision: number;
  onDeleted?: () => void;
  onAccessRevoked?: () => void;

  constructor(
    readonly project: Project,
    draft?: RecordPatch,
    readonly shareToken: string | null = null,
  ) {
    this.store = createCanvasStore();
    const document = applyDraft(project.document, draft);
    if (document)
      loadSnapshot(this.store, {
        document: document as DocumentSnapshot<CanvasRecord>,
      });
    const merged = mergeCanvasPages(this.store);
    this.mergedPages = !!merged;
    this.state = {
      status: draft || merged ? "saving" : "saved",
      connected: false,
      error: "",
      revision: project.revision,
    };
    this.remoteRevision = project.revision;
    if (draft) {
      for (const record of draft.upsert as CanvasRecord[])
        this.pending.set(record.id, record);
      for (const id of draft.remove) this.pending.set(id, null);
    }
    if (merged) {
      for (const record of merged.upsert) this.pending.set(record.id, record);
      for (const id of merged.remove) this.pending.set(id, null);
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(values: Partial<SyncState>) {
    this.state = { ...this.state, ...values };
    this.listeners.forEach((listener) => listener());
  }

  connect() {
    if (!this.stopped) return;
    this.stopped = false;
    this.unsubscribe = this.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.added))
          this.pending.set(record.id, sanitizedRecord(record));
        for (const [, record] of Object.values(entry.changes.updated))
          this.pending.set(record.id, sanitizedRecord(record));
        for (const record of Object.values(entry.changes.removed))
          this.pending.set(record.id, null);
        this.schedule();
      },
      { source: "user", scope: "document" },
    );
    if (!this.project.document) {
      for (const record of Object.values(this.store.serialize("document")))
        this.pending.set(record.id, sanitizedRecord(record));
    }
    if (this.pending.size) this.schedule();
    queueMicrotask(() => {
      if (!this.stopped) this.openSocket();
    });
    window.addEventListener("online", this.retry);
    window.addEventListener("beforeunload", this.beforeUnload);
  }
  disconnect() {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    window.removeEventListener("online", this.retry);
    window.removeEventListener("beforeunload", this.beforeUnload);
    if (!this.deleted) void this.persist();
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.pending.size || this.inFlight.size) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  retry = () => {
    if (this.deleted || this.accessRevoked) return;
    void this.flush().catch(() => {});
    if (!this.socket || this.socket.readyState > WebSocket.OPEN)
      this.openSocket();
  };
  private get accessQuery() {
    return this.shareToken === null
      ? ""
      : `?share=${encodeURIComponent(this.shareToken)}`;
  }
  private revokeAccess() {
    if (this.accessRevoked) return;
    this.accessRevoked = true;
    this.disconnect();
    this.update({
      status: "error",
      connected: false,
      error: t("canvas.share.linkUnavailable"),
    });
    this.onAccessRevoked?.();
  }
  private patch(changes: Map<string, CanvasRecord | null>): RecordPatch {
    return {
      upsert: [...changes.values()].filter(Boolean),
      remove: [...changes]
        .filter(([, value]) => value === null)
        .map(([id]) => id),
      schema: this.store.schema.serialize(),
      client_id: this.clientId,
    };
  }
  private async persist() {
    const changes = new Map([...this.inFlight, ...this.pending]);
    try {
      await saveDraft(this.project.id, this.patch(changes));
    } catch (error) {
      this.update({
        error:
          error instanceof Error
            ? error.message
            : t("canvas.cannotSaveLocalRecoveryData"),
      });
    }
  }
  private schedule() {
    this.update({ status: "saving" });
    void this.persist();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, 400);
  }
  async flush(): Promise<void> {
    if (this.deleted) throw new Error(t("canvas.thisProjectWasDeleted"));
    if (this.accessRevoked) throw new Error(t("canvas.share.linkUnavailable"));
    if (this.saving) {
      await this.saving;
      if (this.pending.size) return this.flush();
      return;
    }
    if (!this.pending.size) return;
    clearTimeout(this.timer);
    this.inFlight = this.pending;
    this.pending = new Map();
    const patch = this.patch(this.inFlight);
    this.update({ status: "saving" });
    this.saving = (async () => {
      try {
        const response = await api<{ revision: number }>(
          `/api/projects/${this.project.id}/document${this.accessQuery}`,
          { method: "PATCH", body: JSON.stringify(patch) },
        );
        this.inFlight.clear();
        this.store.mergeRemoteChanges(() => {
          for (const [id, change] of this.deferredRemote) {
            if (this.pending.has(id)) continue;
            if (change.revision > response.revision) {
              if (change.record) this.store.put([change.record]);
              else this.store.remove([id]);
            }
            this.deferredRemote.delete(id);
          }
        });
        this.update({
          status: this.pending.size ? "saving" : "saved",
          revision: Math.max(response.revision, this.state.revision),
          error: "",
        });
      } catch (error) {
        this.pending = new Map([...this.inFlight, ...this.pending]);
        this.inFlight.clear();
        if (
          error instanceof APIError &&
          error.code === "COLLABORATION_CLOSED"
        ) {
          this.revokeAccess();
        } else {
          this.update({
            status: "offline",
            error:
              error instanceof Error
                ? error.message
                : t("canvas.connectionToTheLocalServiceInterrupted"),
          });
        }
        if (!this.stopped)
          this.timer = setTimeout(() => {
            void this.flush().catch(() => {});
          }, 3000);
        throw error;
      } finally {
        await this.persist();
        this.saving = undefined;
      }
    })();
    await this.saving;
    if (this.pending.size) return this.flush();
  }
  private openSocket() {
    if (this.stopped || this.deleted) return;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.reconnectTimer);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${location.host}/api/projects/${this.project.id}/events${this.accessQuery}`,
    );
    this.socket = socket;
    socket.onopen = () => {
      this.retryDelay = 1000;
      this.update({ connected: true });
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (
          message.type === "collaboration" &&
          !message.enabled &&
          this.shareToken !== null
        ) {
          this.revokeAccess();
          return;
        }
        if (message.type === "deleted") {
          this.deleted = true;
          this.pending.clear();
          this.inFlight.clear();
          void saveDraft(this.project.id, {
            upsert: [],
            remove: [],
            client_id: this.clientId,
          });
          this.disconnect();
          this.onDeleted?.();
          return;
        }
        if (message.type === "snapshot") {
          if (message.document && message.revision >= this.state.revision)
            this.applyRemoteSnapshot(message.document, message.revision);
          this.remoteRevision = Math.max(this.remoteRevision, message.revision);
          this.update({
            revision: Math.max(this.state.revision, message.revision),
          });
        } else if (
          message.type === "patch" &&
          message.revision > this.remoteRevision
        ) {
          if (message.patch.client_id !== this.clientId)
            this.applyRemotePatch(message.patch, message.revision);
          this.remoteRevision = message.revision;
          this.update({
            revision: Math.max(this.state.revision, message.revision),
          });
        }
      } catch {
        this.update({
          status: "error",
          error: t("canvas.canvasSyncFailed"),
        });
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.update({ connected: false });
      if (!this.stopped && !this.deleted) {
        this.reconnectTimer = setTimeout(
          () => this.openSocket(),
          this.retryDelay,
        );
        this.retryDelay = Math.min(this.retryDelay * 2, 10000);
      }
    };
  }
  private localChanges() {
    return new Map([...this.inFlight, ...this.pending]);
  }
  private applyRemoteSnapshot(document: CanvasDocument, revision: number) {
    const local = this.localChanges();
    for (const id of local.keys())
      this.deferredRemote.set(id, {
        record: (document.store[id] as CanvasRecord | undefined) || null,
        revision,
      });
    const merged = applyDraft(document, this.patch(local))!;
    const records = Object.values(merged.store) as CanvasRecord[];
    this.store.mergeRemoteChanges(() => {
      const removed = Object.keys(this.store.serialize("document")).filter(
        (id) => !(id in merged.store),
      );
      this.store.remove(removed as CanvasRecord["id"][]);
      this.store.put(records);
    });
    mergeCanvasPages(this.store);
  }
  private applyRemotePatch(patch: RecordPatch, revision: number) {
    const local = this.localChanges();
    for (const id of patch.remove)
      if (local.has(id))
        this.deferredRemote.set(id, { record: null, revision });
    for (const record of patch.upsert as CanvasRecord[])
      if (local.has(record.id))
        this.deferredRemote.set(record.id, { record, revision });
    this.store.mergeRemoteChanges(() => {
      this.store.remove(
        patch.remove.filter((id) => !local.has(id)) as CanvasRecord["id"][],
      );
      this.store.put(
        (patch.upsert as CanvasRecord[]).filter(
          (record) => !local.has(record.id),
        ),
      );
    });
    mergeCanvasPages(this.store);
  }
}
