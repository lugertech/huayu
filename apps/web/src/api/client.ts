import { getLocale } from "@/i18n";
import { LocalizedError, type ErrorTranslation } from "@/i18n/errors";
import { canvasRequestHeaders } from "@/lib/canvas-access";
import { readApiError } from "./errors";

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
  if (!headers.has("Accept-Language"))
    headers.set("Accept-Language", getLocale());
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
    const value: unknown = await response.json().catch(() => null);
    const error = readApiError(value);
    throw new APIError(
      value
        ? error.message
        : { key: "api.requestFailed", values: { arg0: response.status } },
      response.status,
      error.code,
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
  signal?: AbortSignal,
): Promise<Asset> {
  signal?.throwIfAborted();
  const body = new FormData();
  body.append(
    "file",
    file,
    name || (file instanceof File ? file.name : "file"),
  );
  return api<Asset>("/api/assets", { method: "POST", body, signal });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
