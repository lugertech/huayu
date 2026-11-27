import { LocalizedError } from "@/i18n/errors";
import { t } from "@/i18n";
import type { ModelSettings } from "@/ai/model-config";
import {
  executeLevels,
  stopAllExecutions,
  stopNodeExecution,
} from "./execution-state";
import { getSettings } from "@/ai/settings";
import type { Editor } from "@/features/canvas/engine/editor";
import {
  plainText,
  type ShapeId,
  type CanvasShape,
} from "@/features/canvas/engine/model";
import { COMPONENT_CONFIGS } from "../config/components";
import {
  connectedShapes,
  createConnectedTextShape,
  getPreviousConnectedShapes,
} from "../features/canvas/connection-parser";
import { imageRequestSize } from "./image-size";
import { drawingShapes } from "./context";
import { planWorkflow, type GraphEdge } from "./graph";
import {
  generationFingerprint,
  resultIsStale,
  type GenerationInfo,
} from "./freshness";
import {
  generateChart,
  runInstruction,
  generateImageContent,
  generateSpeechContent,
  generateWebsite,
  generateDocument,
  type WorkflowInput,
} from "./generation";
import { blobAsDataURL } from "@/api/resources";
import {
  callAgentSSE,
  buildAgentRequest,
  AgentEventExecutor,
} from "../features/canvas/agent-sse";

export interface NodeData {
  w: number;
  h: number;
  text?: string;
  result?: string;
  name?: string;
  description?: string;
  src?: string;
  isLocked?: boolean;
  isRunning?: boolean;
  useWebSearch?: boolean;
  imageSize?: string;
  htmlContent?: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: number;
  isUploaded?: boolean;
  chartType?: string;
  chartData?: string;
  query?: string;
  generation?: GenerationInfo;
  webpageContent?: string;
  url?: string;
  recordingSource?: { id: string; name: string; start: number; end?: number };
}
export async function inputForShape(
  editor: Editor,
  shape: CanvasShape,
  seen: Set<string>,
): Promise<WorkflowInput[]> {
  if (seen.has(shape.id)) return [];
  seen.add(shape.id);
  const props = shape.props as NodeData;
  if (shape.type === "start") {
    const inputs: WorkflowInput[] = [];
    for (const previous of connectedShapes(editor, shape.id, "previous"))
      inputs.push(...(await inputForShape(editor, previous, seen)));
    return inputs;
  }
  if (shape.type === "frame") {
    const { blob } = await editor.toImage([shape.id], {
      format: "png",
      background: true,
      scale: 1,
    });
    return [
      {
        type: "image",
        name: props.name || t("canvas.frame"),
        src: await blobAsDataURL(blob),
      },
    ];
  }
  const text =
    typeof props.result === "string" &&
    ["instruction", "ai-text", "website"].includes(shape.type)
      ? props.result
      : props.result ||
        props.text ||
        plainText(shape.props.richText) ||
        props.description ||
        "";
  const asset = shape.props.assetId
    ? editor.store.get(shape.props.assetId)
    : undefined;
  const source = props.src || asset?.props?.src;
  if ((shape.type === "ai-image" || shape.type === "image") && source)
    return [{ type: "image", src: source, text, name: props.name }];
  if (shape.type === "speech")
    return [{ type: "speech", src: props.src, text, name: props.name }];
  if (shape.type === "website")
    return [
      { type: "website", text: props.htmlContent ?? text, name: props.name },
    ];
  if (shape.type === "file")
    return [
      {
        type: "file",
        src: props.src,
        text,
        name: props.fileName || props.name,
      },
    ];
  if (shape.type === "chart")
    return [{ type: "text", text: props.chartData || text, name: props.name }];
  if (shape.type === "interactive-web")
    return [
      {
        type: "website",
        text: props.webpageContent || props.url || "",
        name: props.name,
      },
    ];
  return text ? [{ type: "text", text, name: props.name }] : [];
}

