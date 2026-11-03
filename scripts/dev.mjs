import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vp = fileURLToPath(import.meta.resolve("vite-plus/bin"));
const processOptions = {
  cwd: root,
  stdio: "inherit",
  detached: process.platform !== "win32",
};
const processes = [
  spawn(
    "sh",
    ["scripts/cargo.sh", "run", "--package", "huayu-server"],
    processOptions,
  ),
  spawn(process.execPath, [vp, "-C", "apps/web", "dev"], processOptions),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of processes) {
    if (!child.pid) continue;
    if (process.platform === "win32") {
      const termination = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore" },
      );
      termination.on("error", (error) => {
        console.error(error.message);
        child.kill("SIGTERM");
        process.exitCode = 1;
      });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") {
          console.error(error.message);
          process.exitCode = 1;
        }
      }
    }
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of processes) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => stop(code ?? (signal ? 1 : 0)));
}
