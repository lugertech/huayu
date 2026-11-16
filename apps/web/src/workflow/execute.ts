import {
  LocalizedError,
  translatedErrorMessage,
  type ErrorTranslation,
} from "@/i18n/errors";
import { t, type Locale, type MessageKey } from "@/i18n";
import { useSyncExternalStore } from "react";
import { ModelConnectionError } from "@/ai/errors";
import type { Capability } from "@/ai/settings";
import {
  Editor,
  plainText,
  type ShapeId,
  type CanvasShape,
} from "@/features/canvas/editor";
import { COMPONENT_CONFIGS } from "../config/components";
import {
  connectedShapes,
  createConnectedTextShape,
  getPreviousConnectedShapes,
} from "../features/canvas/connection-parser";
import { drawingShapes } from "./context";
import { planWorkflow, type GraphEdge } from "./graph";
import {
  generationFingerprint,
  resultIsStale,
  type GenerationInfo,
} from "./freshness";
import {
  instructionAPI,
  imageAPI,
  audioGenerateAPI,
  websiteAPI,
  documentGenerateAPI,
  extractAPIData,
  blobAsDataURL,
  type AIAPIInput,
} from "../api/backend";
import { generateChart } from "../api/canvas-components";
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
interface WorkflowRun {
  phase: "running" | "cancelling";
  controller: AbortController;
}
const executions = new WeakMap<Editor, Map<string, WorkflowRun>>();
export interface NodeExecution {
  status: "idle" | "queued" | "running" | "success" | "error" | "cancelled";
  message: string;
  startedAt?: number;
  completedAt?: number;
  modelCapability?: Capability;
}
const idleExecution: NodeExecution = { status: "idle", message: "" };
interface ExecutionState extends NodeExecution {
  messageKey?: MessageKey;
  errorTranslation?: ErrorTranslation;
}
const states = new WeakMap<Editor, Map<string, ExecutionState>>();
const listeners = new Set<() => void>();
let version = 0;
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}
/** Includes queued nodes and completed nodes still owned by the current plan. */
export function nodeIsBusy(editor: Editor, id: string) {
  return executions.get(editor)?.has(id) || false;
}
export function useNodeBusy(editor: Editor, id: string) {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
  return nodeIsBusy(editor, id);
}
export function nodeExecution(
  editor: Editor,
  id: string,
  locale?: Locale,
): NodeExecution {
  const state = states.get(editor)?.get(id);
  if (!state) return idleExecution;
  const { messageKey, errorTranslation, ...execution } = state;
  return {
    ...execution,
    message: errorTranslation
      ? translatedErrorMessage(errorTranslation, locale)
      : messageKey
        ? t(messageKey, undefined, locale)
        : state.message,
  };
}
export function useNodeExecution(editor: Editor, id: string, locale: Locale) {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
  return nodeExecution(editor, id, locale);
}
export function useWorkflowState(editor: Editor) {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
  const values = [...(states.get(editor)?.values() || [])];
  const runs = [...(executions.get(editor)?.values() || [])];
  return {
    busy: runs.length > 0,
    phase: runs.some((run) => run.phase === "cancelling")
      ? "cancelling"
      : runs.length
        ? "running"
        : "idle",
    total: values.length,
    completed: values.filter((value) => value.status === "success").length,
    failed: values.filter((value) => value.status === "error").length,
  };
}
function updateExecution(
  editor: Editor,
  id: string,
  value: Partial<ExecutionState>,
) {
  const current = states.get(editor) || new Map<string, ExecutionState>();
  states.set(editor, current);
  const next = { ...idleExecution, ...current.get(id), ...value };
  if (value.messageKey || value.message !== undefined)
    next.errorTranslation = value.errorTranslation;
  if (value.messageKey) next.message = "";
  else if (value.message !== undefined) delete next.messageKey;
  current.set(id, next);
  changed();
}
export function stopAllExecutions(editor: Editor) {
  for (const run of new Set(executions.get(editor)?.values())) {
    run.phase = "cancelling";
    run.controller.abort();
  }
  changed();
}

