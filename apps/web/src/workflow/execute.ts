import { t, type MessageKey } from "@/i18n";
import { useSyncExternalStore } from "react";
import { ModelConnectionError } from "@/ai/errors";
import type { Capability } from "@/ai/settings";
import {
  Editor,
  plainText,
  type ShapeId,
  type CanvasShape,
} from "@/canvas/editor";
import { COMPONENT_CONFIGS } from "../config/components";
import {
  connectedShapes,
  createConnectedTextShape,
} from "../utils/connectionParser";
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
import { generateChart } from "../api/mentex";
import {
  callAgentSSE,
  buildAgentRequest,
  AgentEventExecutor,
} from "../utils/agentSSE";

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
const executions = new WeakMap<Editor, Map<string, AbortController>>();
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
}
const states = new WeakMap<Editor, Map<string, ExecutionState>>();
const listeners = new Set<() => void>();
let version = 0;
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}
export function useNodeRunning(editor: Editor, id: string) {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
  return executions.get(editor)?.has(id) || false;
}
export function nodeExecution(editor: Editor, id: string): NodeExecution {
  const state = states.get(editor)?.get(id);
  if (!state) return idleExecution;
  const { messageKey, ...execution } = state;
  return { ...execution, message: messageKey ? t(messageKey) : state.message };
}
export function useNodeExecution(editor: Editor, id: string) {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
  return nodeExecution(editor, id);
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
  return {
    busy: !!executions.get(editor)?.size,
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
  if (value.messageKey) next.message = "";
  else if (value.message !== undefined) delete next.messageKey;
  current.set(id, next);
  changed();
}
export function stopAllExecutions(editor: Editor) {
  for (const controller of executions.get(editor)?.values() || [])
    controller.abort();
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

async function executeNode(editor: Editor, id: ShapeId, signal: AbortSignal) {
  signal.throwIfAborted();
  const shape = editor.getShape(id);
  if (!shape) throw new Error(t("workflow.thisStepWasDeleted"));
  const props = shape.props as NodeData;
  if (
    props.isLocked ||
    shape.type === "start" ||
    shape.type === "frame" ||
    !(shape.type in COMPONENT_CONFIGS)
  )
    return;
  const startedAt = Date.now();
  const fingerprint = generationFingerprint(editor, id);
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
  const inputs = await inputsForShapes(
    editor,
    connectedShapes(editor, id, "previous"),
  );
  signal.throwIfAborted();
  const prompt = props.text?.trim() || "";
  let updates: Partial<NodeData> = {};
  if (shape.type === "ai-text") {
    const parts = inputs
      .map((input) => input.text || input.description)
      .filter(Boolean);
    updates = {
      result: parts.length
        ? [...parts, prompt].filter(Boolean).join("\n\n")
        : prompt,
    };
  } else if (shape.type === "instruction") {
    if (!prompt && !inputs.length)
      throw new Error(t("workflow.writeInstructionsOrConnectMaterials"));
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
    if (props.isUploaded && props.src && !prompt) return;
    if (!prompt && !inputs.length) return;
    if (prompt) inputs.push({ type: "text", text: prompt });
    if (props.src && prompt) inputs.push({ type: "image", src: props.src });
    const size = props.imageSize || "1:1";
    const sizes: Record<string, string> = {
      "1:1": "1024x1024",
      "3:2": "1536x1024",
      "2:3": "1024x1536",
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
    if (props.isUploaded && props.src) return;
    if (prompt) inputs.push({ type: "text", text: prompt });
    const value = extractAPIData(await audioGenerateAPI(inputs, signal));
    updates = {
      src: value.src,
      result: value.text,
      name: value.name,
      isUploaded: false,
    };
  } else if (shape.type === "website") {
    if (prompt) inputs.push({ type: "text", text: prompt });
    if (!inputs.length)
      throw new Error(t("workflow.describeAWebPageOrConnectPrecedingSteps"));
    const value = extractAPIData(await websiteAPI(inputs, signal));
    updates = {
      htmlContent: value.text,
      result: value.text,
      name: value.name,
      description: value.description,
    };
  } else if (shape.type === "file") {
    if (props.isUploaded && props.src) return;
    if (prompt) inputs.push({ type: "text", text: prompt });
    if (!inputs.length)
      throw new Error(t("workflow.describeTheFileOrConnectPrecedingSteps"));
    const value = extractAPIData(await documentGenerateAPI(inputs, signal));
    updates = {
      src: value.src,
      result: value.text,
      name: value.name,
      fileName: value.name,
      fileExtension: value.name.split(".").pop(),
      isUploaded: false,
    };
  } else if (shape.type === "chart") {
    const text = [...inputs.map((input) => input.text), prompt]
      .filter(Boolean)
      .join("\n\n");
    if (!text)
      throw new Error(t("workflow.describeAChartOrConnectPrecedingSteps"));
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      /* Natural language is sent to the selected model. */
    }
    const valid =
      data &&
      typeof data === "object" &&
      (props.chartType === "flowchart"
        ? Array.isArray(data["nodes"]) && Array.isArray(data["edges"])
        : typeof data["content"] === "string" &&
          Array.isArray(data["children"]));
    const chart = valid
      ? data
      : await generateChart({
          type: props.chartType === "flowchart" ? "flowchart" : "mindmap",
          inputs: [
            ...inputs,
            ...(prompt ? [{ type: "text" as const, text: prompt }] : []),
          ],
          signal,
        });
    updates = {
      chartData: JSON.stringify(chart),
      result: JSON.stringify(chart),
      name:
        "name" in Object(chart)
          ? String(chart["name"] || t("common.chart"))
          : t("common.chart"),
    };
  } else if (shape.type === "ai-draw") {
    const bounds = editor.getViewportPageBounds();
    const query =
      props.query || inputs.map((input) => input.text || "").join("\n");
    if (!query.trim()) throw new Error(t("workflow.enterDrawingInstructions"));
    const ids = [...editor.getCurrentPageShapeIds()].filter(
      (shapeId) => shapeId !== id,
    );
    const { blob } = ids.length
      ? await editor.toImage(ids, { format: "png", background: true })
      : { blob: null };
    const request = buildAgentRequest(
      query,
      bounds,
      editor
        .getCurrentPageShapes()
        .filter((item) => item.id !== id)
        .map((item) => {
          const bounds = editor.getShapePageBounds(item);
          const data = item.props as NodeData;
          return {
            id: item.id,
            type: item.type,
            x: item.x,
            y: item.y,
            w: bounds?.w,
            h: bounds?.h,
            text: data.text || data.result || "",
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
    new AgentEventExecutor(editor).executeEvents(events);
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
    existing.abort();
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
    throw new Error(t("workflow.addACreativeStepBeforeRunningTheWorkflow"));
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
    for (const next of connectedShapes(editor, shape.id, "next"))
      edges.push({ from: shape.id, to: next.id });
  }
  const levels = planWorkflow(roots, edges);
  const controller = new AbortController();
  const running = executions.get(editor) || new Map<string, AbortController>();
  executions.set(editor, running);
  const ids = levels.flat();
  if (ids.some((id) => running.has(id)))
    throw new Error(t("workflow.aStepInThisWorkflowIsAlreadyRunning"));
  if (!running.size) states.set(editor, new Map());
  ids.forEach((id) => running.set(id, controller));
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
            updateExecution(editor, id, {
              status: aborted ? "cancelled" : "error",
              modelCapability:
                error instanceof ModelConnectionError
                  ? error.capability
                  : undefined,
              messageKey: aborted ? "workflow.status.cancelled" : undefined,
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
      if (running.get(id) === controller) running.delete(id);
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
