import { mkdir, readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(
  await readFile(new URL("../templates/catalog.json", import.meta.url), "utf8"),
);
const illustrations = new Map(
  await Promise.all(
    [
      ...new Set(
        catalog.flatMap((preset) =>
          preset.nodes.map((node) => node.artwork).filter(Boolean),
        ),
      ),
    ].map(async (name) => {
      const [zh, en] = await Promise.all(
        ["zh-CN", "en"].map((locale) =>
          readFile(
            new URL(`../templates/art/${name}-${locale}.svg`, import.meta.url),
            "utf8",
          ),
        ),
      );
      return [
        name,
        {
          zh: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(zh)}`,
          en: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(en)}`,
        },
      ];
    }),
  ),
);
const richIndex = catalog.map((template) => ({
  id: template.id,
  recipe: template.recipe,
  kind: template.kind,
  name: template.name,
  description: template.description,
  tag: template.tag,
  en: template.en,
  ...(template.showcase ? { showcase: template.showcase } : {}),
  nodes: template.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    column: node.column,
    row: node.row,
    name: node.name,
    en: { name: node.en.name },
    preview: {
      text: (node.props.result || node.text)
        .replace(/[#*|[\]]/g, "")
        .slice(0, 180),
      en: (node.en.props?.result || node.en.text)
        .replace(/[#*|[\]]/g, "")
        .slice(0, 180),
      ...(node.props.src
        ? {
            image: node.props.src,
            enImage: node.en.props?.src || node.props.src,
            ...(node.artwork
              ? {
                  image: illustrations.get(node.artwork).zh,
                  enImage: illustrations.get(node.artwork).en,
                }
              : {}),
          }
        : {}),
    },
  })),
  edges: template.edges,
}));
function templatePreview(preset, locale) {
  if (preset.showcase)
    return locale === "en" ? preset.showcase.en.cover : preset.showcase.cover;
  const width =
    (Math.max(...preset.nodes.map((node) => node.column)) + 1) * 180 + 20;
  const height =
    (Math.max(...preset.nodes.map((node) => node.row)) + 1) * 106 + 20;
  const nodes = new Map(preset.nodes.map((node) => [node.id, node]));
  const arrows = preset.edges
    .map(([from, to]) => {
      const source = nodes.get(from);
      const target = nodes.get(to);
      const x1 = source.column * 180 + 160;
      const y1 = source.row * 106 + 56;
      const x2 = target.column * 180 + 16;
      const y2 = target.row * 106 + 56;
      const middle = (x1 + x2) / 2;
      return `<path d="M${x1} ${y1} C${middle} ${y1} ${middle} ${y2} ${x2} ${y2}" fill="none" stroke="#92918b" stroke-width="2" marker-end="url(#arrow)"/>`;
    })
    .join("");
  const cards = preset.nodes
    .map((node) => {
      const labels =
        locale === "en"
          ? {
              "ai-text": "Text",
              instruction: "Create",
              file: "Document",
              chart: "Chart",
              website: "Web page",
              "ai-image": "Image",
              speech: "Speech",
            }
          : {
              "ai-text": "文字",
              instruction: "创作指令",
              file: "文档",
              chart: "图表",
              website: "网页",
              "ai-image": "图片",
              speech: "语音",
            };
      const label = labels[node.type] || (locale === "en" ? "Step" : "组件");
      const x = node.column * 180 + 20;
      const y = node.row * 106 + 20;
      return `<g><rect x="${x}" y="${y}" width="140" height="72" rx="7" fill="#fff" stroke="#b8b7b0" stroke-width="1.5"/><path d="M${x + 1} ${y + 25} H${x + 139}" stroke="#e5e5e1"/><circle cx="${x + 10}" cy="${y + 12}" r="3" fill="#92918b"/><text x="${x + 19}" y="${y + 16}" font-family="system-ui,sans-serif" font-size="10" fill="#34322d">${label}</text><path d="M${x + 12} ${y + 40} H${x + 115} M${x + 12} ${y + 50} H${x + 95} M${x + 12} ${y + 60} H${x + 69}" stroke="#d8d7d1" stroke-width="2" stroke-linecap="round"/></g>`;
    })
    .join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#92918b" stroke-width="1.3"/></marker></defs>${arrows}${cards}</svg>`)}`;
}

const index = catalog.map((template) => ({
  id: template.id,
  recipe: template.recipe,
  kind: template.kind,
  name: template.name,
  description: template.description,
  tag: template.tag,
  en: template.en,
  ...(template.showcase ? { showcase: true } : {}),
  cover: template.showcase
    ? {
        zhCN: `/examples/art/${template.showcase.artwork}-zh-CN.svg`,
        en: `/examples/art/${template.showcase.artwork}-en.svg`,
      }
    : {
        zhCN: `/examples/previews/${template.recipe}-zh-CN.svg`,
        en: `/examples/previews/${template.recipe}-en.svg`,
      },
}));
for (const template of catalog.filter((item) => !item.showcase)) {
  for (const locale of ["zh-CN", "en"]) {
    const uri = templatePreview(template, locale);
    const svg = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
    const directory = new URL(
      "../apps/web/public/examples/previews/",
      import.meta.url,
    );
    const path = new URL(`${template.recipe}-${locale}.svg`, directory);
    if (process.argv.includes("--check")) {
      if ((await readFile(path, "utf8")) !== svg)
        throw new Error(
          `Template preview is stale: ${template.recipe}/${locale}`,
        );
    } else {
      await mkdir(directory, { recursive: true });
      await writeFile(path, svg);
    }
  }
}
const showcase = richIndex.filter((template) => template.showcase);
for (const [name, data] of [
  ["index", index],
  ["showcase", showcase],
]) {
  const path = new URL(`../templates/${name}.json`, import.meta.url);
  if (process.argv.includes("--check")) {
    const current = JSON.parse(await readFile(path, "utf8"));
    if (JSON.stringify(current) !== JSON.stringify(data))
      throw new Error(
        `Template ${name} is stale. Run node scripts/generate-template-index.mjs, then format the template JSON files.`,
      );
  } else await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}
console.log(
  `Checked ${index.length} lightweight summaries and ${showcase.length} complete example previews.`,
);
