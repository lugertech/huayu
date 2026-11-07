import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function packageSource(root: string, ref = "HEAD") {
  const options = {
    cwd: root,
    encoding: "utf8" as const,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  };
  const commit = execFileSync(
    "git",
    ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
    options,
  ).trim();
  const { version }: { version: unknown } = JSON.parse(
    execFileSync("git", ["show", `${commit}:package.json`], options),
  );
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+[\w.+-]*$/.test(version))
    throw new Error("The selected commit has an invalid package version.");
  const name = `huayu-${version}-source`;
  const output = join(root, "var/releases");
  const archive = join(output, `${name}.tar.gz`);
  await mkdir(output, { recursive: true });
  execFileSync(
    "git",
    [
      "archive",
      "--format=tar.gz",
      `--prefix=${name}/`,
      `--output=${archive}`,
      commit,
    ],
    options,
  );
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(`${archive}.sha256`, `${digest}  ${name}.tar.gz\n`);
  return { archive, commit, version };
}

if (import.meta.main) {
  try {
    if (process.argv.length > 3)
      throw new Error("Usage: vp run package:source [tag-or-commit]");
    const result = await packageSource(
      fileURLToPath(new URL("..", import.meta.url)),
      process.argv[2],
    );
    console.log(
      `Created var/releases/huayu-${result.version}-source.tar.gz and SHA-256 from commit ${result.commit}.`,
    );
    console.log(
      "The archive contains the selected commit; working-tree changes are not included.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
