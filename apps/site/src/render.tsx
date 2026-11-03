import { renderToString } from "react-dom/server";
import { App } from "./App";
import { Docs } from "./Docs";
import { documentFor, hasSiteRoute, routes } from "./content";
import { localeForPath, withoutLocale } from "./i18n";
import { messages } from "./messages";
import { translate } from "../../web/src/i18n/locale";
export { routes };
export { publicSiteURL, base } from "./config";

export function render(path: string) {
  const locale = localeForPath(path);
  const notFound = !hasSiteRoute(path);
  const guide = documentFor(path, locale);
  const docs = withoutLocale(path).startsWith("/docs");
  return {
    html: renderToString(
      <App
        path={path}
        documentation={
          docs && !notFound ? <Docs path={withoutLocale(path)} /> : undefined
        }
      />,
    ),
    locale,
    notFound,
    title: notFound
      ? translate(messages, locale, "errors.notFound.metaTitle")
      : docs
        ? `${guide.title} · ${locale === "en" ? "Huayu Docs" : "Huayu 画语文档"}`
        : locale === "en"
          ? "Huayu · An open-source canvas for AI creation"
          : "Huayu 画语 · 开源的 AI 创作画布",
    description:
      locale === "en"
        ? docs
          ? `Huayu ${guide.title}: connect materials, create, edit and build on your work locally.`
          : "An open-source AI canvas. Connect materials and models, create words, images and websites, then make the result your own."
        : docs
          ? `画语${guide.title}：在本地连接素材、生成作品、编辑与继续创作。`
          : "开源的 AI 创作画布。在本地整理素材、连接模型，生成文字、图片和网页，再沿着作品继续编辑与创作。",
  };
}
