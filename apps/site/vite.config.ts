import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { bundleBudget } from "../../scripts/build/bundle-budget";

const base = process.env.SITE_BASE || "/";
if (!base.startsWith("/") || !base.endsWith("/") || base.includes(".."))
  throw new Error("SITE_BASE must be an absolute path ending in /.");

export default defineConfig({
  base,
  plugins: lazyPlugins(() => [
    react(),
    bundleBudget({ initialGzipLimit: 215_000 }),
  ]),
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "ui-runtime",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5863,
    strictPort: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
  },
  preview: { host: "127.0.0.1", port: 5863, strictPort: true },
});
