import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSourcePath, sourceFiles, sourceWarnings } from "./release-files.mjs";

test("an archive extracted inside another repository uses its own files", async () => {
  const parent = await mkdtemp(join(tmpdir(), "huayu-nested-release-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: parent });
    const archive = join(parent, "archive");
    await mkdir(archive);
    await writeFile(join(archive, "README.md"), "Extracted source");
    assert.deepEqual(await sourceFiles(archive), ["README.md"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("source packages exclude runtime, cache, secrets and paths outside the workspace", () => {
  for (const path of [
    "var/dev/huayu.sqlite3",
    "output/design/private.jpg",
    "apps/web/node_modules/pkg/a.js",
    "apps/web/src/._main.tsx",
    ".github/._workflows",
    "apps/web/dist/index.html",
    "apps/api-rust/target/release/server",
    "apps/site/.render/render.js",
    "apps/web/.vitest/json/output.json",
    ".env",
    "apps/web/.env.local",
    "apps/web/private.key",
    "../README.md",
    "/tmp/README.md",
    "C:\\private\\README.md",
  ])
    assert.equal(isSourcePath(path), false, path);
  for (const path of [
    ".env.example",
    ".gitattributes",
    ".editorconfig",
    "vite.config.ts",
    "LICENSE",
    "docs/RELEASE.md",
    "apps/web/src/main.tsx",
    "apps/site/public/images/results-text.jpg",
    "templates/catalog.json",
    ".github/workflows/ci.yml",
  ])
    assert.equal(isSourcePath(path), true, path);
});
test("source scans detect likely credentials without returning their values", () => {
  const secret = "sk-" + "a".repeat(40);
  assert.deepEqual(
    sourceWarnings("apps/web/src/key.ts", `const key = '${secret}'`),
    ["possible credential"],
  );
  assert.ok(
    !sourceWarnings("apps/web/src/key.ts", secret).join("").includes(secret),
  );
  assert.deepEqual(
    sourceWarnings(
      "apps/web/src/provider.ts",
      "Authorization: `Bearer ${connection.apiKey}`",
    ),
    [],
  );
});
test("source scans distinguish local fixture code from release code", () => {
  const fixture = "local-" + "test-only";
  assert.deepEqual(sourceWarnings("apps/web/src/model.ts", fixture), [
    "local model fixture",
  ]);
  assert.deepEqual(sourceWarnings("apps/web/src/model.test.ts", fixture), []);
});
test("source collection also works in an extracted archive without Git metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "huayu-release-test-"));
  try {
    await mkdir(join(root, "apps/web/src"), { recursive: true });
    await mkdir(join(root, "apps/web/node_modules"), { recursive: true });
    await mkdir(join(root, "var/dev"), { recursive: true });
    await writeFile(join(root, "README.md"), "Example");
    await writeFile(join(root, "vite.config.ts"), "export default {};\n");
    await writeFile(join(root, "apps/web/src/main.tsx"), "export {};");
    await writeFile(join(root, "apps/web/node_modules/private.js"), "ignore");
    await writeFile(join(root, "var/dev/private.txt"), "ignore");
    assert.deepEqual(await sourceFiles(root), [
      "README.md",
      "apps/web/src/main.tsx",
      "vite.config.ts",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test(
  "source collection refuses symlinks that could pull in unrelated data",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "huayu-release-link-"));
    try {
      await mkdir(join(root, "docs"));
      await writeFile(join(root, "private.txt"), "private");
      await symlink(join(root, "private.txt"), join(root, "docs/linked.md"));
      await assert.rejects(sourceFiles(root), /Non-regular source file/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
