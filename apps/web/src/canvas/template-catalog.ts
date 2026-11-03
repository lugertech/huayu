import summaries from "../../../../templates/index.json";

import type { TemplateSummary } from "../../../../templates/types";
export type {
  TemplatePreset,
  TemplateSummary,
} from "../../../../templates/types";

export const templateSummaries = summaries as TemplateSummary[];
const byRecipe = new Map(templateSummaries.map((item) => [item.recipe, item]));
const byId = new Map(templateSummaries.map((item) => [item.id, item]));

export function templatePresetForRecipe(recipe?: string) {
  return recipe ? byRecipe.get(recipe) : undefined;
}
export function templatePresetForId(id: string) {
  return byId.get(id);
}
export function recipeKind(recipe?: string) {
  return templatePresetForRecipe(recipe)?.kind || recipe || "writing";
}

/** Covers are built from the same authored catalog, without loading full workflows. */
export function templatePreview(preset: TemplateSummary, locale: string) {
  return locale === "en" ? preset.cover.en : preset.cover.zhCN;
}
