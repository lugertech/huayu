import { t } from "@/i18n";
// types/components.ts - AI组件类型定义 (更新版本)
import { BaseShape } from "@/canvas/editor";

// ===================== 基础AI组件属性 =====================

export interface BaseAIComponentProps {
  // 🆕 新增属性
  type?: string; // 组件类型标识 ('text'|'image'|'speech'|'website'|'file')
  name?: string; // AI生成的名称
  description?: string; // AI生成的描述

  // 原有属性
  prompt?: string; // 提示词（可选，用于向后兼容）
  text?: string; // 🔄 破坏性更新：content改为text
  result?: string; // API调用结果
  isRunning: boolean; // 运行状态
  isLocked: boolean; // 锁定状态
  showHelp: boolean; // 是否显示帮助
  w: number; // 宽度
  h: number; // 高度
  externalData?: string; // 外部传递的原始数据（用于API调用）
  useWebSearch?: boolean; // 是否启用联网搜索（仅Instruction组件使用）
}

// ===================== 各组件Shape类型定义 =====================

// Instruction组件Shape类型
export type InstructionShape = BaseShape<"instruction", BaseAIComponentProps>;

// Text组件Shape类型 - 改为ai-text避免与画布内置text冲突
export type AITextShape = BaseShape<"ai-text", BaseAIComponentProps>;

// Image组件Shape类型 - 改为ai-image避免与画布内置image冲突
export type AIImageShape = BaseShape<
  "ai-image",
  BaseAIComponentProps & {
    src?: string; // 🔄 统一使用src (原imageUrl)
    imageData?: string; // 图片数据(base64) - 保留用于特殊情况
    imageSize?: string; // 🆕 图片尺寸比例 (如 "1:1", "4:3" 等)
  }
>;

// Speech组件Shape类型
export type SpeechShape = BaseShape<
  "speech",
  BaseAIComponentProps & {
    src?: string; // 🔄 统一使用src (原audioUrl)
    audioData?: string; // 音频数据 - 保留用于特殊情况
    duration?: number; // 音频时长
    isUploaded?: boolean; // 🆕 是否用户上传
  }
>;

// Website组件Shape类型
export type WebsiteShape = BaseShape<
  "website",
  BaseAIComponentProps & {
    htmlContent?: string; // HTML内容 (用于iframe预览)
    previewUrl?: string; // 预览URL - 保留用于特殊情况
  }
>;

// File组件Shape类型 - 更新版本
export type FileShape = BaseShape<
  "file",
  BaseAIComponentProps & {
    // 🔧 File组件特有属性
    src?: string; // 🔄 统一使用src (文件URL)
    fileName?: string; // 文件名
    fileExtension?: string; // 🔄 文件扩展名 (原fileType改名)
    fileSize?: number; // 文件大小 (字节)
    isUploaded?: boolean; // 🆕 是否用户上传

    // 🔧 向后兼容性字段 (废弃但保留)
    fileContent?: string; // 🔄 废弃：文件内容现在存储在text字段中
    fileType?: string; // 🔄 废弃：重命名为fileExtension
  }
>;

// ===================== Frame组件相关类型定义 =====================

// Frame内容数据结构
export interface FrameContentData {
  frame: {
    id: string; // Frame ID
    name: string; // Frame名称
    bounds: any; // Frame边界 (画布 Box类型)
    childCount: number; // 子组件数量
    createdAt: number; // 创建时间戳
  };
  components: Array<{
    id: string; // 组件ID
    type: string; // 组件类型
    position: { x: number; y: number }; // 位置
    size: { w: number; h: number }; // 尺寸
    props: any; // 组件属性
    content?: string; // 组件内容
    result?: string; // 组件结果
    name?: string; // 组件名称
    description?: string; // 组件描述
  }>;
  summary: string; // Frame内容摘要
}

