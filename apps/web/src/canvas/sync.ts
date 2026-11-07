import { t, type MessageKey } from "@/i18n";
import {
  createCanvasStore,
  getSnapshot,
  loadSnapshot,
  type CanvasRecord,
  type CanvasStore,
  type DocumentSnapshot,
} from "@/canvas/editor";
import { api, APIError, type CanvasDocument, type Project } from "@/api/client";
import {
  applyDraft,
  canvasDraftKey,
  saveDraft,
  type RecordPatch,
} from "./drafts";
import { mergeCanvasPages } from "./single-canvas";

export type SaveStatus = "saved" | "saving" | "offline" | "error";
export interface SyncState {
  status: SaveStatus;
  connected: boolean;
  savePhase:
    | "clean"
    | "waiting"
    | "sending"
    | "sending-dirty"
    | "retrying"
    | "blocked";
  connection: "disconnected" | "connecting" | "connected" | "reconnecting";
  error: MessageKey | Error | null;
  revision: number;
}

export interface CanvasPresence {
  pointer: { x: number; y: number; tool: "pointer" | "laser" } | null;
  button: "down" | "up";
  selectedElementIds: Record<string, true>;
}
export interface CanvasPeer extends CanvasPresence {
  id: string;
  member_id: string;
  role: "host" | "collaborator";
  joined_at: number;
}
export type CollaborationExit = "closed" | "removed" | "full";
export interface RoomMembers {
  self?: CanvasPeer;
  members: CanvasPeer[];
  maxCollaborators: number;
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

/** Keeps durable autosave independent from transient scene and presence broadcasts. */
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
  private presenceListeners = new Set<() => void>();
  private peers = new Map<string, CanvasPeer>();
  private peerId?: string;
  private roomMembers: RoomMembers = { members: [], maxCollaborators: 15 };
  private presence: CanvasPresence = {
    pointer: null,
    button: "up",
    selectedElementIds: {},
  };
  private presencePending = false;
  private realtimeChanges = new Map<string, CanvasRecord | null>();
  private broadcastTimer?: ReturnType<typeof setTimeout>;
  private previewing = false;
  private state: SyncState;
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  private lifecycle:
    | { phase: "stopped" | "active" | "deleted" }
    | { phase: "revoked"; reason: CollaborationExit } = { phase: "stopped" };
  private retryDelay = 1000;
  private saving?: Promise<void>;
  private get stopped() {
    return this.lifecycle.phase !== "active";
  }
  private get deleted() {
    return this.lifecycle.phase === "deleted";
  }
  private get accessRevoked() {
    return this.lifecycle.phase === "revoked";
  }
  private remoteRevision: number;
  onDeleted?: () => void;
  onAccessRevoked?: (reason: CollaborationExit) => void;

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
      savePhase: draft || merged ? "waiting" : "clean",
      connection: "disconnected",
      error: null,
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
  getPeers = (): ReadonlyMap<string, CanvasPeer> => this.peers;
  getRoomMembers = () => this.roomMembers;
  subscribePresence = (listener: () => void) => {
    this.presenceListeners.add(listener);
    return () => {
      this.presenceListeners.delete(listener);
    };
  };
  get isApplyingPreview() {
    return this.previewing;
  }
  updatePresence(values: Partial<CanvasPresence>) {
    const next = { ...this.presence, ...values };
    if (JSON.stringify(next) === JSON.stringify(this.presence)) return;
    this.presence = next;
    this.presencePending = true;
    this.scheduleBroadcast();
  }
  private hidePointer = () => {
    this.updatePresence({ pointer: null, button: "up" });
    this.broadcast();
  };
  private onVisibilityChange = () => {
    if (document.hidden) this.hidePointer();
  };
  private changedPresence() {
    const members = new Map<string, CanvasPeer>();
    for (const peer of [this.roomMembers.self, ...this.peers.values()]) {
      if (!peer) continue;
      const previous = members.get(peer.member_id);
      if (!previous || peer.joined_at < previous.joined_at)
        members.set(peer.member_id, peer);
    }
    const next = [...members.values()].sort((a, b) =>
      a.role === b.role
        ? a.joined_at - b.joined_at || a.member_id.localeCompare(b.member_id)
        : a.role === "host"
          ? -1
          : 1,
    );
    // Pointer frames do not cause the member menu to rerender.
    if (
      JSON.stringify(next.map(({ member_id, role }) => [member_id, role])) !==
      JSON.stringify(
        this.roomMembers.members.map(({ member_id, role }) => [
          member_id,
          role,
        ]),
      )
    ) {
      this.roomMembers = { ...this.roomMembers, members: next };
    }
    this.presenceListeners.forEach((listener) => listener());
  }
  private scheduleBroadcast() {
    if (this.broadcastTimer || this.stopped) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = undefined;
      this.broadcast();
    }, 33);
  }
  private broadcast() {
    if (this.stopped || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.realtimeChanges.size) {
      this.socket.send(
        JSON.stringify({
          type: "scene_update",
          patch: this.patch(this.realtimeChanges),
        }),
      );
      this.realtimeChanges.clear();
    }
    if (this.presencePending) {
      this.socket.send(
        JSON.stringify({ type: "presence", presence: this.presence }),
      );
      this.presencePending = false;
    }
  }
  private update(values: Partial<Omit<SyncState, "connected">>) {
    if (
      Object.entries(values).every(
        ([key, value]) => this.state[key as keyof SyncState] === value,
      )
    )
      return;
    this.state = {
      ...this.state,
      ...values,
      connected: (values.connection ?? this.state.connection) === "connected",
    };
    this.listeners.forEach((listener) => listener());
  }

  connect() {
    if (this.lifecycle.phase !== "stopped") return;
    this.lifecycle = { phase: "active" };
    this.unsubscribe = this.store.listen(
      (entry) => {
        for (const record of [
          ...Object.values(entry.changes.added),
          ...Object.values(entry.changes.updated).map(([, record]) => record),
        ]) {
          const sanitized = sanitizedRecord(record);
          this.pending.set(record.id, sanitized);
          this.realtimeChanges.set(record.id, sanitized);
        }
        for (const record of Object.values(entry.changes.removed)) {
          this.pending.set(record.id, null);
          this.realtimeChanges.set(record.id, null);
        }
        this.scheduleBroadcast();
        this.schedule();
      },
      { source: "user", scope: "document" },
    );
    if (!this.project.document) {
      for (const record of Object.values(this.store.serialize("document")))
        this.pending.set(record.id, sanitizedRecord(record));
    }
    if (this.pending.size) this.schedule();
    this.realtimeChanges = new Map([...this.inFlight, ...this.pending]);
    queueMicrotask(() => {
      if (!this.stopped) this.openSocket();
    });
    window.addEventListener("online", this.retry);
    window.addEventListener("beforeunload", this.beforeUnload);
    window.addEventListener("blur", this.hidePointer);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }
  disconnect() {
    this.broadcast();
    if (this.lifecycle.phase === "active")
      this.lifecycle = { phase: "stopped" };
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.broadcastTimer);
    this.broadcastTimer = undefined;
    this.socket?.close();
    this.update({ connection: "disconnected" });
    this.peerId = undefined;
    this.peers = new Map();
    this.roomMembers = {
      members: [],
      maxCollaborators: this.roomMembers.maxCollaborators,
    };
    this.changedPresence();
    window.removeEventListener("online", this.retry);
    window.removeEventListener("beforeunload", this.beforeUnload);
    window.removeEventListener("blur", this.hidePointer);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (!this.deleted) void this.persist();
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.pending.size || this.inFlight.size) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  retry = () => {
    if (this.stopped) return;
    void this.flush().catch(() => {});
    if (!this.socket || this.socket.readyState > WebSocket.OPEN)
      this.openSocket();
  };
  private get accessQuery() {
    return this.shareToken === null
      ? ""
      : `?share=${encodeURIComponent(this.shareToken)}`;
  }
  private revokeAccess(reason: CollaborationExit = "closed") {
    if (this.accessRevoked) return;
    this.lifecycle = { phase: "revoked", reason };
    this.pending = new Map([...this.inFlight, ...this.pending]);
    this.inFlight.clear();
    this.realtimeChanges.clear();
    this.presencePending = false;
    this.disconnect();
    this.update({
      status: "error",
      savePhase: "blocked",
      error:
        reason === "removed"
          ? "collaboration.removedTitle"
          : reason === "full"
            ? "collaboration.fullTitle"
            : "canvas.share.linkUnavailable",
    });
    this.onAccessRevoked?.(reason);
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
      await saveDraft(
        canvasDraftKey(this.project.id, this.shareToken),
        this.patch(changes),
      );
    } catch (error) {
      this.update({
        error:
          error instanceof Error ? error : "canvas.cannotSaveLocalRecoveryData",
      });
    }
  }
  private schedule() {
    this.update({
      status: "saving",
      savePhase: this.inFlight.size ? "sending-dirty" : "waiting",
    });
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
    this.update({ status: "saving", savePhase: "sending" });
    this.saving = (async () => {
      try {
        const response = await api<{ revision: number }>(
          `/api/projects/${this.project.id}/document${this.accessQuery}`,
          { method: "PATCH", body: JSON.stringify(patch) },
        );
        if (this.deleted) throw new Error(t("canvas.thisProjectWasDeleted"));
        if (this.accessRevoked)
          throw new Error(t("canvas.share.linkUnavailable"));
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
          savePhase: this.pending.size ? "waiting" : "clean",
          revision: Math.max(response.revision, this.state.revision),
          error: null,
        });
      } catch (error) {
        if (this.deleted || this.accessRevoked) throw error;
        this.pending = new Map([...this.inFlight, ...this.pending]);
        this.inFlight.clear();
        if (
          error instanceof APIError &&
          [
            "COLLABORATION_CLOSED",
            "COLLABORATOR_REMOVED",
            "ROOM_FULL",
          ].includes(error.code)
        ) {
          this.revokeAccess(
            error.code === "COLLABORATOR_REMOVED"
              ? "removed"
              : error.code === "ROOM_FULL"
                ? "full"
                : "closed",
          );
        } else {
          this.update({
            status: "offline",
            savePhase: "retrying",
            error:
              error instanceof Error
                ? error
                : "canvas.connectionToTheLocalServiceInterrupted",
          });
        }
        if (!this.stopped)
          this.timer = setTimeout(() => {
            void this.flush().catch(() => {});
          }, 3000);
        throw error;
      } finally {
        if (!this.deleted) await this.persist();
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
    this.update({ connection: "connecting" });
    socket.onopen = () => {
      if (this.socket !== socket || this.stopped) return;
      this.retryDelay = 1000;
      this.update({ connection: "connected" });
      this.presencePending = true;
      this.scheduleBroadcast();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.stopped) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "peers") {
          this.peerId = message.client_id;
          this.roomMembers = {
            ...this.roomMembers,
            self: (message.peers as CanvasPeer[]).find(
              (peer) => peer.id === this.peerId,
            ),
            maxCollaborators: message.max_collaborators,
          };
          this.peers = new Map(
            (message.peers as CanvasPeer[])
              .filter((peer) => peer.id !== this.peerId)
              .map((peer) => [peer.id, peer]),
          );
          this.changedPresence();
          return;
        }
        if (message.type === "room_full") {
          this.revokeAccess("full");
          return;
        }
        if (message.type === "member_removed") {
          if (
            this.shareToken !== null &&
            (!this.roomMembers.self ||
              this.roomMembers.self.member_id === message.member_id)
          ) {
            this.revokeAccess("removed");
          } else {
            this.peers = new Map(
              [...this.peers].filter(
                ([, peer]) => peer.member_id !== message.member_id,
              ),
            );
            this.changedPresence();
          }
          return;
        }
        if (message.type === "peer_joined" || message.type === "presence") {
          const peer = message.peer as CanvasPeer;
          if (peer.id === this.peerId) return;
          this.peers = new Map(this.peers).set(peer.id, peer);
          this.changedPresence();
          if (message.type === "peer_joined")
            socket.send(
              JSON.stringify({
                type: "scene_init",
                target: peer.id,
                patch: this.patch(
                  new Map([
                    ...this.localChanges(),
                    ...Object.values(this.store.serialize("document")).map(
                      (record) => [record.id, sanitizedRecord(record)] as const,
                    ),
                  ]),
                ),
              }),
            );
          return;
        }
        if (message.type === "peer_left") {
          this.peers = new Map(this.peers);
          this.peers.delete(message.client_id);
          this.changedPresence();
          return;
        }
        if (message.type === "scene_update") {
          if (message.patch.client_id === this.clientId) return;
          const patch = message.patch as RecordPatch;
          this.previewing = true;
          try {
            this.applyRemotePatch(patch);
          } finally {
            this.previewing = false;
          }
          return;
        }
        if (
          message.type === "collaboration" &&
          !message.enabled &&
          this.shareToken !== null
        ) {
          this.revokeAccess();
          return;
        }
        if (message.type === "deleted") {
          this.lifecycle = { phase: "deleted" };
          this.pending.clear();
          this.inFlight.clear();
          this.update({
            status: "error",
            savePhase: "blocked",
            error: "canvas.thisProjectWasDeleted",
          });
          void saveDraft(canvasDraftKey(this.project.id, this.shareToken), {
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
          error: "canvas.canvasSyncFailed",
        });
      }
    };
    socket.onclose = async () => {
      if (this.socket !== socket) return;
      // Keep this socket's identity while its access check is pending.
      this.peerId = undefined;
      this.peers = new Map();
      this.roomMembers = {
        members: [],
        maxCollaborators: this.roomMembers.maxCollaborators,
      };
      this.changedPresence();
      this.update({ connection: "disconnected" });
      if (!this.stopped && this.shareToken !== null) {
        try {
          await api<Project>(
            `/api/projects/${this.project.id}${this.accessQuery}`,
          );
        } catch (error) {
          if (this.socket !== socket || this.stopped) return;
          if (
            error instanceof APIError &&
            [
              "COLLABORATION_CLOSED",
              "COLLABORATOR_REMOVED",
              "ROOM_FULL",
            ].includes(error.code)
          ) {
            this.revokeAccess(
              error.code === "COLLABORATOR_REMOVED"
                ? "removed"
                : error.code === "ROOM_FULL"
                  ? "full"
                  : "closed",
            );
          }
        }
      }
      if (this.socket === socket && !this.stopped && !this.deleted) {
        this.update({ connection: "reconnecting" });
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
  private applyRemotePatch(patch: RecordPatch, revision?: number) {
    const local = this.localChanges();
    if (revision !== undefined) {
      for (const id of patch.remove)
        if (local.has(id))
          this.deferredRemote.set(id, { record: null, revision });
      for (const record of patch.upsert as CanvasRecord[])
        if (local.has(record.id))
          this.deferredRemote.set(record.id, { record, revision });
    }
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
