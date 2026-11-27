import quickStartRecipes from "../../../../templates/quick-start.json";
import type { Template } from "@/api/client";
import { getLocale } from "./index";
import {
  templatePresetForId,
  templatePreview,
} from "@/features/canvas/template-catalog";

const quickStartById = new Map(
  quickStartRecipes.map((preset) => [preset.id, preset]),
);

export function localizeTemplate(template: Template): Template {
  const catalogPreset = templatePresetForId(template.id);
  const preset = catalogPreset ?? quickStartById.get(template.id);
  if (!preset) return template;
  const locale = getLocale();
  const localized = locale === "en" ? preset.en : preset;
  return {
    ...template,
    name: localized.name,
    description: localized.description,
    ...(catalogPreset && {
      cover: template.cover || templatePreview(catalogPreset, locale),
    }),
  };
}
export function templateTag(template: Template, tag: string) {
  const preset = templatePresetForId(template.id);
  if (preset && tag === preset.tag)
    return getLocale() === "en" ? preset.en.tag : preset.tag;
  const quickStart = quickStartById.get(template.id);
  if (quickStart && template.tags[0] === tag)
    return getLocale() === "en" ? quickStart.en.tag : quickStart.tag;
  return tag;
}