// Frame图片快照数据结构 (支持base64)
export interface FrameImageData {
  imageBlob: Blob; // 图片Blob对象
  imageUrl: string; // 图片base64 data URL (用于传递)
  base64String: string; // 🆕 纯base64字符串 (不含前缀)
  width: number; // 图片宽度
  height: number; // 图片高度
}

// 虚拟Frame组件Shape类型 (用于数据传递)
export type FrameShape = BaseShape<
  "frame",
  BaseAIComponentProps & {
    src?: string; // Frame快照图片URL
    frameData?: FrameContentData; // Frame结构化数据
    imageBlob?: Blob; // Frame快照Blob对象
    componentCount?: number; // Frame内组件数量
  }
>;

// ===================== 联合类型和工具类型 =====================

// Chart组件Shape类型（图表在组件内部渲染）
export type ChartShape = BaseShape<
  "chart",
  BaseAIComponentProps & {
    chartType: string; // 'mindmap' | 'flowchart'
    chartData?: string; // JSON格式的图表数据
    generatedNodeIds?: string; // 保留字段（暂未使用）
    generatedConnectionIds?: string; // 保留字段（暂未使用）
  }
>;

// Draw组件Shape类型
export type DrawShape = BaseShape<
  "ai-draw",
  {
    query: string; // 用户输入的AI指令
    isSubmitting: boolean; // 是否正在提交SSE请求
    isCompleted: boolean; // 是否已完成
    w: number; // 宽度
    h: number; // 高度
  }
>;

// Start组件Shape类型
export type StartShape = BaseShape<
  "start",
  {
    w: number; // 宽度
    h: number; // 高度
    isLocked?: boolean; // 锁定状态（虽然Start组件不使用）
    showHelp?: boolean; // 帮助状态（虽然Start组件不使用）
  }
>;

// InteractiveWeb组件Shape类型（外部链接）
export type InteractiveWebShape = BaseShape<
  "interactive-web",
  {
    w: number; // 宽度
    h: number; // 高度
    url: string; // iframe的URL
    webpageContent?: string; // 爬取的网页HTML内容
    result: string; // 用于传递给下一个组件的数据
    title?: string; // 网页标题
    description?: string; // 网页描述
    isLocked: boolean; // 锁定状态
    isRunning: boolean; // 加载状态
    status: "idle" | "loading" | "loaded" | "error"; // 详细状态
  }
>;

// 所有AI组件Shape的联合类型 (包含Frame、Draw和Start)
export type AIComponentShape =
  | InstructionShape
  | AITextShape
  | AIImageShape
  | SpeechShape
  | WebsiteShape
  | FileShape
  | FrameShape // 🆕 Frame支持
  | DrawShape // 🆕 新增Draw组件
  | StartShape // 🆕 新增Start组件
  | ChartShape // 🆕 新增Chart组件
  | InteractiveWebShape; // 🆕 新增外部链接组件

// 组件类型名称
export type ComponentType = AIComponentShape["type"];

// 组件类型到输入类型的映射
export type ComponentTypeToInputType = {
  instruction: "text";
  "ai-text": "text";
  "ai-image": "image";
  speech: "speech";
  website: "website";
  file: "file";
  frame: "frame"; // 🆕 新增Frame输入类型
  "ai-draw": "draw"; // 🆕 新增Draw输入类型
  start: "trigger"; // 🆕 新增Start输入类型
  chart: "chart"; // 🆕 新增Chart输入类型
  "interactive-web": "interactiveWeb"; // 🆕 新增外部链接输入类型
};

// 根据组件类型获取对应的输入类型
export type GetInputType<T extends ComponentType> = ComponentTypeToInputType[T];

// ===================== 执行结果接口 =====================

// 组件执行结果接口 (与后端API对接)
export interface ComponentExecutionResult {
  success: boolean; // 是否成功
  data: ComponentResultData; // 结果数据
  error?: string; // 错误信息 (失败时)
}

// 组件结果数据接口
export interface ComponentResultData {
  // 基础结果数据
  result: string; // 主要结果内容 (显示给用户)
  name?: string; // AI生成的名称
  description?: string; // AI生成的描述

