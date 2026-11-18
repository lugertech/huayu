import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createServer as createViteServer } from "vite-plus";
import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDevApiConfig } from "../../scripts/dev-api-config.ts";
import definition, { whiteboardAssets } from "./vite.config";

vi.mock("../../scripts/dev-api-config.ts", () => ({
  getDevApiConfig: vi.fn(() => ({
    host: "192.0.2.4",
    port: 9000,
    origin: "http://192.0.2.4:9000",
  })),
}));

async function configFor(command: "serve" | "build") {
  const config: unknown = definition;
  return typeof config === "function"
    ? await config({ command, mode: "development" })
    : config;
}

describe("development backend configuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shares the configured backend origin with both proxies and the client guard", async () => {
    expect(await configFor("serve")).toMatchObject({
      server: {
        proxy: {
          "/api": { target: "http://192.0.2.4:9000", ws: true, xfwd: true },
          "/uploads": "http://192.0.2.4:9000",
        },
      },
      define: {
        __HUAYU_DEV_API_ORIGIN__: JSON.stringify("http://192.0.2.4:9000"),
      },
    });
    expect(getDevApiConfig).toHaveBeenCalledTimes(1);
  });

  it("keeps development backend addresses out of production builds", async () => {
    expect(await configFor("build")).toMatchObject({
      define: { __HUAYU_DEV_API_ORIGIN__: JSON.stringify("") },
    });
    expect(getDevApiConfig).not.toHaveBeenCalled();
  });

  it("forwards API and upload requests to the selected backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "huayu-dev-proxy-"));
    const backend = createServer((request, response) =>
      response.end(request.url),
    );
    let proxy: Awaited<ReturnType<typeof createViteServer>> | undefined;
    try {
      await new Promise<void>((resolve) =>
        backend.listen(0, "127.0.0.1", resolve),
      );
      const port = (backend.address() as AddressInfo).port;
      vi.mocked(getDevApiConfig).mockReturnValueOnce({
        host: "127.0.0.1",
        port,
        origin: `http://127.0.0.1:${port}`,
      });
      const config = await definition({
        command: "serve",
        mode: "development",
      });
      proxy = await createViteServer({
        configFile: false,
        root,
        cacheDir: join(root, "cache"),
        logLevel: "silent",
        optimizeDeps: { noDiscovery: true },
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: false,
          proxy: config.server?.proxy,
        },
      });
      await proxy.listen();
      const proxyPort = (proxy.httpServer!.address() as AddressInfo).port;
      for (const path of ["/api/health", "/uploads/fixture"]) {
        const response = await fetch(`http://127.0.0.1:${proxyPort}${path}`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(path);
      }
    } finally {
      await proxy?.close();
      backend.closeAllConnections();
      if (backend.listening)
        await new Promise<void>((resolve) => backend.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});

it("serves the local whiteboard font as WOFF2 on the host platform", async () => {
  const root = await mkdtemp(join(tmpdir(), "huayu-dev-fonts-"));
  let server: Awaited<ReturnType<typeof createViteServer>> | undefined;
  try {
    server = await createViteServer({
      configFile: false,
      root,
      plugins: [whiteboardAssets()],
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const port = (server.httpServer!.address() as AddressInfo).port;
    const response = await fetch(
      "http://127.0.0.1:" +
        port +
        "/assets/excalidraw/fonts/Assistant/Assistant-Bold.woff2",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(
      Buffer.from(await response.arrayBuffer()).toString("ascii", 0, 4),
    ).toBe("wOF2");
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
