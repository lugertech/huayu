import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { APIError, type Project } from "@/api/client";
import { Editor, createCanvasStore } from "@/features/canvas/editor";
import { CanvasSync, documentSnapshot, type CanvasPeer } from "./sync";

const mocks = vi.hoisted(() => ({ api: vi.fn(), saveDraft: vi.fn() }));
vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  api: mocks.api,
}));
vi.mock("./drafts", async (original) => ({
  ...(await original<typeof import("./drafts")>()),
  saveDraft: mocks.saveDraft,
}));

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 1;
  onopen?: () => void;
  onclose?: () => void | Promise<void>;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  constructor(readonly url: string) {
    TestSocket.instances.push(this);
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close() {
    this.readyState = 3;
    return this.onclose?.();
  }
}

const active: CanvasSync[] = [];
const joiningPeer: CanvasPeer = {
  id: "11111111-1111-4111-8111-111111111111",
  member_id: "joining-member",
  role: "collaborator",
  joined_at: 1,
  pointer: null,
  button: "up",
  selectedElementIds: {},
};
async function client(token: string | null = null) {
  const source = new Editor(createCanvasStore());
  source.createShape({
    id: "shape:left",
    type: "ai-text",
    props: { text: "Left" },
  });
  source.createShape({
    id: "shape:right",
    type: "ai-text",
    props: { text: "Right" },
  });
  const project: Project = {
    id: "collaboration-test",
    name: "Collaboration",
    document: documentSnapshot(source.store),
    cover: null,
    recipe: null,
    revision: 0,
    is_collaborative: true,
    share_token: token,
    created_at: "2026-11-03T00:00:00Z",
    updated_at: "2026-11-03T00:00:00Z",
  };
  const sync = new CanvasSync(project, undefined, token);
  active.push(sync);
  sync.connect();
  await Promise.resolve();
  const socket = TestSocket.instances.at(-1)!;
  socket.onopen?.();
  return { sync, socket, editor: new Editor(sync.store) };
}

