import startEn from "../../../docs/en/GETTING_STARTED.md?raw";
import modelsEn from "../../../docs/en/MODEL_SETUP.md?raw";
import canvasEn from "../../../docs/en/USER_GUIDE.md?raw";
import recordingEn from "../../../docs/en/RECORDING_GUIDE.md?raw";
import deploymentEn from "../../../docs/en/DEPLOYMENT.md?raw";
import faqEn from "../../../docs/en/TROUBLESHOOTING.md?raw";
import architectureEn from "../../../docs/en/ARCHITECTURE.md?raw";
import apiEn from "../../../docs/en/API.md?raw";
import licensingEn from "../../../docs/en/LICENSING.md?raw";
import thirdPartyEn from "../../../docs/en/THIRD_PARTY_NOTICES.md?raw";
import contributingEn from "../../../docs/en/CONTRIBUTING.md?raw";
import securityEn from "../../../docs/en/SECURITY.md?raw";
import changelogEn from "../../../docs/en/CHANGELOG.md?raw";
import releaseEn from "../../../docs/en/RELEASE.md?raw";
import verificationEn from "../../../docs/en/VERIFICATION.md?raw";
import featureParityEn from "../../../docs/en/FEATURE_PARITY.md?raw";
import dependenciesEn from "../../../docs/en/DEPENDENCY_LICENSES.md?raw";
import designEn from "../../../docs/en/PRODUCT_DESIGN.md?raw";
import themeEn from "../../../docs/en/THEME.md?raw";
import codeStyleEn from "../../../docs/en/CODE_STYLE.md?raw";
import { translate, type Locale } from "../../web/src/i18n/locale";
import { messages, type MessageKey } from "./messages";
import { localeForPath, withoutLocale, localizedPath } from "./i18n";
import start from "../../../docs/GETTING_STARTED.md?raw";
import models from "../../../docs/MODEL_SETUP.md?raw";
import canvas from "../../../docs/USER_GUIDE.md?raw";
import recording from "../../../docs/RECORDING_GUIDE.md?raw";
import deployment from "../../../docs/DEPLOYMENT.md?raw";
import faq from "../../../docs/TROUBLESHOOTING.md?raw";
import architecture from "../../../docs/ARCHITECTURE.md?raw";
import api from "../../../docs/API.md?raw";
import licensing from "../../../docs/LICENSING.md?raw";
import thirdParty from "../../../THIRD_PARTY_NOTICES.md?raw";
import contributing from "../../../CONTRIBUTING.md?raw";
import security from "../../../SECURITY.md?raw";
import changelog from "../../../CHANGELOG.md?raw";
import release from "../../../docs/RELEASE.md?raw";
import verification from "../../../docs/VERIFICATION.md?raw";
import license from "../../../LICENSE?raw";
import featureParity from "../../../docs/FEATURE_PARITY.md?raw";
import dependencies from "../../../docs/DEPENDENCY_LICENSES.md?raw";
import design from "../../../docs/PRODUCT_DESIGN.md?raw";
import theme from "../../../docs/THEME.md?raw";
import codeStyle from "../../api-rust/CODE_STYLE.md?raw";
import { repositoryURL, sitePath } from "./config";

export const documentGroups = {
  gettingStarted: "docs.groups.gettingStarted",
  maintenance: "docs.groups.maintenance",
  development: "docs.groups.development",
} as const satisfies Record<string, MessageKey>;

