import { api, type Project } from "@/api/client";
import { t } from "@/i18n";

export function createBlankProject() {
  return api<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: t("projects.untitled") }),
  });
}
