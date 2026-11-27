import { afterEach, expect, it, vi } from "vite-plus/test";
import { defaultSettings, newLanguageConnection } from "@/ai/model-config";
import { generateChart } from "./generation";

afterEach(() => vi.unstubAllGlobals());

it.each([
  {
    type: "mindmap" as const,
    wrapped: false,
    chart: { name: "Ideas", content: "Root", children: [], custom: 1 },
  },
  {
    type: "flowchart" as const,
    wrapped: true,
    chart: {
      description: "Process",
      nodes: [
        {
          id: "a",
          type: "custom",
          data: { label: "First", nodeType: "custom" },
        },
      ],
      edges: [],
    },
  },
])(
  "preserves the full $type payload (wrapped=$wrapped)",
  async ({ type, wrapped, chart }) => {
    const content = JSON.stringify(wrapped ? { data: chart } : chart);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ choices: [{ message: { content } }] })),
    );
    const settings = defaultSettings();
    settings.language.push({
      ...newLanguageConnection(),
      baseUrl: "https://model.example/v1",
      model: "example",
    });
    await expect(
      generateChart({
        type,
        inputs: [{ type: "text", text: "draw" }],
        settings,
      }),
    ).resolves.toEqual(chart);
  },
);