/** Give a visual selection its shared spatial context, alongside editable source text / HTML. */
export async function inputsForShapes(
  editor: Editor,
  shapes: CanvasShape[],
): Promise<WorkflowInput[]> {
  const inputs: WorkflowInput[] = [];
  const seen = new Set<string>();
  const visual = shapes.some((shape) =>
    ["geo", "draw", "line", "arrow", "note", "frame"].includes(shape.type),
  );
  for (const shape of shapes) {
    if (visual && shape.type === "frame") {
      for (const child of editor.descendants(shape.id))
        if (!["frame", "start"].includes(child.type))
          inputs.push(...(await inputForShape(editor, child, seen)));
    } else inputs.push(...(await inputForShape(editor, shape, seen)));
  }
  if (visual) {
    const { blob } = await editor.toImage(
      shapes.map((shape) => shape.id),
      { format: "png", background: true, scale: 1 },
    );
    inputs.push({
      type: "image",
      name: t("workflow.selectedCanvasContent"),
      src: await blobAsDataURL(blob),
    });
  }
  return inputs;
}

/** Each component type chooses how to use its upstream inputs. */
export async function inputsForNode(
  editor: Editor,
  type: string,
  sources: CanvasShape[],
): Promise<WorkflowInput[]> {
  const inputs: WorkflowInput[] = [];
  for (const source of sources) {
    const props = source.props as NodeData;
    const text =
      source.type === "chart" &&
      props.chartData &&
      props.result === props.chartData
        ? props.name || ""
        : (props.result ?? props.text ?? plainText(source.props.richText));
    if (type === "ai-text" || type === "chart") {
      const content =
        type === "chart"
          ? text
          : source.type === "website"
            ? props.description || text
            : source.type === "ai-image"
              ? props.result || props.description
              : source.type === "frame"
                ? props.description ||
                  props.text ||
                  props.name ||
                  t("canvas.frame")
                : text;
      if (content?.trim()) inputs.push({ type: "text", text: content.trim() });
    } else if (source.type === "frame") {
      inputs.push(...(await inputForShape(editor, source, new Set())));
    } else if (type === "speech" || type === "file") {
      if (text?.trim())
        inputs.push({
          type: "text",
          text,
          name: props.name,
          description: props.description,
        });
    } else if (
      type === "ai-image" &&
      !["instruction", "ai-text", "ai-image", "image"].includes(source.type) &&
      source.type in COMPONENT_CONFIGS
    ) {
      continue;
    } else if (
      type === "website" &&
      !["ai-image", "image"].includes(source.type)
    ) {
      if (text?.trim())
        inputs.push({
          type: "text",
          text,
          name: props.name,
          description: props.description,
        });
    } else if (source.type === "chart") {
      if (text?.trim())
        inputs.push({
          type: "text",
          text,
          name: props.name,
          description: props.description,
        });
    } else {
      const values = await inputsForShapes(editor, [source]);
      for (const input of values) {
        if (source.type === "file") input.text = props.text || props.result;
        if (source.type === "ai-image") {
          input.text = undefined;
          input.description =
            type === "instruction"
              ? props.result || props.description
              : props.description || props.result;
        } else input.description = props.description;
        inputs.push(input);
      }
    }
  }
  return inputs;
}

