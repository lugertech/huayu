import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { parseEnv } from "node:util";

/** Match the root .env precedence used by scripts/cargo.sh. */
export function getDevApiConfig(
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const file = join(root, ".env");
  const values = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const host = values.HUAYU_HOST ?? environment.HUAYU_HOST ?? "127.0.0.1";
  const rawPort = values.HUAYU_PORT ?? environment.HUAYU_PORT ?? "5858";
  const port = Number(rawPort);
  if (!isIP(host))
    throw new Error("HUAYU_HOST must be an IPv4 or IPv6 address.");
  if (
    !/^\d+$/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error(
      "HUAYU_PORT must be an integer from 1 to 65535 for development.",
    );

  const proxyHost =
    host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const authority = isIP(proxyHost) === 6 ? `[${proxyHost}]` : proxyHost;
  return { host, port, origin: new URL(`http://${authority}:${port}`).origin };
}
