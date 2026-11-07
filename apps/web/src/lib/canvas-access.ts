/** The current route scopes local API calls; model provider requests never use these headers. */
export function canvasAccess() {
  const match = globalThis.location?.pathname.match(/^\/drawing\/([^/]+)\/?$/);
  if (!match) return null;
  const params = new URLSearchParams(globalThis.location.search);
  return {
    projectId: match[1],
    shareToken: params.has("share") ? params.get("share")! : null,
  };
}

export function canvasRequestHeaders(): Record<string, string> {
  const access = canvasAccess();
  if (!access) return {};
  return {
    "X-Huayu-Canvas": access.projectId,
    ...(access.shareToken === null
      ? {}
      : { "X-Huayu-Share": access.shareToken }),
  };
}

export function isSharedCanvas() {
  return canvasAccess()?.shareToken != null;
}