async function executeNode(
  editor: Editor,
  id: ShapeId,
  signal: AbortSignal,
  settings: ModelSettings,
  progress: (message: string) => void,
) {
  signal.throwIfAborted();
  const shape = editor.getShape(id);
  if (!shape) throw new LocalizedError({ key: "workflow.thisStepWasDeleted" });
  const props = shape.props as NodeData;
  if (
    props.isLocked ||
    shape.type === "start" ||
    shape.type === "frame" ||
    shape.type === "interactive-web" ||
    !(shape.type in COMPONENT_CONFIGS)
  )
    return;
  const startedAt = Date.now();
  let fingerprint = generationFingerprint(editor, id);
  function saveResult(updates: Partial<NodeData>) {
    if (!editor.getShape(id)) return;
    const unchanged = generationFingerprint(editor, id) === fingerprint;
    editor.store.batch(() => {
      editor.updateShape({ id, type: shape.type, props: updates });
      editor.updateShape({
        id,
        props: {
          generation: {
            fingerprint: unchanged
              ? generationFingerprint(editor, id)
              : fingerprint,
            completedAt: Date.now(),
            durationMs: Math.max(0, Date.now() - startedAt),
          },
        },
      });
    });
  }
  const previous = getPreviousConnectedShapes(editor, id);
  const inputs =
    shape.type === "ai-draw"
      ? []
      : await inputsForNode(editor, shape.type, previous);
  signal.throwIfAborted();
  const prompt = props.text?.trim() || "";
  let updates: Partial<NodeData> = {};
  if (shape.type === "ai-text") {
    const parts = inputs
      .map((input) => input.text || input.description)
      .filter(Boolean);
    if (!parts.length) return;
    const text = parts.join("\n");
    updates = { text, result: text };
  } else if (shape.type === "instruction") {
    if (!prompt && !inputs.length)
      throw new LocalizedError({
        key: "workflow.writeInstructionsOrConnectMaterials",
      });
    const value = await runInstruction(
      prompt || t("workflow.prompts.organizeMaterials"),
      inputs,
      props.useWebSearch,
      signal,
      settings,
    );
    updates = {
      result: value.text,
      name: value.name,
      description: value.description,
    };
  } else if (shape.type === "ai-image") {
    if (!prompt && !inputs.length) {
      if (props.src) return;
      throw new LocalizedError({ key: "workflow.connectOrUploadInput" });
    }
    if (prompt) inputs.unshift({ type: "text", text: prompt });
    const value = await generateImageContent(inputs, {
      size: imageRequestSize(props.imageSize),
      signal,
      settings,
    });
    updates = {
      src: value.src,
      isUploaded: false,
      result: value.text,
      name: value.name,
      description: value.description,
    };
  } else if (shape.type === "speech") {
    if (!inputs.length) {
      if (props.src) return;
      throw new LocalizedError({ key: "workflow.connectOrUploadInput" });
    }
    if (prompt) inputs.unshift({ type: "text", text: prompt });
    const value = await generateSpeechContent(inputs, signal, settings);
    updates = {
      src: value.src,
      result: value.text,
      name: value.name,
      description: value.description,
      isUploaded: false,
    };
  } else if (shape.type === "website") {
    if (!inputs.length)
      throw new LocalizedError({ key: "workflow.connectWebsiteInput" });
    const value = await generateWebsite(inputs, signal, settings);
    updates = {
      htmlContent: value.text,
      result: value.text,
      name: value.name,
      description: value.description,
    };
  } else if (shape.type === "file") {
    if (!inputs.length) {
      if (props.src) return;
      throw new LocalizedError({ key: "workflow.connectOrUploadInput" });
    }
    if (prompt) inputs.unshift({ type: "text", text: prompt });
    const value = await generateDocument(inputs, signal, settings);
    updates = {
      src: value.src,
      result: value.text,
      name: value.name,
      description: value.description,
      fileName: value.name,
      fileExtension: value.name.split(".").pop(),
      isUploaded: false,
    };
  } else if (shape.type === "chart") {
    const text = previous.length
      ? inputs
          .map((input) => input.text)
          .filter(Boolean)
          .join("\n")
      : prompt;
    if (!text)
      throw new LocalizedError({
        key: "workflow.describeAChartOrConnectPrecedingSteps",
      });
    const chart = await generateChart({
      type: props.chartType === "flowchart" ? "flowchart" : "mindmap",
      inputs: [{ type: "text", text }],
      signal,
      settings,
    });
    updates = {
      text,
      chartData: JSON.stringify(chart),
      result: chart.name || "",
      description: chart.description || "",
    };
  } else if (shape.type === "ai-draw") {
    const bounds = editor.getShapePageBounds(shape)!;
    const query = props.query || "";
    if (!query.trim())
      throw new LocalizedError({ key: "workflow.enterDrawingInstructions" });
    const shapes = drawingShapes(editor, shape);
    const ids = shapes.map((shape) => shape.id);
    const { blob } = ids.length
      ? await editor.toImage(ids, {
          format: "png",
          background: false,
          padding: 10,
        })
      : { blob: null };
    const screenshot = blob ? await blobAsDataURL(blob) : undefined;
    signal.throwIfAborted();
    const request = buildAgentRequest(
      query,
      bounds,
      shapes.map((item) => {
        const bounds = editor.getShapePageBounds(item);
        const data = item.props as NodeData;
        return {
          id: item.id,
          type: item.type,
          x: item.x,
          y: item.y,
          w: bounds?.w,
          h: bounds?.h,
          text: data.text || plainText(item.props.richText) || "",
        };
      }),
      screenshot,
    );
    const events = await callAgentSSE(
      request,
      (events) => {
        if (signal.aborted) return;
        const message = events
          .map((event) => event.text || event.intent)
          .filter((value) => typeof value === "string")
          .at(-1);
        if (message) progress(message.slice(0, 160));
      },
      signal,
      settings,
    );
    signal.throwIfAborted();
    const contextUnchanged = generationFingerprint(editor, id) === fingerprint;
    new AgentEventExecutor(editor).executeEvents(events);
    if (contextUnchanged) fingerprint = generationFingerprint(editor, id);
    saveResult({ isSubmitting: false, isCompleted: true } as Partial<NodeData>);
    return;
  }
  signal.throwIfAborted();
  if (!editor.getShape(id)) return;
  saveResult(updates);
  if (
    shape.type === "instruction" &&
    !connectedShapes(editor, id, "next").length &&
    updates.result
  ) {
    const output = createConnectedTextShape(editor, id, updates.result);
    if (output)
      editor.updateShape({
        id: output,
        props: {
          generation: {
            fingerprint: generationFingerprint(editor, output),
            completedAt: Date.now(),
            durationMs: 0,
          },
        },
      });
  }
}

