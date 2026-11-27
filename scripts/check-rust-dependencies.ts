import { execFileSync } from "node:child_process";

interface WorkspaceCrate {
  name: string;
  dependencies: { name: string; kind: string | null }[];
}

const forbidden = new Map([
  ["huayu-core", ["sea-orm", "axum"]],
  ["huayu-store", ["axum"]],
]);
const metadata = execFileSync(
  "sh",
  [
    "scripts/cargo.sh",
    "metadata",
    "--locked",
    "--no-deps",
    "--format-version=1",
  ],
  { cwd: new URL("../", import.meta.url), encoding: "utf8" },
);
const { packages }: { packages: WorkspaceCrate[] } = JSON.parse(metadata);

for (const { name, dependencies } of packages) {
  for (const dependency of dependencies) {
    if (
      dependency.kind === null &&
      forbidden.get(name)?.includes(dependency.name)
    ) {
      console.error(
        `Forbidden production dependency: ${name} -> ${dependency.name}`,
      );
      process.exitCode = 1;
    }
  }
}
