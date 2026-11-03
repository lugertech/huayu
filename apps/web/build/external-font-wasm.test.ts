import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vite-plus/test";
import { externalFontWasm } from "./external-font-wasm";

interface WasmAsset {
  type: "asset";
  name: string;
  source: Uint8Array;
}

const moduleId =
  "/workspace/node_modules/@excalidraw/excalidraw/dist/prod/fonts.js";
const first = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const second = Buffer.from([...first, 0, 1, 0]);
const source = `const first = decode("${first.toString("base64")}");
const second = decode('${second.toString("base64")}');`;

function transform(code = source, id = moduleId) {
  const assets: WasmAsset[] = [];
  const emitFile = vi.fn((asset: WasmAsset) => {
    assets.push(asset);
    return `wasm${assets.length - 1}`;
  });
  const result = externalFontWasm(moduleId).transform.call(
    { emitFile },
    code,
    id,
  );
  return { result, assets, emitFile };
}

function execute(code: string, fetch: typeof globalThis.fetch) {
  const executable = code.replace(
    /import\.meta\.ROLLUP_FILE_URL_(wasm\d+)/g,
    '"$1.wasm"',
  );
  return new Function(
    "fetch",
    `return (async () => { ${executable}; return [first, second]; })();`,
  )(fetch) as Promise<Uint8Array[]>;
}

describe("Excalidraw font WebAssembly assets", () => {
  it("keeps the worker URL pointing to an executable entry after chunking", () => {
    const workerFile = moduleId.replace("fonts.js", "subset-worker.chunk.js");
    const plugin = externalFontWasm(workerFile);
    const emitFile = vi.fn(() => "worker0");
    plugin.buildStart.call({ emitFile });
    expect(emitFile).toHaveBeenCalledWith({
      type: "chunk",
      id: "\0huayu:font-worker",
      name: "excalidraw-font-worker",
      preserveSignature: "strict",
    });
    const result = plugin.transform.call(
      { emitFile },
      "const url = new URL(import.meta.url);",
      workerFile,
    );
    expect(result.code).toContain("import.meta.ROLLUP_FILE_URL_worker0");
    expect(result.code).not.toContain("new URL(import.meta.url)");
  });

  it("preserves worker messages received while font binaries are loading", async () => {
    const workerFile = moduleId.replace("fonts.js", "subset-worker.chunk.js");
    const plugin = externalFontWasm(workerFile);
    const bootstrap = plugin.load.call({}, "\0huayu:font-worker");
    const executable = bootstrap.replace(
      `await import(${JSON.stringify(workerFile)});`,
      "await loadWorker();",
    );
    let completeInitialization: () => void;
    const initialization = new Promise<void>((resolve) => {
      completeInitialization = resolve;
    });
    const scope = { onmessage: null as ((event: unknown) => void) | null };
    const run = new Function(
      "self",
      "loadWorker",
      `return (async () => { ${executable} })();`,
    )(scope, () => initialization) as Promise<void>;
    const early = { data: { arrayBuffer: first.buffer } };
    scope.onmessage(early);
    const handler = vi.fn();
    scope.onmessage = handler;
    completeInitialization();
    await run;
    expect(handler).toHaveBeenCalledExactlyOnceWith(early);
    const later = { data: { arrayBuffer: second.buffer } };
    scope.onmessage(later);
    expect(handler).toHaveBeenLastCalledWith(later);
  });

  it("only transforms the pinned package's production modules", () => {
    for (const id of [
      "/workspace/src/fonts.js",
      "/workspace/node_modules/other/dist/prod/fonts.js",
      "/workspace/node_modules/@excalidraw/excalidraw/dist/dev/fonts.js",
    ]) {
      const { result, emitFile } = transform(source, id);
      expect(result).toBeUndefined();
      expect(emitFile).not.toHaveBeenCalled();
    }
  });

  it("leaves modules without inline WebAssembly unchanged", () => {
    const { result, emitFile } = transform('const text = decode("hello");');
    expect(result).toBeUndefined();
    expect(emitFile).not.toHaveBeenCalled();
  });

  it("retains the exact binary contents as emitted assets", () => {
    const { result, assets } = transform();
    expect(assets.map((asset) => asset.source)).toEqual([first, second]);
    expect(result.code).not.toContain(first.toString("base64"));
    expect(result.code).not.toContain(second.toString("base64"));
    for (const asset of assets) {
      expect(asset.name).toBe("excalidraw-font.wasm");
      expect(WebAssembly.validate(new Uint8Array(asset.source))).toBe(true);
    }
  });

  it("loads both assets concurrently and preserves Uint8Array values", async () => {
    let completeFirst: (response: Response) => void;
    const firstRequest = new Promise<Response>((resolve) => {
      completeFirst = resolve;
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(new Response(second));
    const { result } = transform();
    const pending = execute(result.code, fetch);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "wasm0.wasm",
      "wasm1.wasm",
    ]);
    completeFirst(new Response(first));
    const binaries = await pending;
    expect(binaries).toEqual([new Uint8Array(first), new Uint8Array(second)]);
    expect(binaries.every((binary) => binary instanceof Uint8Array)).toBe(true);
  });

  it("rejects failed requests instead of passing an error page to WebAssembly", async () => {
    const { result } = transform();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(execute(result.code, fetch)).rejects.toThrow(
      "Unable to load drawing fonts.",
    );
  });
});
