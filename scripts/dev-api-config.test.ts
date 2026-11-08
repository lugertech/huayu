import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDevApiConfig } from "./dev-api-config.ts";

async function temporaryRoot(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "huayu-dev-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("development API defaults remain usable without an environment file", async (t) => {
  const root = await temporaryRoot(t);
  assert.deepEqual(getDevApiConfig(root, {}), {
    host: "127.0.0.1",
    port: 5858,
    origin: "http://127.0.0.1:5858",
  });
});

test("development API uses the configured process host and port", async (t) => {
  const root = await temporaryRoot(t);
  assert.deepEqual(
    getDevApiConfig(root, { HUAYU_HOST: "192.0.2.4", HUAYU_PORT: "9000" }),
    {
      host: "192.0.2.4",
      port: 9000,
      origin: "http://192.0.2.4:9000",
    },
  );
});

test("root .env wins over inherited values and exports only server address fields", async (t) => {
  const root = await temporaryRoot(t);
  await writeFile(
    join(root, ".env"),
    'export HUAYU_HOST="192.0.2.5"\nHUAYU_PORT=9001\nOTHER_VALUE=ignored\n',
  );
  await writeFile(join(root, ".env.local"), "HUAYU_PORT=9002\n");
  assert.deepEqual(
    getDevApiConfig(root, { HUAYU_HOST: "127.0.0.1", HUAYU_PORT: "9003" }),
    {
      host: "192.0.2.5",
      port: 9001,
      origin: "http://192.0.2.5:9001",
    },
  );
});

test("IPv6 and wildcard bind addresses produce connectable proxy origins", async (t) => {
  const root = await temporaryRoot(t);
  for (const [host, origin] of [
    ["::1", "http://[::1]:9000"],
    ["::", "http://[::1]:9000"],
    ["0.0.0.0", "http://127.0.0.1:9000"],
  ])
    assert.equal(
      getDevApiConfig(root, { HUAYU_HOST: host, HUAYU_PORT: "9000" }).origin,
      origin,
    );
  assert.equal(
    getDevApiConfig(root, { HUAYU_PORT: "80" }).origin,
    "http://127.0.0.1",
  );
});

test("invalid server addresses fail before starting development processes", async (t) => {
  const root = await temporaryRoot(t);
  assert.throws(
    () => getDevApiConfig(root, { HUAYU_HOST: "not-an-ip" }),
    /HUAYU_HOST/,
  );
  for (const port of ["", "0", "-1", "65536", "9000.5", "invalid"])
    assert.throws(
      () => getDevApiConfig(root, { HUAYU_PORT: port }),
      /HUAYU_PORT/,
    );
});
