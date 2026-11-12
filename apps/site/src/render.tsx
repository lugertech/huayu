import { renderToString } from "react-dom/server";
import { App } from "./App";
import { DocsPage } from "./pages/DocsPage";
import { documentFor, hasSiteRoute, routes } from "./content";
import { homeTitle, localeForPath, withoutLocale } from "./i18n";
import { messages } from "./messages";
import { translate } from "../../web/src/i18n/locale";
export { routes };
export { publicSiteURL, base } from "./config";

export function render(path: string) {
  const locale = localeForPath(path);
  const notFound = !hasSiteRoute(path);
  const guide = documentFor(path, locale);
  const docs = withoutLocale(path).startsWith("/docs");
  const name = translate(messages, locale, "app.name");
  return {
    html: renderToString(
      <App
        path={path}
        documentation={
          docs && !notFound ? (
            <DocsPage path={withoutLocale(path)} />
          ) : undefined
        }
      />,
    ),
    locale,
    notFound,
    title: notFound
      ? translate(messages, locale, "errors.notFound.metaTitle")
      : docs
        ? translate(messages, locale, "docs.pageTitle", { arg0: guide.title })
        : homeTitle(locale),
    description:
      locale === "en"
        ? docs
          ? `${name} ${guide.title}: connect materials, create, edit and build on your work locally.`
          : "An open-source AI canvas. Connect materials and models, create words, images and websites, then make the result your own."
        : docs
          ? `${name}${guide.title}：在本地连接素材、生成作品、编辑与继续创作。`
          : "开源的 AI 创作画布。在本地整理素材、连接模型，生成文字、图片和网页，再沿着作品继续编辑与创作。",
  };
}