  // 组件特定数据
  src?: string; // 资源URL (图片/音频/文件)
  htmlContent?: string; // HTML内容 (Website组件)
  fileName?: string; // 文件名 (File组件)
  fileExtension?: string; // 文件扩展名 (File组件)
  fileSize?: number; // 文件大小 (File组件)

  // 状态标识
  isUploaded?: boolean; // 是否为用户上传 (Speech/File组件)

  // 原始响应 (调试用)
  rawResponse?: any;
}

// ===================== API调用接口 =====================

// API调用选项接口
export interface APICallOptions {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  data?: any;
  headers?: Record<string, string>;
}

// ===================== 组件连接关系接口 =====================

// 组件连接关系接口
export interface ComponentConnection {
  fromShapeId: string;
  toShapeId: string;
  arrowId: string;
  data?: any; // 传递的数据
}

// 组件执行上下文接口
export interface ComponentExecutionContext {
  currentShape: AIComponentShape;
  previousComponents: AIComponentShape[];
  connections: ComponentConnection[];
  editor: any; // 画布 Editor实例
}

// ===================== 组件配置和元数据 =====================

// 组件配置接口
export interface ComponentConfig {
  name: string; // 显示名称
  type: ComponentType; // 组件类型
  icon: any; // 图标组件
  defaultSize: { w: number; h: number }; // 默认尺寸
  showHelp: boolean; // 是否显示帮助
  helpContent?: string; // 帮助内容
  inputType: "text" | "image" | "speech" | "website" | "file"; // 输入类型
  supportsUpload?: boolean; // 是否支持文件上传
  supportsGeneration?: boolean; // 是否支持AI生成
}

// 组件状态接口
export interface ComponentState {
  isRunning: boolean;
  isLocked: boolean;
  hasContent: boolean;
  hasResult: boolean;
  canExecute: boolean;
  hasError: boolean;
  errorMessage?: string;
}

// ===================== 文件处理相关 =====================

// 支持的文件类型
export type SupportedFileType =
  | "txt"
  | "md"
  | "csv"
  | "json"
  | "yaml"
  | "yml"
  | "xml"
  | "html"
  | "css"
  | "js"
  | "pdf"
  | "docx";

// 支持的音频文件类型
export type SupportedAudioType = "mp3" | "wav" | "flac" | "m4a";

// 支持的图片文件类型
export type SupportedImageType = "jpg" | "jpeg" | "png" | "gif" | "webp";

// 文件上传结果接口
export interface FileUploadResult {
  success: boolean;
  url?: string;
  fileName?: string;
  fileSize?: number;
  fileExtension?: string;
  error?: string;
}

// ===================== 工具函数类型 =====================

// 组件验证函数类型
export type ComponentValidator = (shape: AIComponentShape) => {
  isValid: boolean;
  errors: string[];
};

// 组件数据提取函数类型
export type ComponentDataExtractor = (shape: AIComponentShape) => {
  displayContent: string;
  passingData: string;
  metadata: Record<string, any>;
};

// ===================== 常量定义 =====================

// 默认组件尺寸
export const DEFAULT_COMPONENT_SIZES: Record<
  ComponentType,
  { w: number; h: number }
> = {
  "interactive-web": { w: 800, h: 600 },
  instruction: { w: 300, h: 120 },
  "ai-text": { w: 300, h: 100 },
  "ai-image": { w: 300, h: 200 },
  speech: { w: 300, h: 80 },
  website: { w: 400, h: 300 },
  file: { w: 300, h: 200 },
  frame: { w: 400, h: 300 }, // 🆕 Frame默认尺寸
  "ai-draw": { w: 300, h: 200 }, // 🆕 Draw默认尺寸
  start: { w: 80, h: 80 }, // 🆕 Start默认尺寸
  chart: { w: 350, h: 200 }, // 🆕 Chart默认尺寸
};

