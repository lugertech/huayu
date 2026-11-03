import { execFileSync } from "node:child_process";
import { readdir, lstat, readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

const roots = ["apps", "docs", "licenses", "scripts", "templates", ".github"];
const rootFiles = new Set([
  "README.md",
  "README.en.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "AGENTS.md",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".env.example",
  "vite.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
]);
const excluded = new Set([
  "node_modules",
  "dist",
  "target",
  ".render",
  ".vitest",
  ".git",
  ".DS_Store",
  "var",
  "output",
]);
export function isSourcePath(path) {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    parts.some(
      (part) => part === ".." || part.startsWith("._") || excluded.has(part),
    )
  )
    return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return false;
  if (parts.some((part) => part.startsWith(".env") && part !== ".env.example"))
    return false;
  if (/\.(?:sqlite3?(?:-wal|-shm)?|db|log|pem|key|p12|pfx)$/i.test(normalized))
    return false;
  return rootFiles.has(normalized) || roots.includes(parts[0]);
}
export async function sourceFiles(root) {
  let candidates;
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolve(gitRoot) !== resolve(root))
      throw new Error("Source root has no independent Git metadata.");
    candidates = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\0")
      .filter(Boolean);
  } catch {
    candidates = [];
    async function walk(relative) {
      let entries;
      try {
        entries = await readdir(join(root, relative), { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        const path = `${relative}/${entry.name}`;
        if (!isSourcePath(path)) continue;
        if (entry.isDirectory()) await walk(path);
        else candidates.push(path);
      }
    }
    for (const path of roots) await walk(path);
    for (const path of rootFiles) {
      try {
        if ((await lstat(join(root, path))).isFile()) candidates.push(path);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  const files = [...new Set(candidates.filter(isSourcePath))].sort();
  for (const file of files) {
    const info = await lstat(join(root, file));
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error(`Non-regular source file: ${file}`);
  }
  return files;
}
export function sourceWarnings(path, text) {
  const found = [];
  if (/\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/(?:project|workspace)/.test(text))
    found.push("personal absolute path");
  const patterns = [
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bAKIA[A-Z0-9]{16}\b/,
    new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
  ];
  if (patterns.some((pattern) => pattern.test(text)))
    found.push("possible credential");
  const fixture = new RegExp(
    "local-" + "(?:test-only|fixture)|127\\.0\\.0\\.1:" + "5862",
  );
  if (
    !path.endsWith(".test.ts") &&
    !path.endsWith("release.test.mjs") &&
    fixture.test(text)
  )
    found.push("local model fixture");
  return found;
}
export async function checkSources(root, files) {
  const issues = [];
  const textExtensions = new Set([
    ".md",
    ".txt",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".rs",
    ".toml",
    ".yaml",
    ".yml",
    ".json",
    ".html",
    ".css",
    ".sh",
    ".svg",
  ]);
  for (const path of files) {
    if (!textExtensions.has(extname(path)) && path !== ".env.example") continue;
    const text = await readFile(join(root, path), "utf8");
    for (const warning of sourceWarnings(path, text))
      issues.push(`${path}: ${warning}`);
  }
  return issues;
}
