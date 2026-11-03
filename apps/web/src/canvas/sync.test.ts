import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Project } from "@/api/client";
import { Editor, createCanvasStore } from "@/canvas/editor";
import { CanvasSync, documentSnapshot } from "./sync";

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
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  constructor(readonly url: string) {
    TestSocket.instances.push(this);
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const active: CanvasSync[] = [];
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
) {
  const record = sync.store.get(id)!;
  return {
    type: "patch",
    revision,
    patch: {
      upsert: [{ ...record, props: { ...record.props, text } }],
      remove: [],
      client_id: "another-browser",
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
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

describe("collaboration save ordering and recovery", () => {
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