// 组件显示名称
export const COMPONENT_DISPLAY_NAMES: Record<ComponentType, string> = {
  get "interactive-web"() {
    return t("canvas.components.externalLink");
  },
  instruction: "Instruction",
  "ai-text": "Text",
  "ai-image": "Image",
  speech: "Speech",
  website: "Website",
  file: "File",
  frame: "Frame", // 🆕 Frame显示名称
  "ai-draw": "Draw", // 🆕 Draw显示名称
  start: "Start", // 🆕 Start显示名称
  chart: "Chart", // 🆕 Chart显示名称
};

// 组件输入类型映射
export const COMPONENT_INPUT_TYPES: Record<ComponentType, string> = {
  "interactive-web": "website",
  instruction: "text",
  "ai-text": "text",
  "ai-image": "image",
  speech: "speech",
  website: "website",
  file: "file",
  frame: "frame", // 🆕 Frame输入类型
  "ai-draw": "draw", // 🆕 Draw输入类型
  start: "trigger", // 🆕 Start输入类型
  chart: "chart", // 🆕 Chart输入类型
};

// ===================== 向后兼容性 =====================

// 为了向后兼容，保留旧的类型别名
export type TextShape = AITextShape;
export type ImageShape = AIImageShape;

// 旧属性名映射 (用于数据迁移)
export const LEGACY_PROPERTY_MAPPING = {
  imageUrl: "src", // Image组件
  audioUrl: "src", // Speech组件
  fileType: "fileExtension", // File组件
};

// ===================== 类型守卫函数 =====================

// 检查是否为特定组件类型
export function isInstructionShape(
  shape: AIComponentShape,
): shape is InstructionShape {
  return shape.type === "instruction";
}

export function isAITextShape(shape: AIComponentShape): shape is AITextShape {
  return shape.type === "ai-text";
}

export function isAIImageShape(shape: AIComponentShape): shape is AIImageShape {
  return shape.type === "ai-image";
}

export function isSpeechShape(shape: AIComponentShape): shape is SpeechShape {
  return shape.type === "speech";
}

export function isWebsiteShape(shape: AIComponentShape): shape is WebsiteShape {
  return shape.type === "website";
}

export function isFileShape(shape: AIComponentShape): shape is FileShape {
  return shape.type === "file";
}

// 🆕 Frame组件类型守卫
export function isFrameShape(shape: AIComponentShape): shape is FrameShape {
  return shape.type === "frame";
}

// 🆕 Draw组件类型守卫
export function isDrawShape(shape: AIComponentShape): shape is DrawShape {
  return shape.type === "ai-draw";
}

// 🆕 Start组件类型守卫
export function isStartShape(shape: AIComponentShape): shape is StartShape {
  return shape.type === "start";
}

// 🆕 Chart组件类型守卫
export function isChartShape(shape: AIComponentShape): shape is ChartShape {
  return shape.type === "chart";
}

// 检查组件是否支持上传功能
export function supportsUpload(componentType: ComponentType): boolean {
  return (
    componentType === "speech" ||
    componentType === "file" ||
    componentType === "ai-image"
  );
  // Frame不支持上传，只支持数据传递
}

// 检查组件是否支持AI生成
export function supportsGeneration(componentType: ComponentType): boolean {
  return (
    componentType !== "ai-text" &&
    componentType !== "frame" &&
    componentType !== "ai-draw"
  ); // Text、Frame和Draw不支持AI生成
}

// 检查组件是否为终端组件 (不会向下传播数据)
export function isTerminalComponent(componentType: ComponentType): boolean {
  return componentType === "ai-text" || componentType === "ai-draw"; // Text和Draw组件是终端组件，Frame和Start可以传播数据
}

// 🆕 检查组件是否为输入源组件 (Frame等容器组件)
export function isSourceComponent(componentType: ComponentType): boolean {
  return componentType === "frame"; // Frame组件是输入源
}

// 🆕 检查组件是否为触发器组件 (Start等控制组件)
export function isTriggerComponent(componentType: ComponentType): boolean {
  return componentType === "start"; // Start组件是触发器
}
