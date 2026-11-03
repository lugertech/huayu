import { readFile, writeFile, mkdir, cp, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { render, routes, publicSiteURL, base } from "./.render/render.js";

const root = import.meta.dirname;
const template = await readFile(resolve(root, "dist/index.html"), "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
for (const route of [...routes, "/404/", "/en/404/"]) {
  const { html, title, description, locale, notFound } = render(route);
  const url = publicSiteURL
    ? `${publicSiteURL}/${route.replace(/^\//, "")}`
    : "";
  const head = [
    ...(notFound ? ['<meta name="robots" content="noindex, follow">'] : []),
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:locale" content="${locale === "en" ? "en_US" : "zh_CN"}">`,
    `<meta property="og:image" content="${escape(`${publicSiteURL || base.replace(/\/$/, "")}/${locale === "en" ? "images/en" : "images"}/results-image.jpg`)}">`,
    `<meta property="og:image:alt" content="${locale === "en" ? "Huayu canvas with an image work open for editing" : "画语画布中的图片作品编辑窗口"}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    ...(url && !notFound
      ? [
          `<link rel="canonical" href="${escape(url)}">`,
          `<meta property="og:url" content="${escape(url)}">`,
          ...["zh-CN", "en"].map((language) => {
            const path = route.replace(/^\/en(?=\/|$)/, "");
            const target =
              language === "en" ? `/en${path || "/"}` : path || "/";
            return `<link rel="alternate" hreflang="${language}" href="${escape(`${publicSiteURL}/${target.replace(/^\//, "")}`)}">`;
          }),
        ]
      : []),
  ].join("\n");
  const output = resolve(root, "dist", route.replace(/^\//, ""), "index.html");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    template
      .replace("<!--site-content-->", html)
      .replace('<html lang="zh-CN">', `<html lang="${locale}">`)
      .replace("<!--site-head-->", head)
      .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
      .replace(
        /<meta name="description"[^>]*>/,
        `<meta name="description" content="${escape(description)}">`,
      ),
  );
}
await cp(resolve(root, "dist/404/index.html"), resolve(root, "dist/404.html"));
const licenseRoot = resolve(root, "dist/licenses");
await mkdir(licenseRoot, { recursive: true });
for (const name of await readdir(resolve(root, "../../licenses")))
  await cp(resolve(root, "../../licenses", name), resolve(licenseRoot, name), {
    recursive: true,
  });
await cp(resolve(root, "../../LICENSE"), resolve(licenseRoot, "Huayu-MIT.txt"));
await cp(
  resolve(root, "../web/public/fonts/OFL.txt"),
  resolve(licenseRoot, "NotoSansSC-OFL.txt"),
);
await writeFile(
  resolve(root, "dist/robots.txt"),
  `User-agent: *\nAllow: /\n${publicSiteURL ? `Sitemap: ${publicSiteURL}/sitemap.xml\n` : ""}`,
);
if (publicSiteURL)
  await writeFile(
    resolve(root, "dist/sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>${escape(`${publicSiteURL}/${route.replace(/^\//, "")}`)}</loc></url>`).join("")}</urlset>`,
  );
console.log(`Prerendered ${routes.length} pages with base ${base}.`);
