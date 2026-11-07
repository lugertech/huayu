import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Editor, createCanvasStore } from "../apps/web/src/canvas/editor";
import { applyRecipe } from "../apps/web/src/canvas/recipes";
import { exportSVG } from "../apps/web/src/canvas/engine/export";
import { setLanguage } from "../apps/web/src/i18n";

const output = resolve(
  process.argv[2] || process.cwd(),
  "apps/web/public/examples/quick-start",
);
const width = 960;
const height = 540;
await mkdir(output, { recursive: true });
for (const locale of ["zh-CN", "en"] as const) {
  setLanguage(locale);
  for (const recipe of ["writing", "image", "chart", "website"]) {
    const editor = new Editor(createCanvasStore());
    applyRecipe(editor, recipe);
    const result = await exportSVG(
      editor,
      Array.from(editor.getCurrentPageShapeIds()),
      {
        background: true,
        padding: 32,
      },
    );
    if (!result) throw new Error(`Cannot export quick-start cover: ${recipe}`);
    const scale = Math.min(width / result.width, height / result.height);
    const x = (width - result.width * scale) / 2;
    const y = (height - result.height * scale) / 2;
    const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><g transform="translate(${x} ${y}) scale(${scale})">${result.svg}</g></svg>`;
    await writeFile(resolve(output, `${recipe}-${locale}.svg`), preview);
  }
}
console.log("Generated eight quick-start covers from the canvas recipes.");
