import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { build } from "vite-plus";
import { expect, it } from "vite-plus/test";
import { precompressAssets } from "./precompress-assets.ts";

it("emits Brotli alternatives that decode to the built JS and CSS, preserving the originals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "huayu-compression-"));
  try {
    await build({
      root: directory,
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "compression-fixture",
          resolveId: (id) => (id === "fixture" ? "\0fixture" : undefined),
          load: (id) =>
            id === "\0fixture"
              ? `console.log(${JSON.stringify("Huayu canvas ".repeat(200))});`
              : undefined,
          generateBundle() {
            this.emitFile({
              type: "asset",
              fileName: "app.css",
              source: ".canvas { color: #123456; }\n".repeat(100),
            });
            this.emitFile({
              type: "asset",
              fileName: "icon.svg",
              source: '<svg xmlns="http://www.w3.org/2000/svg"/>',
            });
          },
        },
        precompressAssets(),
      ],
      build: {
        outDir: directory,
        emptyOutDir: false,
        minify: false,
        rolldownOptions: {
          input: "fixture",
          output: { entryFileNames: "app.js" },
        },
      },
    });
    for (const file of ["app.js", "app.css"]) {
      const original = await readFile(join(directory, file));
      const compressed = await readFile(join(directory, `${file}.br`));
      expect(brotliDecompressSync(compressed)).toEqual(original);
      expect(compressed.length).toBeLessThan(original.length);
    }
    await expect(stat(join(directory, "icon.svg.br"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