const documents = [
  {
    slug: "getting-started",
    file: "GETTING_STARTED.md",
    titleKey: "docs.titles.gettingStarted",
    group: "gettingStarted",
    content: start,
  },
  {
    slug: "models",
    file: "MODEL_SETUP.md",
    titleKey: "docs.titles.models",
    group: "gettingStarted",
    content: models,
  },
  {
    slug: "canvas",
    file: "USER_GUIDE.md",
    titleKey: "docs.titles.canvas",
    group: "gettingStarted",
    content: canvas,
  },
  {
    slug: "recording",
    file: "RECORDING_GUIDE.md",
    titleKey: "docs.titles.recordings",
    group: "gettingStarted",
    content: recording,
  },
  {
    slug: "deployment",
    file: "DEPLOYMENT.md",
    titleKey: "docs.titles.deployment",
    group: "maintenance",
    content: deployment,
  },
  {
    slug: "faq",
    file: "TROUBLESHOOTING.md",
    titleKey: "docs.titles.troubleshooting",
    group: "maintenance",
    content: faq,
  },
  {
    slug: "security",
    file: "SECURITY.md",
    titleKey: "docs.titles.security",
    group: "maintenance",
    content: security,
  },
  {
    slug: "changelog",
    file: "CHANGELOG.md",
    titleKey: "docs.titles.changelog",
    group: "maintenance",
    content: changelog,
  },
  {
    slug: "contributing",
    file: "CONTRIBUTING.md",
    titleKey: "docs.titles.contributing",
    group: "development",
    content: contributing,
  },
  {
    slug: "architecture",
    file: "ARCHITECTURE.md",
    titleKey: "docs.titles.architecture",
    group: "development",
    content: architecture,
  },
  {
    slug: "api",
    file: "API.md",
    titleKey: "docs.titles.api",
    group: "development",
    content: api,
  },
  {
    slug: "code-style",
    file: "CODE_STYLE.md",
    titleKey: "docs.titles.codeStyle",
    group: "development",
    content: codeStyle,
  },
  {
    slug: "licensing",
    file: "LICENSING.md",
    titleKey: "docs.titles.licensing",
    group: "development",
    content: licensing,
  },
  {
    slug: "third-party",
    file: "THIRD_PARTY_NOTICES.md",
    titleKey: "docs.titles.thirdParty",
    group: "development",
    content: thirdParty,
  },
  {
    slug: "license",
    file: "LICENSE",
    titleKey: "docs.titles.license",
    group: "development",
    content: `# MIT License\n\n\x60\x60\x60text\n${license}\n\x60\x60\x60`,
  },
  {
    slug: "release",
    file: "RELEASE.md",
    titleKey: "docs.titles.release",
    group: "development",
    content: release,
  },
  {
    slug: "verification",
    file: "VERIFICATION.md",
    titleKey: "docs.titles.verification",
    group: "development",
    content: verification,
  },
  {
    slug: "features",
    file: "FEATURE_PARITY.md",
    titleKey: "docs.titles.features",
    group: "development",
    content: featureParity,
  },
  {
    slug: "dependencies",
    file: "DEPENDENCY_LICENSES.md",
    titleKey: "docs.titles.dependencies",
    group: "development",
    content: dependencies,
  },
  {
    slug: "design",
    file: "PRODUCT_DESIGN.md",
    titleKey: "docs.titles.design",
    group: "development",
    content: design,
  },
  {
    slug: "theme",
    file: "THEME.md",
    titleKey: "docs.titles.theme",
    group: "development",
    content: theme,
  },
] satisfies Array<{
  slug: string;
  file: string;
  titleKey: MessageKey;
  group: keyof typeof documentGroups;
  content: string;
}>;

export type Guide = (typeof documents)[number] & { title: string };
const englishBySlug: Record<string, string> = {
  "getting-started": startEn,
  models: modelsEn,
  canvas: canvasEn,
  recording: recordingEn,
  deployment: deploymentEn,
  faq: faqEn,
  architecture: architectureEn,
  api: apiEn,
  licensing: licensingEn,
  "third-party": thirdPartyEn,
  contributing: contributingEn,
  security: securityEn,
  changelog: changelogEn,
  release: releaseEn,
  verification: verificationEn,
  features: featureParityEn,
  dependencies: dependenciesEn,
  design: designEn,
  theme: themeEn,
  "code-style": codeStyleEn,
};
const chineseDocuments = documents.map((doc) => ({
  ...doc,
  title: translate(messages, "zh-CN", doc.titleKey),
}));
const englishDocuments = documents.map((doc) => ({
  ...doc,
  title: translate(messages, "en", doc.titleKey),
  content: englishBySlug[doc.slug] || doc.content,
}));
export function documentsFor(locale: Locale = "zh-CN") {
  return locale === "en" ? englishDocuments : chineseDocuments;
}
export { routes, hasSiteRoute } from "./routes";
export function documentFor(
  path: string,
  locale: Locale = localeForPath(path),
) {
  const docs = documentsFor(locale);
  const slug = withoutLocale(path)
    .replace(/^\/docs\/?/, "")
    .replace(/\/$/, "");
  return docs.find((doc) => doc.slug === slug) || docs[0];
}
export function documentLink(href: string, locale: Locale = "zh-CN") {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [pathname, hash = ""] = href.split("#");
  const file = pathname.split("/").pop();
  const doc = documents.find(
    (item) => item.file.toLowerCase() === file?.toLowerCase(),
  );
  if (doc)
    return `${localizedPath(`docs/${doc.slug}/`, locale)}${hash ? `#${hash}` : ""}`;
  if (file === "README.md" || file === "README")
    return localizedPath(
      hash ? "docs/licensing/" : "docs/getting-started/",
      locale,
    );
  if (pathname.includes("licenses/"))
    return `${sitePath(pathname.slice(pathname.indexOf("licenses/")))}${hash ? `#${hash}` : ""}`;
  if (pathname.endsWith("fonts/OFL.txt"))
    return sitePath("licenses/NotoSansSC-OFL.txt");
  return repositoryURL
    ? `${repositoryURL}/blob/HEAD/${pathname.replace(/^(\.\.\/|\.\/)+/, "")}`
    : localizedPath("docs/architecture/", locale);
}
