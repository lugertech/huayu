import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRelease } from "./check-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version, files } = await checkRelease(root);
const temporary = await mkdtemp(join(tmpdir(), "huayu-source-"));
const name = `huayu-${version}-source`;
const output = resolve(root, "var/releases");
await mkdir(output, { recursive: true });
try {
  const manifest = [];
  for (const file of files) {
    const target = join(temporary, name, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, file), target);
    const digest = createHash("sha256")
      .update(await readFile(target))
      .digest("hex");
    manifest.push(`${digest}  ${file}`);
  }
  await writeFile(
    join(temporary, name, "SOURCE_MANIFEST.sha256"),
    manifest.join("\n") + "\n",
  );
  const archive = join(output, `${name}.tar.gz`);
  execFileSync("tar", ["-czf", archive, "-C", temporary, name], {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await writeFile(`${archive}.sha256`, `${digest}  ${name}.tar.gz\n`);
  console.log(
    `Created var/releases/${name}.tar.gz (${files.length} source files).`,
  );
  console.log(
    "Candidate source archive only; complete docs/RELEASE.md before publishing.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
