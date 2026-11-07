import { t, type Locale, type MessageKey } from "@/i18n";
import type {
  BaseAIComponentProps,
  ComponentPropsByType,
  ComponentType,
} from "@/types/components";
import {
  MessageSquare,
  Type,
  ImagePlay,
  Volume2,
  Globe,
  ExternalLink,
  FileText,
  Brush,
  Play,
  Frame,
  ChartNetwork,
} from "lucide-react";

export type { ComponentType } from "@/types/components";

export function componentPlaceholder(type: string, locale?: Locale) {
  return (
    {
      instruction: t(
        "canvas.components.instruction.placeholder",
        undefined,
        locale,
      ),
      "ai-text": t("canvas.components.text.placeholder", undefined, locale),
      "ai-image": t("canvas.components.image.placeholder", undefined, locale),
      speech: t("canvas.components.speech.placeholder", undefined, locale),
      website: t("canvas.components.website.placeholder", undefined, locale),
      chart: t("canvas.components.chart.placeholder", undefined, locale),
    }[type] || t("canvas.components.file.placeholder", undefined, locale)
  );
}

export interface ComponentConfig {
  name: string;
  displayName: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  defaultSize: { w: number; h: number };
  showHelp: boolean;
  helpContent: string;
  description: string;
}

function createComponentConfigs(
  locale?: Locale,
): Record<ComponentType, ComponentConfig> {
  const translate = (key: MessageKey) => t(key, undefined, locale);
  return {
    instruction: {
      name: "Instruction",
      get displayName() {
        return translate("canvas.components.creativeInstruction");
      },
      icon: MessageSquare,
      defaultSize: { w: 340, h: 260 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.instruction.help");
      },
      get description() {
        return translate("canvas.components.instruction.description");
      },
    },
    "ai-text": {
      name: "Text",
      get displayName() {
        return translate("common.textContent");
      },
      icon: Type,
      defaultSize: { w: 320, h: 220 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.text.help");
      },
      get description() {
        return translate("canvas.components.text.description");
      },
    },
    "ai-image": {
      name: "Image",
      get displayName() {
        return translate("canvas.components.aiImage");
      },
      icon: ImagePlay,
      defaultSize: { w: 400, h: 440 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.image.help");
      },
      get description() {
        return translate("canvas.components.image.description");
      },
    },
    speech: {
      name: "Speech",
      get displayName() {
        return translate("canvas.components.speech");
      },
      icon: Volume2,
      defaultSize: { w: 360, h: 160 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.speech.help");
      },
      get description() {
        return translate("canvas.components.speech.description");
      },
    },
    website: {
      name: "Website",
      get displayName() {
        return translate("canvas.components.website");
      },
      icon: Globe,
      defaultSize: { w: 400, h: 300 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.website.help");
      },
      get description() {
        return translate("canvas.components.website.description");
      },
    },
    file: {
      name: "File",
      get displayName() {
        return translate("common.file");
      },
      icon: FileText,
      defaultSize: { w: 300, h: 200 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.file.help");
      },
      get description() {
        return translate("canvas.components.file.description");
      },
    },
    start: {
      name: "Start",
      get displayName() {
        return translate("canvas.components.run");
      },
      icon: Play,
      defaultSize: { w: 80, h: 80 },
      showHelp: false,
      helpContent: "",
      get description() {
        return translate("canvas.components.runConnectedCreativeStepsFromHere");
      },
    },
    chart: {
      name: "Chart",
      get displayName() {
        return translate("common.chart");
      },
      icon: ChartNetwork,
      defaultSize: { w: 600, h: 400 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.chart.help");
      },
      get description() {
        return translate("canvas.components.chart.description");
      },
    },
    "interactive-web": {
      name: "InteractiveWeb",
      get displayName() {
        return translate("canvas.components.externalLink");
      },
      icon: ExternalLink,
      defaultSize: { w: 800, h: 600 },
      showHelp: true,
      get helpContent() {
        return translate("canvas.components.embedAnExternalPage");
      },
      get description() {
        return translate(
          "canvas.components.embedAPageOrUseItsContentAsMaterial",
        );
      },
    },
    frame: {
      name: "Frame",
      get displayName() {
        return translate("canvas.frame");
      },
      icon: Frame,
      defaultSize: { w: 400, h: 300 },
      showHelp: false,
      helpContent: "",
      get description() {
        return translate("canvas.components.frame.description");
      },
    },
    "ai-draw": {
      name: "Draw",
      get displayName() {
        return translate("canvas.components.aiDrawing");
      },
      icon: Brush,
      defaultSize: { w: 450, h: 200 },
      showHelp: false,
      helpContent: "",
      get description() {
        return translate(
          "canvas.components.drawAndEditOnTheCanvasFromYourInstructions",
        );
      },
    },
  };
}

export const COMPONENT_CONFIGS = createComponentConfigs();
const localizedComponentConfigs = {
  "zh-CN": createComponentConfigs("zh-CN"),
  en: createComponentConfigs("en"),
};

export function componentConfig(type: ComponentType, locale: Locale) {
  return localizedComponentConfigs[locale][type];
}

function baseComponentProps(
  type: ComponentType,
  inputType: BaseAIComponentProps["type"],
): BaseAIComponentProps {
  const config = COMPONENT_CONFIGS[type];
  return {
    type: inputType,
    name: undefined,
    description: undefined,
    text: "",
    result: undefined,
    isRunning: false,
    isLocked: false,
    showHelp: config.showHelp,
    ...config.defaultSize,
    externalData: undefined,
  };
}

const componentPropsFactories: {
  [Type in ComponentType]: () => ComponentPropsByType[Type];
} = {
  instruction: () => baseComponentProps("instruction", "text"),
  "ai-text": () => baseComponentProps("ai-text", "text"),
  "ai-image": () => ({
    ...baseComponentProps("ai-image", "image"),
    src: undefined,
    imageData: undefined,
  }),
  speech: () => ({
    ...baseComponentProps("speech", "speech"),
    src: undefined,
    audioData: undefined,
    duration: undefined,
    isUploaded: undefined,
  }),
  website: () => ({
    ...baseComponentProps("website", "website"),
    htmlContent: undefined,
    previewUrl: undefined,
  }),
  file: () => ({
    ...baseComponentProps("file", "file"),
    src: undefined,
    fileName: undefined,
    fileExtension: undefined,
    fileSize: undefined,
    isUploaded: undefined,
  }),
  frame: () => baseComponentProps("frame", "text"),
  chart: () => ({
    ...baseComponentProps("chart", "text"),
    chartType: "mindmap",
    chartData: undefined,
    generatedNodeIds: undefined,
    generatedConnectionIds: undefined,
  }),
  "ai-draw": () => ({
    ...COMPONENT_CONFIGS["ai-draw"].defaultSize,
    query: "",
    isSubmitting: false,
    isCompleted: false,
  }),
  start: () => ({
    ...COMPONENT_CONFIGS.start.defaultSize,
    isLocked: false,
    showHelp: false,
  }),
  "interactive-web": () => ({
    ...COMPONENT_CONFIGS["interactive-web"].defaultSize,
    url: "",
    webpageContent: "",
    result: "",
    title: "",
    description: "",
    isLocked: false,
    isRunning: false,
    status: "idle",
  }),
};

export function getDefaultComponentProps<Type extends ComponentType>(
  type: Type,
): ComponentPropsByType[Type] {
  return componentPropsFactories[type]();
}
