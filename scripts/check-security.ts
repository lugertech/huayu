import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectFiles } from "./project-files.ts";

export function securityWarnings(path: string, text: string): string[] {
  const found: string[] = [];
  if (
    /\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\/.test(
      text,
    )
  )
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
  if (!path.endsWith(".test.ts") && fixture.test(text))
    found.push("local model fixture");
  return found;
}

export async function checkSecurity(root: string) {
  const files = await projectFiles(root);
  const issues: string[] = [];
  const textExtensions = new Set([
    ".md",
    ".txt",
    ".ts",
    ".tsx",
    ".js",
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
    if (!textExtensions.has(extname(path)) && basename(path) !== ".env.example")
      continue;
    const text = await readFile(join(root, path), "utf8");
    for (const warning of securityWarnings(path, text))
      issues.push(`${path}: ${warning}`);
  }
  if (issues.length) throw new Error(issues.join("\n"));
  return { files: files.length };
}

if (import.meta.main) {
  try {
    const result = await checkSecurity(
      fileURLToPath(new URL("..", import.meta.url)),
    );
    console.log(`Security checks passed: ${result.files} project files.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