export async function runWorkflow(
  editor: Editor,
  root: ShapeId,
): Promise<void> {
  if (stopNodeExecution(editor, root)) return;
  await runPlan(editor, [root]);
}

export async function runProjectWorkflow(editor: Editor): Promise<void> {
  if (stopAllExecutions(editor)) return;
  const roots = editor
    .getCurrentPageShapes()
    .filter(
      (shape) => shape.type in COMPONENT_CONFIGS && shape.type !== "frame",
    )
    .map((shape) => shape.id);
  if (!roots.length)
    throw new LocalizedError({
      key: "workflow.addACreativeStepBeforeRunningTheWorkflow",
    });
  await runPlan(editor, roots);
}

export async function runStaleWorkflow(editor: Editor): Promise<void> {
  if (stopAllExecutions(editor)) return;
  const roots = editor
    .getCurrentPageShapes()
    .filter((shape) => !shape.props.isLocked && resultIsStale(editor, shape.id))
    .map((shape) => shape.id);
  if (!roots.length) return;
  await runPlan(editor, roots);
}

async function runPlan(editor: Editor, roots: string[]) {
  const settings = getSettings();
  const edges: GraphEdge[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (
      (shape.type === "start" && !roots.includes(shape.id)) ||
      ["interactive-web", "ai-draw"].includes(shape.type)
    )
      continue;
    for (const next of connectedShapes(editor, shape.id, "next")) {
      if (["interactive-web", "ai-draw"].includes(next.type)) continue;
      edges.push({ from: shape.id, to: next.id });
    }
  }
  const levels = planWorkflow(roots, edges);
  await executeLevels(editor, levels, (id, signal, progress) =>
    executeNode(editor, id, signal, settings, progress),
  );
}
