interface TemplateText {
  name: string;
  text: string;
}
interface TemplateNodeProps {
  w: number;
  h: number;
  chartType?: "mindmap" | "flowchart";
  imageSize?: "2:3" | "3:2";
  result?: string;
  src?: string;
  htmlContent?: string;
  chartData?: string;
}
export interface TemplatePreset {
  id: string;
  recipe: string;
  kind: "writing" | "image" | "chart" | "website" | "speech" | "file";
  name: string;
  description: string;
  tag: string;
  en: { name: string; description: string; tag: string };
  showcase?: {
    artwork: string;
    accent: string;
    cover: string;
    focus: string;
    description: string;
    stages: string[];
    en: { cover: string; description: string; stages: string[] };
  };
  nodes: Array<
    TemplateText & {
      id: string;
      type:
        | "instruction"
        | "ai-text"
        | "ai-image"
        | "speech"
        | "website"
        | "file"
        | "chart";
      column: number;
      row: number;
      artwork?: string;
      en: TemplateText & { props?: Partial<TemplateNodeProps> };
      props: TemplateNodeProps;
    }
  >;
  edges: [string, string][];
}

export type TemplateSummary = Omit<
  TemplatePreset,
  "nodes" | "edges" | "showcase"
> & {
  showcase?: true;
  cover: { zhCN: string; en: string };
};
export type ShowcasePreset = Omit<TemplatePreset, "nodes" | "showcase"> & {
  showcase: NonNullable<TemplatePreset["showcase"]>;
  nodes: Array<
    Pick<
      TemplatePreset["nodes"][number],
      "id" | "type" | "column" | "row" | "name"
    > & {
      en: { name: string };
      preview: { text: string; en: string; image?: string; enImage?: string };
    }
  >;
};
