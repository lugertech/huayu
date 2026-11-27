import { LocalizedError } from "@/i18n/errors";
import { modelPrompts } from "@/ai/prompts";
import {
  getSettings,
  requireConnection,
  type ModelSettings,
} from "@/ai/settings";
import { t } from "@/i18n";
import { chat, parseModelJSON } from "../ai/provider";
import { messagesForInputs, type AIAPIInput } from "./backend";

export type ChartType = "mindmap" | "flowchart";
export interface MindmapChartData {
  content: string;
  children: MindmapChartData[];
  name?: string;
  description?: string;
}
export interface FlowchartChartData {
  nodes: Array<{
    id: string;
    type: string;
    data: { label: string; nodeType: string };
  }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
  name?: string;
  description?: string;
}
export type ChartData = MindmapChartData | FlowchartChartData;
export async function generateChart(params: {
  inputs: AIAPIInput[];
  type: ChartType;
  signal?: AbortSignal;
  settings?: ModelSettings;
}): Promise<ChartData> {
  const settings = params.settings ?? getSettings();
  const prompts = modelPrompts();
  const { messages, hasImages } = await messagesForInputs(
    params.type === "mindmap" ? prompts.mindmap : prompts.flowchart,
    t("api.generateTheRequestedChart"),
    params.inputs,
    params.signal,
    settings,
  );
  const capability = hasImages ? "vision" : "text";
  const value = parseModelJSON<Record<string, unknown>>(
    await chat(messages, {
      capability,
      connection: requireConnection(capability, settings),
      signal: params.signal,
    }),
  );
  const data = (value.data || value) as ChartData;
  if (
    params.type === "mindmap"
      ? !("content" in data && Array.isArray(data.children))
      : !(
          "nodes" in data &&
          Array.isArray(data.nodes) &&
          Array.isArray(data.edges)
        )
  )
    throw new LocalizedError({
      key: "api.theModelReturnedAnInvalidChartFormat",
    });
  return data;
}
export function validateFile(
  file: File,
  options: { maxSize?: number; allowedTypes?: string[] } = {},
): { valid: true } | { valid: false; error: LocalizedError } {
  if (file.size > (options.maxSize || 10 * 1024 * 1024))
    return {
      valid: false,
      error: new LocalizedError({ key: "api.fileExceedsTheSizeLimit" }),
    };
  if (options.allowedTypes && !options.allowedTypes.includes(file.type))
    return {
      valid: false,
      error: new LocalizedError({ key: "api.unsupportedFileFormat" }),
    };
  return { valid: true };
}
