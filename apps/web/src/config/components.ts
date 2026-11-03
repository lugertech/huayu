import { t } from "@/i18n";
import {
  MessageSquare,
  Type,
  ImagePlay,
  Volume2,
  Globe,
  FileText,
  Brush,
  Play,
  Square,
  ChartNetwork,
} from "lucide-react";

// AI组件类型定义 - 使用新的类型名避免与画布内置组件冲突
export type ComponentType =
  | "instruction"
  | "ai-text"
  | "ai-image"
  | "speech"
  | "website"
  | "file"
  | "frame"
  | "ai-draw"
  | "start"
  | "chart"
  | "interactive-web";

export function componentPlaceholder(type: string) {
  return (
    {
      instruction: t("canvas.components.instruction.placeholder"),
      "ai-text": t("canvas.components.text.placeholder"),
      "ai-image": t("canvas.components.image.placeholder"),
      speech: t("canvas.components.speech.placeholder"),
      website: t("canvas.components.website.placeholder"),
      chart: t("canvas.components.chart.placeholder"),
    }[type] || t("canvas.components.file.placeholder")
  );
}

// 组件配置接口
export interface ComponentConfig {
  name: string;
  displayName: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  defaultSize: { w: number; h: number };
  showHelp: boolean;
  helpContent: string;
  description: string;
}

// AI组件配置
export const COMPONENT_CONFIGS: Record<ComponentType, ComponentConfig> = {
  instruction: {
    name: "Instruction",
    get displayName() {
      return t("canvas.components.creativeInstruction");
    },
    icon: MessageSquare,
    defaultSize: { w: 340, h: 260 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.instruction.help");
    },
    get description() {
      return t("canvas.components.instruction.description");
    },
  },
  "ai-text": {
    name: "Text",
    get displayName() {
      return t("common.textContent");
    },
    icon: Type,
    defaultSize: { w: 320, h: 220 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.text.help");
    },
    get description() {
      return t("canvas.components.text.description");
    },
  },
  "ai-image": {
    name: "Image",
    get displayName() {
      return t("canvas.components.aiImage");
    },
    icon: ImagePlay,
    defaultSize: { w: 400, h: 440 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.image.help");
    },
    get description() {
      return t("canvas.components.image.description");
    },
  },
  speech: {
    name: "Speech",
    get displayName() {
      return t("common.speech");
    },
    icon: Volume2,
    defaultSize: { w: 360, h: 160 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.speech.help");
    },
    get description() {
      return t("canvas.components.speech.description");
    },
  },
  website: {
    name: "Website",
    get displayName() {
      return t("canvas.components.website");
    },
    icon: Globe,
    defaultSize: { w: 400, h: 300 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.website.help");
    },
    get description() {
      return t("canvas.components.website.description");
    },
  },
  file: {
    name: "File",
    get displayName() {
      return t("common.file");
    },
    icon: FileText,
    defaultSize: { w: 300, h: 200 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.file.help");
    },
    get description() {
      return t("canvas.components.file.description");
    },
  },
  start: {
    name: "Start",
    get displayName() {
      return t("canvas.components.run");
    },
    icon: Play,
    defaultSize: { w: 80, h: 80 },
    showHelp: false,
    helpContent: "",
    get description() {
      return t("canvas.components.runConnectedCreativeStepsFromHere");
    },
  },
  chart: {
    name: "Chart",
    get displayName() {
      return t("common.chart");
    },
    icon: ChartNetwork,
    defaultSize: { w: 600, h: 400 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.chart.help");
    },
    get description() {
      return t("canvas.components.chart.description");
    },
  },
  "interactive-web": {
    name: "InteractiveWeb",
    get displayName() {
      return t("canvas.components.externalLink");
    },
    icon: Globe,
    defaultSize: { w: 800, h: 600 },
    showHelp: true,
    get helpContent() {
      return t("canvas.components.embedAnExternalPage");
    },
    get description() {
      return t("canvas.components.embedAPageOrUseItsContentAsMaterial");
    },
  },
  frame: {
    name: "Frame",
    get displayName() {
      return t("canvas.frame");
    },
    icon: Square,
    defaultSize: { w: 400, h: 300 },
    showHelp: false,
    helpContent: "",
    get description() {
      return t("canvas.components.frame.description");
    },
  },
  "ai-draw": {
    name: "Draw",
    get displayName() {
      return t("canvas.components.aiDrawing");
    },
    icon: Brush,
    defaultSize: { w: 450, h: 200 },
    showHelp: false,
    helpContent: "",
    get description() {
      return t("canvas.components.drawAndEditOnTheCanvasFromYourInstructions");
    },
  },
};

