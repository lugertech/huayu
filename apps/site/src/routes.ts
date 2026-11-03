export const documentSlugs = [
  "getting-started",
  "models",
  "canvas",
  "recording",
  "deployment",
  "faq",
  "security",
  "changelog",
  "contributing",
  "architecture",
  "api",
  "code-style",
  "licensing",
  "third-party",
  "license",
  "release",
  "verification",
  "features",
  "dependencies",
  "design",
  "theme",
] as const;
export const routes = [
  "/",
  "/docs/",
  ...documentSlugs.map((slug) => `/docs/${slug}/`),
  "/en/",
  "/en/docs/",
  ...documentSlugs.map((slug) => `/en/docs/${slug}/`),
];
export function hasSiteRoute(path: string) {
  return routes.includes(path.endsWith("/") ? path : `${path}/`);
}
