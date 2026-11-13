import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { isProjectPath, projectFiles } from "./project-files.ts";
import { checkSecurity, securityWarnings } from "./check-security.ts";
import { packageSource } from "./package-source.ts";

async function temporaryRepository(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "huayu-git-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });
  return root;
}

function commitFixture(root: string) {
  execFileSync("git", ["add", "--all", "--force"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Huayu tests",
      "-c",
      "user.email=tests@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=.git/no-hooks",
      "commit",
      "--quiet",
      "-m",
      "Release fixture",
    ],
    { cwd: root },
  );
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

async function fixtureFile(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

test("an archive extracted inside another repository uses its own files", async () => {
  const parent = await mkdtemp(join(tmpdir(), "huayu-nested-release-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: parent });
    const archive = join(parent, "archive");
    await mkdir(archive);
    await writeFile(join(archive, "README.md"), "Extracted source");
    assert.deepEqual(await projectFiles(archive), ["README.md"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("project checks exclude runtime, cache, secrets and paths outside the workspace", () => {
  for (const path of [
    "var/dev/huayu.sqlite3",
    "output/design/private.jpg",
    "apps/web/node_modules/pkg/a.js",
    "apps/web/src/._main.tsx",
    ".github/._workflows",
    "apps/web/dist/index.html",
    "apps/api-rust/target/release/server",
    "apps/web/.render/quick-start/generate-quick-start-covers.js",
    "apps/web/.vitest/json/output.json",
    ".env",
    "apps/web/.env.local",
    "apps/web/private.key",
    "../README.md",
    "/tmp/README.md",
    "C:\\private\\README.md",
  ])
    assert.equal(isProjectPath(path), false, path);
  for (const path of [
    ".env.example",
    ".gitattributes",
    ".editorconfig",
    "vite.config.ts",
    "LICENSE",
    "docs/RELEASE.md",
    "apps/web/src/main.tsx",
    "apps/web/public/assets/card_bg.png",
    "templates/catalog.json",
    ".github/workflows/ci.yml",
  ])
    assert.equal(isProjectPath(path), true, path);
});
test("source scans detect likely credentials without returning their values", () => {
  const secret = "sk-" + "a".repeat(40);
  assert.deepEqual(
    securityWarnings("apps/web/src/key.ts", `const key = '${secret}'`),
    ["possible credential"],
  );
  assert.ok(
    !securityWarnings("apps/web/src/key.ts", secret).join("").includes(secret),
  );
  assert.deepEqual(
    securityWarnings(
      "apps/web/src/provider.ts",
      "Authorization: `Bearer ${connection.apiKey}`",
    ),
    [],
  );
});
test("source scans distinguish local fixture code from release code", () => {
  const fixture = "local-" + "test-only";
  assert.deepEqual(securityWarnings("apps/web/src/model.ts", fixture), [
    "local model fixture",
  ]);
  assert.deepEqual(securityWarnings("apps/web/src/model.test.ts", fixture), []);
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
    assert.deepEqual(await projectFiles(root), [
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
      await assert.rejects(projectFiles(root), /Non-regular source file/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("project checks include new files and skip working-tree deletions", async (t) => {
  const root = await temporaryRepository(t);
  await writeFile(join(root, "README.md"), "Committed source");
  await writeFile(join(root, "removed.ts"), "export {};");
  commitFixture(root);
  await rm(join(root, "removed.ts"));
  await writeFile(join(root, "new-rule.md"), "Untracked project rule");
  assert.deepEqual(await projectFiles(root), ["README.md", "new-rule.md"]);
});

test("security checks run independently and do not disclose detected values", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "huayu-security-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const secret = "sk-" + "b".repeat(40);
  await writeFile(join(root, "README.md"), secret);
  await assert.rejects(checkSecurity(root), (error: Error) => {
    assert.match(error.message, /README\.md: possible credential/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  await writeFile(join(root, "README.md"), "Safe source");
  assert.deepEqual(await checkSecurity(root), { files: 1 });
  await fixtureFile(root, "apps/web/.env.example", secret);
  await assert.rejects(
    checkSecurity(root),
    /apps\/web\/\.env\.example: possible credential/,
  );
});

test("security checks detect personal paths on all desktop platforms", () => {
  for (const text of [
    ["", "Users", "tester", "repo"].join("/"),
    ["", "home", "tester", "repo"].join("/"),
    ["C:", "Users", "tester", "repo"].join("\\"),
  ])
    assert.deepEqual(securityWarnings("docs/example.md", text), [
      "personal absolute path",
    ]);
});

test("git archives use committed files and export rules, with a valid checksum", async (t) => {
  const root = await temporaryRepository(t);
  await copyFile(
    new URL("../.gitattributes", import.meta.url),
    join(root, ".gitattributes"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  await writeFile(join(root, "README.md"), "Committed readme\n");
  await writeFile(join(root, ".env.example"), "EXAMPLE_SETTING=\n");
  await fixtureFile(root, "extra/source.ts", "export const value = 1;\n");
  await fixtureFile(root, "apps/web/.env.example", "EXAMPLE_SETTING=\n");
  const excluded = [
    "var/dev/private.txt",
    "output/private.txt",
    ".env",
    "apps/web/.env.local",
    "apps/web/node_modules/private.js",
    "apps/web/dist/index.html",
    "apps/api-rust/target/server",
    "apps/web/.render/quick-start/generate-quick-start-covers.js",
    "apps/web/.vitest/result.json",
    "docs/private.key",
    "docs/data.sqlite3-wal",
    "docs/._private.md",
  ];
  for (const path of excluded)
    await fixtureFile(root, path, "Excluded content");
  const commit = commitFixture(root);
  await writeFile(join(root, "README.md"), "Uncommitted readme");
  await writeFile(join(root, "package.json"), "Invalid working-tree JSON");
  await writeFile(join(root, ".gitattributes"), "");
  await writeFile(join(root, "untracked.txt"), "Untracked source");
  const result = await packageSource(root);
  assert.equal(result.commit, commit);
  assert.equal(result.version, "0.1.0");
  const prefix = "huayu-0.1.0-source/";
  const entries = execFileSync("tar", ["-tzf", result.archive], {
    encoding: "utf8",
  }).split(/\r?\n/);
  for (const path of [
    "README.md",
    "extra/source.ts",
    ".env.example",
    "apps/web/.env.example",
  ])
    assert.ok(entries.includes(prefix + path), path);
  for (const path of [...excluded, "untracked.txt"])
    assert.ok(!entries.includes(prefix + path), path);
  assert.equal(
    execFileSync("tar", ["-xOf", result.archive, prefix + "README.md"], {
      encoding: "utf8",
    }),
    "Committed readme\n",
  );
  const digest = createHash("sha256")
    .update(await readFile(result.archive))
    .digest("hex");
  assert.equal(
    await readFile(`${result.archive}.sha256`, "utf8"),
    `${digest}  huayu-0.1.0-source.tar.gz\n`,
  );
});

test("git archives select the requested version and reject an unknown ref", async (t) => {
  const root = await temporaryRepository(t);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  const original = commitFixture(root);
  execFileSync("git", ["tag", "v0.1.0"], { cwd: root });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "0.2.0" }),
  );
  commitFixture(root);
  const tagged = await packageSource(root, "v0.1.0");
  assert.equal(tagged.commit, original);
  assert.equal(tagged.version, "0.1.0");
  assert.equal((await packageSource(root)).version, "0.2.0");
  await assert.rejects(packageSource(root, "missing-ref"));
});

test("the TypeScript packaging command works independently of the caller's directory", async (t) => {
  const root = await temporaryRepository(t);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "0.1.0", type: "module" }),
  );
  await mkdir(join(root, "scripts"));
  await copyFile(
    new URL("./package-source.ts", import.meta.url),
    join(root, "scripts/package-source.ts"),
  );
  const commit = commitFixture(root);
  execFileSync("git", ["tag", "v0.1.0"], { cwd: root });
  const output = execFileSync(
    process.execPath,
    [join(root, "scripts/package-source.ts"), "v0.1.0"],
    { cwd: tmpdir(), encoding: "utf8" },
  );
  assert.ok(output.includes(commit));
  assert.ok(
    (await readFile(join(root, "var/releases/huayu-0.1.0-source.tar.gz")))
      .length > 0,
  );
});
