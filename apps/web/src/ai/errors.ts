import type { Capability } from "./settings";

export class ModelConnectionError extends Error {
  constructor(
    readonly capability: Capability,
    message: string,
    readonly code: "configuration" | "request" = "request",
  ) {
    super(message);
    this.name = "ModelConnectionError";
  }
}
