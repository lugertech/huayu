import type { Capability } from "./settings";
import { LocalizedError, type ErrorTranslation } from "@/i18n/errors";

export class ModelConnectionError extends LocalizedError {
  constructor(
    readonly capability: Capability,
    message: string | ErrorTranslation,
    readonly code: "configuration" | "request" = "request",
  ) {
    super(message);
    this.name = "ModelConnectionError";
  }
}
