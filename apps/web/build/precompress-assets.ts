import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";
import type { Plugin } from "vite-plus";

const compress = promisify(brotliCompress);

/** Compress immutable build output once, rather than on each request. */
export function precompressAssets(): Plugin {
  return {
    name: "huayu-precompress-assets",
    apply: "build",
    async writeBundle(options, bundle) {
      if (!options.dir)
        throw new Error("Static compression requires an output directory.");
      const directory = options.dir;
      await Promise.all(
        Object.values(bundle).map(async (file) => {
          if (!/\.(?:js|css)$/.test(file.fileName)) return;
          const source = file.type === "chunk" ? file.code : file.source;
          if (Buffer.byteLength(source) < 1024) return;
          const compressed = await compress(source, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          });
          await writeFile(
            resolve(directory, `${file.fileName}.br`),
            compressed,
          );
        }),
      );
    },
  };
}