export async function inputForShape(
  editor: Editor,
  shape: CanvasShape,
  seen: Set<string>,
): Promise<AIAPIInput[]> {
  if (seen.has(shape.id)) return [];
  seen.add(shape.id);
  const props = shape.props as NodeData;
  if (shape.type === "start") {
    const inputs: AIAPIInput[] = [];
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
): Promise<AIAPIInput[]> {
  const inputs: AIAPIInput[] = [];
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
): Promise<AIAPIInput[]> {
  const inputs: AIAPIInput[] = [];
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

async function executeNode(editor: Editor, id: ShapeId, signal: AbortSignal) {
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
    const value = extractAPIData(
      await instructionAPI(
        prompt || t("workflow.prompts.organizeMaterials"),
        inputs,
        props.useWebSearch,
        signal,
      ),
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
    const size = props.imageSize || "1:1";
    const sizes: Record<string, string> = {
      "1:1": "2048x2048",
      "3:2": "2496x1664",
      "2:3": "1664x2496",
      "4:3": "2304x1728",
      "3:4": "1728x2304",
      "16:9": "2560x1440",
      "9:16": "1440x2560",
      "21:9": "3024x1296",
    };
    const value = extractAPIData(
      await imageAPI(inputs, { size: sizes[size] || size, signal }),
    );
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
    const value = extractAPIData(await audioGenerateAPI(inputs, signal));
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
    const value = extractAPIData(await websiteAPI(inputs, signal));
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
    const value = extractAPIData(await documentGenerateAPI(inputs, signal));
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
      blob ? await blobAsDataURL(blob) : undefined,
    );
    const events = await callAgentSSE(
      request,
      (events) => {
        const message = events
          .map((event) => event.text || event.intent)
          .filter((value) => typeof value === "string")
          .at(-1);
        if (message)
          updateExecution(editor, id, { message: message.slice(0, 160) });
      },
      signal,
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
  const existing = executions.get(editor)?.get(root);
  if (existing) {
    existing.phase = "cancelling";
    existing.controller.abort();
    changed();
    return;
  }
  await runPlan(editor, [root]);
}

export async function runProjectWorkflow(editor: Editor): Promise<void> {
  if (executions.get(editor)?.size) {
    stopAllExecutions(editor);
    return;
  }
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
  if (executions.get(editor)?.size) {
    stopAllExecutions(editor);
    return;
  }
  const roots = editor
    .getCurrentPageShapes()
    .filter((shape) => !shape.props.isLocked && resultIsStale(editor, shape.id))
    .map((shape) => shape.id);
  if (!roots.length) return;
  await runPlan(editor, roots);
}

async function runPlan(editor: Editor, roots: string[]) {
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
  const controller = new AbortController();
  const run: WorkflowRun = { phase: "running", controller };
  const running = executions.get(editor) || new Map<string, WorkflowRun>();
  executions.set(editor, running);
  const ids = levels.flat();
  if (ids.some((id) => running.has(id)))
    throw new LocalizedError({
      key: "workflow.aStepInThisWorkflowIsAlreadyRunning",
    });
  if (!running.size) states.set(editor, new Map());
  ids.forEach((id) => running.set(id, run));
  for (const id of ids)
    updateExecution(editor, id, {
      status: "queued",
      messageKey: "workflow.status.queued",
      startedAt: undefined,
      completedAt: undefined,
      modelCapability: undefined,
    });
  changed();
  try {
    for (const level of levels) {
      controller.signal.throwIfAborted();
      let failureCause: unknown;
      const results = await Promise.allSettled(
        level.map(async (id) => {
          updateExecution(editor, id, {
            status: "running",
            messageKey: "workflow.status.processing",
            startedAt: Date.now(),
          });
          try {
            await executeNode(editor, id, controller.signal);
            controller.signal.throwIfAborted();
            updateExecution(editor, id, {
              status: "success",
              messageKey: editor.getShape(id)?.props.isLocked
                ? "workflow.status.reusedLockedResult"
                : "workflow.status.completed",
              completedAt: Date.now(),
            });
          } catch (error) {
            const aborted = controller.signal.aborted;
            if (!aborted) failureCause = error;
            run.phase = "cancelling";
            updateExecution(editor, id, {
              status: aborted ? "cancelled" : "error",
              modelCapability:
                error instanceof ModelConnectionError
                  ? error.capability
                  : undefined,
              messageKey: aborted ? "workflow.status.cancelled" : undefined,
              errorTranslation:
                !aborted && error instanceof LocalizedError
                  ? error.translation
                  : undefined,
              message: aborted
                ? ""
                : error instanceof Error
                  ? error.message
                  : t("workflow.status.failed"),
              completedAt: Date.now(),
            });
            controller.abort();
            throw error;
          }
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        controller.abort();
        throw failureCause || failure.reason;
      }
    }
  } finally {
    ids.forEach((id) => {
      if (running.get(id) === run) running.delete(id);
      const state = nodeExecution(editor, id);
      if (state.status === "queued" || state.status === "running")
        updateExecution(editor, id, {
          status: "cancelled",
          messageKey: "workflow.status.notRun",
          completedAt: Date.now(),
        });
    });
    changed();
  }
}