// 🚀 新版本不再使用DEFAULT_PROMPTS，移除prompt相关代码
// 保留这个注释作为记录，统一使用AI API直接处理提示词生成

// 组件默认props (移除prompt字段 - 新版本不再使用prompt)
export const getDefaultComponentProps = (type: ComponentType) => {
  // Draw组件有特殊的属性结构
  if (type === "ai-draw") {
    return {
      query: "",
      isSubmitting: false,
      isCompleted: false,
      w: COMPONENT_CONFIGS[type].defaultSize.w,
      h: COMPONENT_CONFIGS[type].defaultSize.h,
    };
  }

  // Start组件的属性结构（与后端schema保持一致）
  if (type === "start") {
    return {
      w: COMPONENT_CONFIGS[type].defaultSize.w,
      h: COMPONENT_CONFIGS[type].defaultSize.h,
      isLocked: false, // 添加锁定状态
      showHelp: false, // 添加帮助状态
    };
  }

  // InteractiveWeb组件的属性结构
  if (type === "interactive-web") {
    return {
      w: COMPONENT_CONFIGS[type].defaultSize.w,
      h: COMPONENT_CONFIGS[type].defaultSize.h,
      url: "",
      webpageContent: "",
      result: "",
      title: "",
      description: "",
      isLocked: false,
      isRunning: false,
      status: "idle" as const,
    };
  }

  // 其他AI组件的标准属性
  return {
    // 🆕 新增字段 - 修复instruction类型映射
    type:
      type === "instruction"
        ? "text"
        : type === "ai-text"
          ? "text"
          : type === "ai-image"
            ? "image"
            : type === "speech"
              ? "speech"
              : type === "website"
                ? "website"
                : type === "file"
                  ? "file"
                  : "text",
    name: undefined, // AI生成的名称（初始为空）
    description: undefined, // AI生成的描述（初始为空）

    // 🔧 新版本基础字段 (移除prompt字段)
    text: "", // 🔄 使用text替代content
    result: undefined,
    isRunning: false,
    isLocked: false,
    showHelp: COMPONENT_CONFIGS[type].showHelp,
    w: COMPONENT_CONFIGS[type].defaultSize.w,
    h: COMPONENT_CONFIGS[type].defaultSize.h,
    externalData: undefined,

    // 🔄 组件特定属性使用统一的属性名
    ...(type === "ai-image" && {
      src: undefined, // 🔄 统一使用src (原imageUrl)
      imageData: undefined, // 保留用于特殊情况
    }),
    ...(type === "speech" && {
      src: undefined, // 🔄 统一使用src (原audioUrl)
      audioData: undefined, // 保留用于特殊情况
      duration: undefined,
      isUploaded: undefined, // 🆕 是否用户上传
    }),
    ...(type === "website" && {
      htmlContent: undefined, // HTML内容用于iframe预览
      previewUrl: undefined, // 保留用于特殊情况
    }),
    ...(type === "file" && {
      src: undefined, // 🔄 统一使用src (原fileContent在result中)
      fileName: undefined, // 文件名
      fileExtension: undefined, // 🔄 重命名 (原fileType)
      fileSize: undefined, // 文件大小
      isUploaded: undefined, // 🆕 是否用户上传
    }),
    ...(type === "chart" && {
      chartType: "mindmap", // 默认思维导图
      chartData: undefined,
      generatedNodeIds: undefined,
      generatedConnectionIds: undefined,
    }),
  };
};
