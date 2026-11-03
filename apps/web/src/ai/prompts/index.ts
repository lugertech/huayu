import { getLocale, type Locale } from "@/i18n";
import procedure from "./instruction_procedure.md?raw";
import execute from "./instruction_execute.md?raw";
import website from "./website.md?raw";
import filename from "./filename.md?raw";
import mindmap from "./chart-mindmap.md?raw";
import flowchart from "./chart-flow.md?raw";
import agent from "./agent.md?raw";
import procedureEn from "./en/instruction_procedure.md?raw";
import executeEn from "./en/instruction_execute.md?raw";
import websiteEn from "./en/website.md?raw";
import filenameEn from "./en/filename.md?raw";
import mindmapEn from "./en/chart-mindmap.md?raw";
import flowchartEn from "./en/chart-flow.md?raw";

const prompts = {
  "zh-CN": { procedure, execute, website, filename, mindmap, flowchart, agent },
  en: {
    procedure: procedureEn,
    execute: executeEn,
    website: websiteEn,
    filename: filenameEn,
    mindmap: mindmapEn,
    flowchart: flowchartEn,
    agent,
  },
};
export function modelPrompts(locale: Locale = getLocale()) {
  const policy =
    locale === "en"
      ? "\nOutput language: English by default. Follow an explicit user request for another language. Preserve source names, quotes and code. Do not change JSON keys or action schemas."
      : "\n输出语言：默认使用简体中文；用户明确要求其他语言时遵循用户要求。保留原文姓名、引用和代码，不改变 JSON 字段或操作格式。";
  return Object.fromEntries(
    Object.entries(prompts[locale]).map(([key, text]) => [key, text + policy]),
  ) as (typeof prompts)["en"];
}
