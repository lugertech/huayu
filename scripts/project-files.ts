import { execFileSync, spawnSync } from "node:child_process";
import { readdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
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
  "playwright-report",
  "test-results",
  ".playwright-cli",
]);
export function isProjectPath(path: string): boolean {
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
  return true;
}
export async function projectFiles(root: string): Promise<string[]> {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  let candidates: string[];
  if (
    gitRoot.status === 0 &&
    resolve(gitRoot.stdout.trim()) === resolve(root)
  ) {
    candidates = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\0")
      .filter(Boolean);
  } else {
    candidates = [];
    async function walk(relative: string) {
      const entries = await readdir(join(root, relative), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (!isProjectPath(path)) continue;
        if (entry.isDirectory()) await walk(path);
        else candidates.push(path);
      }
    }
    await walk("");
  }
  const files: string[] = [];
  for (const file of [...new Set(candidates.filter(isProjectPath))].sort()) {
    const info = await lstat(join(root, file)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      },
    );
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error(`Non-regular source file: ${file}`);
    files.push(file);
  }
  return files;
}
