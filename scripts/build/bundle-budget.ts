import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite-plus";

interface BundleBudgetOptions {
  initialGzipLimit: number;
  vendorLimits?: { test: RegExp; bytes: number }[];
  deferredModules?: RegExp[];
  deferredEntries?: RegExp[];
}

export function bundleBudget({
  initialGzipLimit,
  vendorLimits = [],
  deferredModules = [],
  deferredEntries = [],
}: BundleBudgetOptions): Plugin {
  return {
    name: "huayu-bundle-budget",
    apply: (_config, env) => env.command === "build" && !env.isSsrBuild,
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const chunks = Object.values(bundle).filter(
          (entry) => entry.type === "chunk",
        );
        const initial = new Set<string>();
        function visit(file: string) {
          if (initial.has(file)) return;
          const chunk = bundle[file];
          if (!chunk || chunk.type !== "chunk") return;
          initial.add(file);
          chunk.imports.forEach(visit);
        }
        chunks
          .filter(
            (chunk) =>
              chunk.isEntry &&
              !deferredEntries.some((pattern) =>
                pattern.test(chunk.facadeModuleId || ""),
              ),
          )
          .forEach((chunk) => visit(chunk.fileName));
        const sizes = chunks.map((chunk) => {
          const modules = Object.keys(chunk.modules);
          const limit =
            vendorLimits.find(
              (vendor) =>
                modules.length && modules.every((id) => vendor.test.test(id)),
            )?.bytes ?? 500_000;
          const bytes = Buffer.byteLength(chunk.code);
          const gzipBytes = gzipSync(chunk.code).length;
          if (bytes > limit)
            this.error(
              `${chunk.fileName}: ${bytes} bytes exceeds its ${limit}-byte budget.`,
            );
          if (
            initial.has(chunk.fileName) &&
            modules.some((id) =>
              [...deferredModules, ...deferredEntries].some((pattern) =>
                pattern.test(id),
              ),
            )
          )
            this.error(
              `${chunk.fileName}: an on-demand dependency entered the initial bundle.`,
            );
          return {
            file: chunk.fileName,
            bytes,
            gzipBytes,
            limit,
            initial: initial.has(chunk.fileName),
          };
        });
        const initialGzipBytes = sizes
          .filter((chunk) => chunk.initial)
          .reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
        if (initialGzipBytes > initialGzipLimit)
          this.error(
            `Initial JavaScript: ${initialGzipBytes} gzip bytes exceeds its ${initialGzipLimit}-byte budget.`,
          );
        this.emitFile({
          type: "asset",
          fileName: "bundle-budget.json",
          source: JSON.stringify(
            { initialGzipBytes, initialGzipLimit, chunks: sizes },
            null,
            2,
          ),
        });
      },
    },
  };
}
