import { getLocale } from "@/i18n";
import { LocalizedError } from "@/i18n/errors";
import { canvasRequestHeaders } from "@/lib/canvas-access";

export async function blobForSource(
  src: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const url = new URL(src, window.location.origin);
  if (!["http:", "https:", "data:", "blob:"].includes(url.protocol))
    throw new LocalizedError({ key: "api.invalidResourceUrl" });
  const response = await fetch(url, {
    credentials: url.origin === window.location.origin ? "same-origin" : "omit",
    headers:
      url.origin === window.location.origin && url.pathname.startsWith("/api/")
        ? { ...canvasRequestHeaders(), "Accept-Language": getLocale() }
        : undefined,
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok)
    throw new LocalizedError({ key: "api.cannotReadInputResource" });
  return response.blob();
}

export function blobAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new LocalizedError({ key: "api.cannotReadImage" }));
    reader.readAsDataURL(blob);
  });
}
