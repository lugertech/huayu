import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { projectFiles } from "./project-files.ts";

export async function checkRelease(root: string) {
  const files = await projectFiles(root);
  const issues: string[] = [];
  const required = [
    "LICENSE",
    ".gitattributes",
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CHANGELOG.md",
    "THIRD_PARTY_NOTICES.md",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "apps/api-rust/Cargo.lock",
    "templates/catalog.json",
    "templates/index.json",
    "docs/RELEASE.md",
    "docs/GETTING_STARTED.md",
    "docs/MODEL_SETUP.md",
    "docs/USER_GUIDE.md",
    "docs/RECORDING_GUIDE.md",
    "docs/DEPLOYMENT.md",
    "docs/TROUBLESHOOTING.md",
    ".github/workflows/ci.yml",
  ];
  for (const path of required)
    if (!files.includes(path)) issues.push(`Missing required source: ${path}`);
  const packageInfo = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  for (const path of ["apps/web/package.json"]) {
    const info = JSON.parse(await readFile(resolve(root, path), "utf8"));
    if (info.version !== packageInfo.version || info.license !== "MIT")
      issues.push(`Version/license mismatch: ${path}`);
  }
  const cargo = await readFile(
    resolve(root, "apps/api-rust/Cargo.toml"),
    "utf8",
  );
  if (!cargo.includes(`version = "${packageInfo.version}"`))
    issues.push("Rust workspace version mismatch");
  for (const path of files.filter((file) => file.endsWith(".md"))) {
    const content = await readFile(resolve(root, path), "utf8");
    for (const [, raw] of content.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const link = raw.replace(/^<|>$/g, "").split(/\s+"/)[0].split("#")[0];
      if (!link || /^(?:https?:|mailto:|#|\/)/.test(link)) continue;
      try {
        const target = resolve(root, dirname(path), decodeURIComponent(link));
        if (!(await stat(target)).isFile())
          issues.push(`${path}: invalid local document link`);
      } catch {
        issues.push(`${path}: missing link target ${link}`);
      }
    }
  }
  if (issues.length) throw new Error([...new Set(issues)].join("\n"));
  return { version: packageInfo.version, files };
}
if (import.meta.main) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  try {
    const result = await checkRelease(root);
    console.log(
      `Release checks passed: ${result.files.length} files, version ${result.version}.`,
    );
    console.log(
      "Publication readiness still follows docs/RELEASE.md, including source authorization and real-device/model acceptance.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