function acknowledgement() {
  let resolve!: (value: { revision: number }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ revision: number }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function remoteText(
  sync: CanvasSync,
  id: string,
  text: string,
  revision: number,
  sequence?: number,
) {
  const record = sync.store.get(id)!;
  return {
    type: "patch",
    revision,
    patch: {
      upsert: [{ ...record, props: { ...record.props, text } }],
      remove: [],
      client_id: "another-browser",
      sequence,
    },
  };
}

function liveText(sync: CanvasSync, text: string, sequence: number) {
  return {
    type: "scene_update",
    client_id: "remote-connection",
    target: null,
    patch: remoteText(sync, "shape:left", text, 0, sequence).patch,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("location", { protocol: "http:", host: "127.0.0.1:5858" });
  vi.stubGlobal("WebSocket", TestSocket);
  TestSocket.instances = [];
  mocks.api.mockReset().mockResolvedValue({ revision: 1 });
  mocks.saveDraft.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  for (const sync of active.splice(0)) sync.disconnect();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("collaboration scene initialization", () => {
  it("does not retransmit a saved board larger than the live message limit", async () => {
    const { sync, socket, editor } = await client();
    sync.store.mergeRemoteChanges(() => {
      editor.updateShape({
        id: "shape:left",
        props: { text: "a".repeat(32 * 1024 * 1024) },
      });
    });
    expect(
      new Blob([JSON.stringify(documentSnapshot(sync.store))]).size,
    ).toBeGreaterThan(32 * 1024 * 1024);
    socket.receive({ type: "peer_joined", peer: joiningPeer });
    const initializations = socket.send.mock.calls.filter(
      ([data]) => JSON.parse(data).type === "scene_init",
    );
    expect(initializations.length).toBe(0);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("sends only unsaved records and deletions to a joining member", async () => {
    const { sync, socket, editor } = await client();
    editor.updateShape({ id: "shape:left", props: { text: "Unsaved" } });
    editor.deleteShape("shape:right");
    socket.receive({ type: "peer_joined", peer: joiningPeer });
    const message = socket.send.mock.calls
      .map(([data]) => JSON.parse(data))
      .find((message) => message.type === "scene_init");
    expect(message.target).toBe(joiningPeer.id);
    expect(
      message.patch.upsert.map((record: { id: string }) => record.id),
    ).toEqual(["shape:left"]);
    expect(message.patch.upsert[0].props.text).toBe("Unsaved");
    expect(message.patch.remove).toEqual(["shape:right"]);
    expect(sync.getSnapshot().savePhase).toBe("waiting");
  });

  it("includes records still waiting for their HTTP save acknowledgement", async () => {
    const { sync, socket, editor } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "Sending" } });
    const saving = sync.flush();
    socket.receive({ type: "peer_joined", peer: joiningPeer });
    const message = socket.send.mock.calls
      .map(([data]) => JSON.parse(data))
      .find((message) => message.type === "scene_init");
    expect(
      message.patch.upsert.map((record: { id: string }) => record.id),
    ).toEqual(["shape:left"]);
    expect(message.patch.upsert[0].props.text).toBe("Sending");
    ack.resolve({ revision: 1 });
    await saving;
    expect(sync.getSnapshot().savePhase).toBe("clean");
  });
});

describe("live previews ahead of their durable save", () => {
  it("keeps a joining member's newer text and deletion when an earlier save commits", async () => {
    const { sync, socket, editor } = await client();
    const right = sync.store.get("shape:right")!;
    const preview = liveText(sync, "Latest unsaved text", 2);
    preview.patch.remove = ["shape:right"];
    socket.receive(preview);
    const earlier = remoteText(sync, "shape:left", "Earlier saved text", 1, 1);
    earlier.patch.upsert.push({
      ...right,
      props: { ...right.props, text: right.props.text },
    });
    socket.receive(earlier);
    expect(editor.getShape("shape:left").props.text).toBe(
      "Latest unsaved text",
    );
    expect(editor.getShape("shape:right")).toBeUndefined();
    expect(sync.getSnapshot().revision).toBe(1);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("still applies records that were not part of the newer preview", async () => {
    const { sync, socket, editor } = await client();
    socket.receive(liveText(sync, "Latest unsaved text", 2));
    const earlier = remoteText(sync, "shape:left", "Earlier saved text", 1, 1);
    const right = sync.store.get("shape:right")!;
    earlier.patch.upsert.push({
      ...right,
      props: { ...right.props, text: "Saved right" },
    });
    socket.receive(earlier);
    expect(editor.getShape("shape:left").props.text).toBe(
      "Latest unsaved text",
    );
    expect(editor.getShape("shape:right").props.text).toBe("Saved right");
  });

  it("accepts the newer save and subsequent edits from another member", async () => {
    const { sync, socket, editor } = await client();
    socket.receive(liveText(sync, "Unsaved", 2));
    socket.receive(remoteText(sync, "shape:left", "Newer saved text", 2, 3));
    expect(editor.getShape("shape:left").props.text).toBe("Newer saved text");
    const another = remoteText(sync, "shape:left", "Another member", 3, 1);
    another.patch.client_id = "third-browser";
    socket.receive(another);
    expect(editor.getShape("shape:left").props.text).toBe("Another member");
  });

  it("does not replace a newer preview with an older preview from the same editor", async () => {
    const { sync, socket, editor } = await client();
    socket.receive(liveText(sync, "Latest", 3));
    socket.receive(liveText(sync, "Older", 2));
    expect(editor.getShape("shape:left").props.text).toBe("Latest");
  });

  it("releases a departed connection's preview guard before its final save arrives", async () => {
    const { sync, socket, editor } = await client();
    socket.receive(liveText(sync, "Unsaved", 2));
    socket.receive({ type: "peer_left", client_id: "remote-connection" });
    socket.receive(remoteText(sync, "shape:left", "Final saved text", 1, 1));
    expect(editor.getShape("shape:left").props.text).toBe("Final saved text");
  });

  it("keeps a save's edit sequence stable while later edits are broadcast", async () => {
    const { sync, socket, editor } = await client();
    const ack = acknowledgement();
    mocks.api
      .mockReturnValueOnce(ack.promise)
      .mockResolvedValueOnce({ revision: 2 });
    editor.updateShape({ id: "shape:left", props: { text: "First" } });
    const saving = sync.flush();
    const first = JSON.parse(mocks.api.mock.calls[0][1].body);
    expect(typeof first.sequence).toBe("number");
    editor.updateShape({
      id: "shape:left",
      props: { text: "Later unsaved text" },
    });
    socket.receive({ type: "peer_joined", peer: joiningPeer });
    const initialization = socket.send.mock.calls
      .map(([data]) => JSON.parse(data))
      .find((message) => message.type === "scene_init");
    expect(initialization.patch.sequence).toBeGreaterThan(first.sequence);
    expect(JSON.parse(mocks.api.mock.calls[0][1].body).sequence).toBe(
      first.sequence,
    );
    ack.resolve({ revision: 1 });
    await saving;
    expect(JSON.parse(mocks.api.mock.calls[1][1].body).sequence).toBe(
      initialization.patch.sequence,
    );
  });
});

describe("collaboration save ordering and recovery", () => {
  it.each(["success", "revoked"])(
    "ignores an old connection's late %s after a replacement connects",
    async (outcome) => {
      const { sync, socket } = await client("shared");
      const permission = acknowledgement();
      mocks.api.mockReturnValueOnce(permission.promise);
      const closing = socket.close();
      sync.retry();
      const replacement = TestSocket.instances.at(-1)!;
      expect(replacement).not.toBe(socket);
      replacement.onopen?.();
      if (outcome === "success") permission.resolve({ revision: 0 });
      else
        permission.reject(
          new APIError("Old access response", 403, "COLLABORATION_CLOSED"),
        );
      await closing;
      await vi.advanceTimersByTimeAsync(2000);
      expect(sync.getSnapshot()).toMatchObject({
        connected: true,
        connection: "connected",
        error: null,
      });
      expect(replacement.readyState).toBe(TestSocket.OPEN);
      expect(TestSocket.instances).toHaveLength(2);
    },
  );

  it("still reconnects when the closed socket has not been replaced", async () => {
    const { sync, socket } = await client("shared");
    await socket.close();
    expect(sync.getSnapshot().connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    expect(TestSocket.instances).toHaveLength(2);
    TestSocket.instances.at(-1)!.onopen?.();
    expect(sync.getSnapshot().connected).toBe(true);
  });

  it("distinguishes new edits made while an earlier patch is sending", async () => {
    const { sync, editor } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "first" } });
    expect(sync.getSnapshot().savePhase).toBe("waiting");
    const saving = sync.flush();
    expect(sync.getSnapshot().savePhase).toBe("sending");
    editor.updateShape({ id: "shape:right", props: { text: "second" } });
    expect(sync.getSnapshot().savePhase).toBe("sending-dirty");
    ack.resolve({ revision: 1 });
    await saving;
    expect(sync.getSnapshot().savePhase).toBe("clean");
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("does not reconnect a revoked session or replace its error with a late save", async () => {
    const { sync, editor, socket } = await client("shared");
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "pending" } });
    const saving = sync.flush();
    socket.receive({ type: "collaboration", enabled: false });
    sync.connect();
    sync.retry();
    ack.resolve({ revision: 1 });
    await expect(saving).rejects.toThrow();
    expect(sync.getSnapshot()).toMatchObject({
      status: "error",
      connected: false,
    });
    expect(TestSocket.instances).toHaveLength(1);
  });
  it("applies a later remote edit after an earlier local save acknowledgement", async () => {
    const { sync, editor, socket } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "Local" } });
    const saving = sync.flush();
    socket.receive(remoteText(sync, "shape:left", "Remote wins", 2));
    expect(editor.getShape("shape:left").props.text).toBe("Local");
    ack.resolve({ revision: 1 });
    await saving;
    expect(editor.getShape("shape:left").props.text).toBe("Remote wins");
    expect(sync.getSnapshot()).toMatchObject({ status: "saved", revision: 2 });
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it("keeps a local save received by the server after the remote edit", async () => {
    const { sync, editor, socket } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "Local wins" } });
    const saving = sync.flush();
    socket.receive(remoteText(sync, "shape:left", "Earlier remote", 2));
    ack.resolve({ revision: 3 });
    await saving;
    expect(editor.getShape("shape:left").props.text).toBe("Local wins");
  });

  it("preserves newer unsent typing until its own save completes", async () => {
    const { sync, editor, socket } = await client();
    const ack = acknowledgement();
    mocks.api
      .mockReturnValueOnce(ack.promise)
      .mockResolvedValueOnce({ revision: 3 });
    editor.updateShape({ id: "shape:left", props: { text: "First local" } });
    const saving = sync.flush();
    socket.receive(remoteText(sync, "shape:left", "Remote", 2));
    editor.updateShape({ id: "shape:left", props: { text: "Newer local" } });
    ack.resolve({ revision: 1 });
    await saving;
    expect(editor.getShape("shape:left").props.text).toBe("Newer local");
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("reconciles a reconnect snapshot received before the pending acknowledgement", async () => {
    const { sync, editor, socket } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "Local" } });
    const saving = sync.flush();
    const document = structuredClone(documentSnapshot(sync.store));
    const record = sync.store.get("shape:left")!;
    document.store[record.id] = {
      ...record,
      props: { ...record.props, text: "Snapshot wins" },
    };
    socket.receive({ type: "snapshot", document, revision: 2 });
    ack.resolve({ revision: 1 });
    await saving;
    expect(editor.getShape("shape:left").props.text).toBe("Snapshot wins");
  });

  it("applies a remote deletion received after the local save", async () => {
    const { sync, editor, socket } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "Local" } });
    const saving = sync.flush();
    socket.receive({
      type: "patch",
      revision: 2,
      patch: { upsert: [], remove: ["shape:left"], client_id: "remote" },
    });
    ack.resolve({ revision: 1 });
    await saving;
    expect(editor.getShape("shape:left")).toBeUndefined();
  });

  it("retains offline changes and submits them after recovery", async () => {
    const { sync, editor, socket } = await client();
    const ack = acknowledgement();
    mocks.api.mockReturnValueOnce(ack.promise);
    editor.updateShape({ id: "shape:left", props: { text: "Offline draft" } });
    const saving = sync.flush();
    const failure = expect(saving).rejects.toThrow("Offline");
    socket.receive(remoteText(sync, "shape:left", "Earlier remote", 2));
    ack.reject(new Error("Offline"));
    await failure;
    expect(sync.getSnapshot().status).toBe("offline");
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(
      sync.project.id,
      expect.objectContaining({
        upsert: expect.arrayContaining([
          expect.objectContaining({
            props: expect.objectContaining({ text: "Offline draft" }),
          }),
        ]),
      }),
    );
    mocks.api.mockResolvedValueOnce({ revision: 3 });
    await sync.flush();
    expect(editor.getShape("shape:left").props.text).toBe("Offline draft");
    expect(sync.getSnapshot().status).toBe("saved");
  });

  it("does not echo remote changes or apply outdated room patches", async () => {
    const { sync, editor, socket } = await client();
    socket.receive(remoteText(sync, "shape:right", "Latest", 2));
    socket.receive(remoteText(sync, "shape:right", "Outdated", 1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(editor.getShape("shape:right").props.text).toBe("Latest");
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("carries the shared token and stops saving/reconnecting when access is revoked", async () => {
    const { sync, editor, socket } = await client("invite token");
    expect(socket.url).toContain("/events?share=invite%20token");
    editor.updateShape({ id: "shape:left", props: { text: "Shared edit" } });
    await sync.flush();
    expect(mocks.api.mock.calls[0][0]).toContain(
      "/document?share=invite%20token",
    );
    const revoked = vi.fn();
    sync.onAccessRevoked = revoked;
    socket.receive({ type: "collaboration", enabled: false });
    await expect(sync.flush()).rejects.toThrow("协作链接已关闭或失效");
    await vi.advanceTimersByTimeAsync(10000);
    expect(revoked).toHaveBeenCalledOnce();
    expect(socket.readyState).toBe(3);
    expect(TestSocket.instances).toHaveLength(1);
  });
});

it("flushes a pending edit on navigation and leaves other tabs' recovery data alone on a clean exit", async () => {
  const idle = await client();
  idle.sync.disconnect();
  expect(mocks.saveDraft).not.toHaveBeenCalled();
  const { sync, editor } = await client();
  editor.updateShape({
    id: "shape:left",
    props: { text: "Just before leaving" },
  });
  sync.disconnect();
  await sync.flush();
  expect(mocks.api).toHaveBeenCalledTimes(1);
  expect(mocks.saveDraft).toHaveBeenLastCalledWith(
    sync.project.id,
    expect.objectContaining({
      upsert: [
        expect.objectContaining({
          id: "shape:left",
          props: expect.objectContaining({ text: "Just before leaving" }),
        }),
      ],
    }),
    "acknowledged",
  );
});

it("retries a failed recovery write if the server cannot save the edit either", async () => {
  const { sync, editor } = await client();
  mocks.saveDraft.mockRejectedValueOnce(
    new Error("IndexedDB temporarily unavailable"),
  );
  editor.updateShape({ id: "shape:left", props: { text: "Keep this edit" } });
  await Promise.resolve();
  mocks.api.mockRejectedValueOnce(new Error("Offline"));
  await expect(sync.flush()).rejects.toThrow("Offline");
  expect(mocks.saveDraft).toHaveBeenCalledTimes(2);
  expect(mocks.saveDraft.mock.calls[1][1].upsert[0].props.text).toBe(
    "Keep this edit",
  );
});
