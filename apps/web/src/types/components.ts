import type { BaseShape } from "@/canvas/engine/model";

export interface BaseAIComponentProps {
  type?: "text" | "image" | "speech" | "website" | "file";
  name?: string;
  description?: string;

  prompt?: string;
  text?: string;
  result?: string;
  isRunning: boolean;
  isLocked: boolean;
  showHelp: boolean;
  w: number;
  h: number;
  externalData?: string;
  useWebSearch?: boolean;
}

export type InstructionShape = BaseShape<"instruction", BaseAIComponentProps>;

export type AITextShape = BaseShape<"ai-text", BaseAIComponentProps>;

export type AIImageShape = BaseShape<
  "ai-image",
  BaseAIComponentProps & {
    src?: string;
    imageData?: string;
    imageSize?: string;
  }
>;

export type SpeechShape = BaseShape<
  "speech",
  BaseAIComponentProps & {
    src?: string;
    audioData?: string;
    duration?: number;
    isUploaded?: boolean;
  }
>;

export type WebsiteShape = BaseShape<
  "website",
  BaseAIComponentProps & {
    htmlContent?: string;
    previewUrl?: string;
  }
>;

export type FileShape = BaseShape<
  "file",
  BaseAIComponentProps & {
    src?: string;
    fileName?: string;
    fileExtension?: string;
    fileSize?: number;
    isUploaded?: boolean;

    fileContent?: string;
    fileType?: string;
  }
>;

export interface FrameContentData {
  frame: {
    id: string;
    name: string;
    bounds: { x: number; y: number; w: number; h: number };
    childCount: number;
    createdAt: number;
  };
  components: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    size: { w: number; h: number };
    props: Record<string, unknown>;
    content?: string;
    result?: string;
    name?: string;
    description?: string;
  }>;
  summary: string;
}

export type FrameShape = BaseShape<
  "frame",
  BaseAIComponentProps & {
    src?: string;
    frameData?: FrameContentData;
    imageBlob?: Blob;
    componentCount?: number;
  }
>;

export type ChartShape = BaseShape<
  "chart",
  BaseAIComponentProps & {
    chartType: "mindmap" | "flowchart";
    chartData?: string;
    generatedNodeIds?: string;
    generatedConnectionIds?: string;
  }
>;

export type DrawShape = BaseShape<
  "ai-draw",
  {
    query: string;
    isSubmitting: boolean;
    isCompleted: boolean;
    w: number;
    h: number;
  }
>;

export type StartShape = BaseShape<
  "start",
  {
    w: number;
    h: number;
    isLocked?: boolean;
    showHelp?: boolean;
  }
>;

export type InteractiveWebShape = BaseShape<
  "interactive-web",
  {
    w: number;
    h: number;
    url: string;
    webpageContent?: string;
    result: string;
    title?: string;
    description?: string;
    isLocked: boolean;
    isRunning: boolean;
    status: "idle" | "loading" | "loaded" | "error";
  }
>;

export type AIComponentShape =
  | InstructionShape
  | AITextShape
  | AIImageShape
  | SpeechShape
  | WebsiteShape
  | FileShape
  | FrameShape
  | DrawShape
  | StartShape
  | ChartShape
  | InteractiveWebShape;

export type ComponentType = AIComponentShape["type"];
export type ComponentPropsByType = {
  [Shape in AIComponentShape as Shape["type"]]: Shape["props"];
};

export interface ComponentExecutionResult {
  success: boolean;
  data: ComponentResultData;
  error?: string;
}

export interface ComponentResultData {
  result: string;
  name?: string;
  description?: string;

  src?: string;
  htmlContent?: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: number;

  isUploaded?: boolean;

  rawResponse?: unknown;
}
