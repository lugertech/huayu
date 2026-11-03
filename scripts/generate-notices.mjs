import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const projects = JSON.parse(
  execFileSync(
    command,
    ["list", "--recursive", "--prod", "--depth", "Infinity", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
      shell: process.platform === "win32",
    },
  ),
);
const packages = new Map();
async function visit(dependencies = {}) {
  for (const [name, item] of Object.entries(dependencies)) {
    if (!item.path || item.version?.startsWith("link:")) continue;
    const info = JSON.parse(
      await readFile(resolve(item.path, "package.json"), "utf8"),
    );
    const key = `${info.name || name}@${info.version}`;
    if (packages.has(key)) continue;
    let license =
      typeof info.license === "string" ? info.license : info.license?.type;
    if (!license && info.licenses?.length === 1)
      license = info.licenses[0].type;
    if (!license) {
      for (const filename of await readdir(item.path)) {
        if (!/^licen[sc]e(?:[._-].*)?$/i.test(filename)) continue;
        const text = await readFile(resolve(item.path, filename), "utf8");
        if (/^(?:The )?MIT License(?: \(MIT\))?/i.test(text.trim()))
          license = "MIT";
      }
    }
    packages.set(key, {
      name: info.name || name,
      version: info.version,
      license: license || "SEE PACKAGE",
      path: item.path,
    });
    await visit(item.dependencies);
  }
}
for (const project of projects) await visit(project.dependencies);
const entries = [...packages.values()].sort(
  (a, b) =>
    a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version),
);
const table = [
  "# 前端运行依赖许可清单",
  "",
  "版本来自当前锁文件的应用和介绍页生产依赖树，许可来自安装包元数据。此清单不包含 Rust crate 和开发工具。第三方软件、字体和素材继续保留原许可；双重许可按其适用分支处理，见 [第三方许可说明](../THIRD_PARTY_NOTICES.md)。",
  "",
  "| 软件包 | 版本 | 许可 |",
  "| --- | --- | --- |",
  ...entries.map(
    (item) =>
      `| ${item.name} | ${item.version} | ${item.license.replaceAll("|", "\\|")} |`,
  ),
  "",
].join("\n");
const notices = [
  "Third-party notices collected from locked production npm dependencies.",
  "Excalidraw and its fonts have additional notices in this directory.",
  "",
];
for (const item of entries) {
  const names = (await readdir(item.path, { withFileTypes: true }))
    .filter(
      (file) =>
        file.isFile() &&
        /^(?:licen[sc]e|notice|copying)(?:[._-].*)?$/i.test(file.name),
    )
    .map((file) => file.name)
    .sort();
  if (!names.length)
    notices.push(
      `===== ${item.name}@${item.version} =====\nDeclared license: ${item.license}\nSee the upstream package for applicable source notices.\n`,
    );
  for (const name of names)
    notices.push(
      `===== ${item.name}@${item.version} / ${name} =====\n\n${await readFile(resolve(item.path, name), "utf8")}\n`,
    );
}
for (const [path, content] of [
  ["docs/DEPENDENCY_LICENSES.md", table],
  [
    "docs/en/DEPENDENCY_LICENSES.md",
    [
      "# Frontend production dependency licenses",
      "",
      "Versions come from the locked production dependency trees of the application and official site. Licenses come from installed package metadata. Rust crates and development tools are excluded. Third-party software, fonts and assets retain their terms; see [Third-party notices](./THIRD_PARTY_NOTICES.md).",
      "",
      "| Package | Version | License |",
      "| --- | --- | --- |",
      ...entries.map(
        (item) =>
          `| ${item.name} | ${item.version} | ${item.license.replaceAll("|", "\\|")} |`,
      ),
      "",
    ].join("\n"),
  ],
  ["licenses/npm-NOTICES.txt", notices.join("\n")],
]) {
  if (process.argv.includes("--check")) {
    if ((await readFile(resolve(root, path), "utf8")) !== content)
      throw new Error(`${path} is out of date; run vp run licenses:generate.`);
  } else await writeFile(resolve(root, path), content);
}
console.log(`Checked ${entries.length} locked production package versions.`);
