export const base = import.meta.env.BASE_URL;
export function sitePath(path = "") {
  return `${base}${path.replace(/^\//, "")}`;
}
function publicURL(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Public site URLs must use HTTPS without credentials.");
  return url.href.replace(/\/$/, "");
}
export const repositoryURL = publicURL(
  import.meta.env.VITE_PUBLIC_REPOSITORY_URL,
);
export const publicSiteURL = publicURL(import.meta.env.VITE_PUBLIC_SITE_URL);
