import { Buffer } from "node:buffer";
import type { Plugin } from "vite-plus";

const workerEntry = "\0huayu:font-worker";

export function externalFontWasm(workerFile: string) {
  let workerReference: string;
  return {
    name: "huayu-external-font-wasm",
    apply: "build",
    buildStart() {
      workerReference = this.emitFile({
        type: "chunk",
        id: workerEntry,
        name: "excalidraw-font-worker",
        preserveSignature: "strict",
      });
    },
    resolveId(id) {
      if (id === workerEntry) return workerEntry;
    },
    load(id) {
      if (id !== workerEntry) return;
      // A module worker can receive messages while its async font module loads.
      return `const pending = [];
const queue = (event) => pending.push(event);
self.onmessage = queue;
await import(${JSON.stringify(workerFile)});
const handler = self.onmessage;
if (!handler || handler === queue) throw new Error("Drawing font worker did not initialize.");
for (const event of pending) handler.call(self, event);
pending.length = 0;`;
    },
    transform(code, id) {
      if (
        !/[\\/]node_modules[\\/]@excalidraw[\\/]excalidraw[\\/]dist[\\/]prod[\\/].*\.js$/.test(
          id,
        )
      )
        return;

      // The worker also imports its own URL from this module on the main thread.
      // Keep that URL pointing to an executable entry after manual chunking.
      let rewritten = code;
      if (/[\\/]subset-worker\.chunk\.js$/.test(id) && workerReference)
        rewritten = rewritten.replace(
          "new URL(import.meta.url)",
          `new URL(import.meta.ROLLUP_FILE_URL_${workerReference}, import.meta.url)`,
        );
      const references: string[] = [];
      // Excalidraw 0.18.1 embeds its font codecs as base64-decoder calls.
      rewritten = rewritten.replace(
        /\b[\w$]+\(\s*(["'])(AGFzbQ[A-Za-z0-9+/]*={0,2})\1\s*\)/g,
        (_match, _quote: string, data: string) => {
          const index = references.length;
          references.push(
            this.emitFile({
              type: "asset",
              name: "excalidraw-font.wasm",
              source: Buffer.from(data, "base64"),
            }),
          );
          return `__huayuFontWasm${index}`;
        },
      );
      if (!references.length)
        return rewritten === code ? undefined : { code: rewritten, map: null };

      const bindings = references.map((_, index) => `__huayuFontWasm${index}`);
      const requests = references.map(
        (reference) =>
          `__huayuLoadFontWasm(import.meta.ROLLUP_FILE_URL_${reference})`,
      );
      return {
        code: `async function __huayuLoadFontWasm(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load drawing fonts.");
  return new Uint8Array(await response.arrayBuffer());
}
const [${bindings.join(",")}] = await Promise.all([${requests.join(",")}]);
${rewritten}`,
        map: null,
      };
    },
  } satisfies Plugin;
}
