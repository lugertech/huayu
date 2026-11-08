import type { MessageKey } from "@/i18n";
import { LocalizedError, type ErrorTranslation } from "@/i18n/errors";
import { zhCN } from "@/i18n/messages";
import { canvasRequestHeaders } from "@/lib/canvas-access";

// The local API still returns human-readable messages. Translate known messages
// at this boundary and preserve unknown details instead of treating them as keys.
const apiMessageKeys = new Map<string, MessageKey>(
  (Object.keys(zhCN) as MessageKey[]).map((key) => [zhCN[key], key]),
);
function localizeApiError(message: unknown): string | ErrorTranslation {
  if (typeof message !== "string" || !message)
    return { key: "common.operationFailedRetry" };
  const key = apiMessageKeys.get(message);
  return key ? { key } : message;
}
export interface CanvasDocument {
  store: Record<string, unknown>;
  schema: unknown;
}
export interface Project {
  id: string;
  name: string;
  cover: string | null;
  document: CanvasDocument | null;
  recipe: string | null;
  revision: number;
  is_collaborative: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}
export interface Template {
  id: string;
  name: string;
  description: string;
  cover: string | null;
  document: CanvasDocument | null;
  recipe: string | null;
  tags: string[];
  fork_count: number;
  created_at: string;
}
export interface Asset {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  created_at: string;
}
export interface Recording {
  id: string;
  name: string;
  asset_id: string;
  project_id?: string | null;
  duration: number;
  size: number;
  transcript: string | null;
  analysis: string | null;
  created_at: string;
}

export const PROJECTS_CHANGED_EVENT = "huayu:projects-changed";
export type ProjectChange =
  | { type: "updated"; project: Project }
  | { type: "deleted"; id: string };

export class APIError extends LocalizedError {
  constructor(
    message: string | ErrorTranslation,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

// This client is exclusively for same-origin local data. Model requests use ai/provider.ts.
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/api/"))
    throw new LocalizedError({ key: "api.invalidRequestUrl" });
  const headers = new Headers(options.headers);
  for (const [key, value] of Object.entries(canvasRequestHeaders()))
    headers.set(key, value);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    throw new APIError(
      { key: "api.connectionInterrupted" },
      0,
      "NETWORK_ERROR",
    );
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new APIError(
      error
        ? localizeApiError(error.message)
        : { key: "api.requestFailed", values: { arg0: response.status } },
      response.status,
      error?.code || "REQUEST_FAILED",
    );
  }
  const result =
    response.status === 204 ? (undefined as T) : await response.json();
  if (
    options.method &&
    options.method.toUpperCase() !== "GET" &&
    (/^\/api\/projects(?:\/[^/?]+)?$/.test(path) ||
      /^\/api\/templates\/[^/?]+\/fork$/.test(path))
  ) {
    const projectPath = /^\/api\/projects\/([^/?]+)$/.exec(path);
    let detail: ProjectChange | undefined;
    if (projectPath && options.method.toUpperCase() === "PATCH") {
      detail = { type: "updated", project: result as Project };
    } else if (projectPath && options.method.toUpperCase() === "DELETE") {
      detail = { type: "deleted", id: projectPath[1] };
    }
    window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT, { detail }));
  }
  return result;
}

export async function uploadAsset(
  file: File | Blob,
  name?: string,
): Promise<Asset> {
  const body = new FormData();
  body.append(
    "file",
    file,
    name || (file instanceof File ? file.name : "file"),
  );
  return api<Asset>("/api/assets", { method: "POST", body });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
