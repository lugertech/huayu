import type { Template } from "@/api/client";
import { t, getLocale } from "./index";
import type { MessageKey } from "./messages";
import {
  templatePresetForId,
  templatePreview,
} from "@/canvas/template-catalog";

const builtinMessages = new Map<
  string,
  { name: MessageKey; description: MessageKey; tag: MessageKey }
>([
  [
    "builtin-writing",
    {
      name: "templates.writing.name",
      description: "templates.writing.description",
      tag: "templates.tags.writing",
    },
  ],
  [
    "builtin-image",
    {
      name: "templates.image.name",
      description: "templates.image.description",
      tag: "templates.tags.visual",
    },
  ],
  [
    "builtin-chart",
    {
      name: "templates.chart.name",
      description: "templates.chart.description",
      tag: "templates.tags.learning",
    },
  ],
  [
    "builtin-web",
    {
      name: "templates.web.name",
      description: "templates.web.description",
      tag: "templates.tags.product",
    },
  ],
]);
export function localizeTemplate(template: Template): Template {
  const preset = templatePresetForId(template.id);
  if (preset) {
    const localized = getLocale() === "en" ? preset.en : preset;
    return {
      ...template,
      name: localized.name,
      description: localized.description,
      cover: template.cover || templatePreview(preset, getLocale()),
    };
  }
  const keys = builtinMessages.get(template.id);
  if (!keys) return template;
  return {
    ...template,
    name: t(keys.name),
    description: t(keys.description),
  };
}
export function templateTag(template: Template, tag: string) {
  const preset = templatePresetForId(template.id);
  if (preset && tag === preset.tag)
    return getLocale() === "en" ? preset.en.tag : preset.tag;
  const keys = builtinMessages.get(template.id);
  return keys && template.tags[0] === tag ? t(keys.tag) : tag;
}
