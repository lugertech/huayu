import {
  configDefaults,
  defineConfig,
  type Plugin,
  lazyPlugins,
} from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { externalFontWasm } from "./build/external-font-wasm";
import { precompressAssets } from "./build/precompress-assets.ts";
import { bundleBudget } from "../../scripts/build/bundle-budget";
import { getDevApiConfig } from "../../scripts/dev-api-config.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const fontsRoot = resolve(
  root,
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
);
const noticesRoot = resolve(root, "../../licenses");
const shellPanelModules =
  /[\\/]src[\\/](?:components[\\/](?:QuickSearch|SettingsDialog)\.tsx$|features[\\/]model-settings[\\/])/;
export function whiteboardAssets(): Plugin {
  return {
    name: "local-whiteboard-fonts",
    configureServer(server) {
      server.middlewares.use(
        "/assets/excalidraw/fonts",
        (request, response, next) => {
          let pathname: string;
          try {
            pathname = decodeURIComponent(
              new URL(request.url || "/", "http://localhost").pathname,
            );
          } catch {
            next();
            return;
          }
          const file = resolve(fontsRoot, "." + pathname);
          if (
            !file.startsWith(fontsRoot + sep) ||
            !/\.(woff2?|ttf|otf)$/.test(file)
          ) {
            next();
            return;
          }
          response.setHeader(
            "Content-Type",
            file.endsWith("woff2") ? "font/woff2" : "application/octet-stream",
          );
          const stream = createReadStream(file);
          stream.on("error", () => {
            response.statusCode = 404;
            response.end();
          });
          stream.pipe(response);
        },
      );
    },
    generateBundle() {
      for (const notice of readdirSync(noticesRoot, { withFileTypes: true })) {
        if (notice.isFile())
          this.emitFile({
            type: "asset",
            fileName: `assets/licenses/${notice.name}`,
            source: readFileSync(resolve(noticesRoot, notice.name)),
          });
      }
      this.emitFile({
        type: "asset",
        fileName: "assets/licenses/Huayu-MIT.txt",
        source: readFileSync(resolve(root, "../../LICENSE")),
      });
      for (const name of readdirSync(fontsRoot, {
        recursive: true,
        encoding: "utf8",
      })) {
        if (/\.(woff2?|ttf|otf)$/.test(name))
          this.emitFile({
            type: "asset",
            fileName: `assets/excalidraw/fonts/${name.split(sep).join("/")}`,
            source: readFileSync(resolve(fontsRoot, name)),
          });
      }
    },
  };
}

const config = defineConfig({
  root,
  test: {
    name: "web",
    exclude: [...configDefaults.exclude, "**/*.browser.test.tsx"],
    setupFiles: ["src/i18n/test-setup.ts"],
  },
  envDir: resolve(root, "../.."),
  plugins: lazyPlugins(() => [
    react(),
    tailwindcss(),
    whiteboardAssets(),
    precompressAssets(),
    externalFontWasm(
      resolve(
        root,
        "node_modules/@excalidraw/excalidraw/dist/prod/subset-worker.chunk.js",
      ),
    ),
    bundleBudget({
      initialGzipLimit: 219_000,
      // These dependencies each ship one indivisible ES module.
      vendorLimits: [
        {
          test: /[\\/]node_modules[\\/]@excalidraw[\\/]excalidraw[\\/]/,
          bytes: 520_000,
        },
        {
          test: /[\\/]node_modules[\\/]@pdf-lib[\\/]fontkit[\\/]/,
          bytes: 750_000,
        },
        {
          test: /[\\/]node_modules[\\/]@mermaid-js[\\/]parser[\\/]/,
          bytes: 700_000,
        },
      ],
      deferredModules: [
        /[\\/]node_modules[\\/](?:@excalidraw[\\/]excalidraw|@pdf-lib[\\/]fontkit|pdf-lib|docx|mermaid|@mermaid-js[\\/]parser)[\\/]/,
        /[\\/]node_modules[\\/]react-dom[\\/](?:server|static|cjs[\\/]react-dom-(?:server|static))/,
        /[\\/]src[\\/]components[\\/]ui[\\/]tooltip\.tsx$/,
        shellPanelModules,
      ],
      deferredEntries: [/^\0huayu:font-worker$/],
    }),
  ]),
  resolve: { alias: { "@": resolve(root, "src") } },
  define: {
    __HUAYU_DEV_API_ORIGIN__: JSON.stringify(""),
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [resolve(root, "../..")] },
  },
  build: {
    chunkSizeWarningLimit: 750,
    modulePreload: {
      resolveDependencies(_url, dependencies, { hostId }) {
        // A module worker has no document for DOM-based preload links.
        return hostId.includes("excalidraw-font-worker") ? [] : dependencies;
      },
    },
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            // Merge only existing static dependencies; keep feature imports lazy.
            {
              name: "app",
              tags: ["$initial"],
              // Keep page/Worker entry side effects out of shared chunks.
              test: /[\\/]src[\\/](?!main\.tsx$)|[\\/]node_modules[\\/]/,
              priority: 5,
              includeDependenciesRecursively: false,
            },
            {
              name: "ui-primitives",
              tags: ["$initial"],
              test: /[\\/]node_modules[\\/](?:@base-ui[\\/]react|@floating-ui[\\/][^\\/]+|react-remove-scroll(?:-bar)?|react-style-singleton|aria-hidden|tabbable)[\\/]/,
              priority: 25,
              includeDependenciesRecursively: false,
            },
            {
              name: "client-runtime",
              tags: ["$initial"],
              test: /[\\/]node_modules[\\/](?:react|react-router|react-router-dom|scheduler|tailwind-merge|clsx)[\\/]|[\\/]node_modules[\\/]react-dom[\\/](?!server|static|cjs[\\/]react-dom-(?:server|static))/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: "shell-panels",
              test: shellPanelModules,
              priority: 10,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
            {
              name: "excalidraw",
              test: /[\\/]node_modules[\\/]@excalidraw[\\/]excalidraw[\\/]/,
              priority: 20,
              maxSize: 450_000,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
});

export default defineConfig(({ command }) => {
  if (command === "build") return config;
  const api = getDevApiConfig(resolve(root, "../.."));
  return {
    ...config,
    define: {
      ...config.define,
      __HUAYU_DEV_API_ORIGIN__: JSON.stringify(api.origin),
    },
    server: {
      ...config.server,
      proxy: {
        "/api": { target: api.origin, ws: true, xfwd: true },
        "/uploads": api.origin,
      },
    },
  };
});
