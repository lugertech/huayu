import {
  LocalizedError,
  translatedErrorMessage,
  type ErrorTranslation,
} from "@/i18n/errors";
import type { Locale } from "@/i18n";
import { useSyncExternalStore } from "react";
import { ModelConnectionError } from "@/ai/errors";
import type { Capability } from "@/ai/model-config";
import type { Editor } from "@/features/canvas/engine/editor";

interface WorkflowRun {
  phase: "running" | "cancelling";
  controller: AbortController;
}
const executions = new WeakMap<Editor, Map<string, WorkflowRun>>();
interface NodeExecution {
  status: "idle" | "queued" | "running" | "success" | "error" | "cancelled";
  message: string;
  modelCapability?: Capability;
}
const idleExecution: NodeExecution = { status: "idle", message: "" };
interface ExecutionState extends Omit<NodeExecution, "message"> {
  message: string | ErrorTranslation;
}
const states = new WeakMap<Editor, Map<string, ExecutionState>>();
const listeners = new Set<() => void>();
let version = 0;
function changed() {
  version++;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useExecutionChanges() {
  useSyncExternalStore(subscribe, () => version);
}
/** Includes queued nodes and completed nodes still owned by the current plan. */
export function nodeIsBusy(editor: Editor, id: string) {
  return executions.get(editor)?.has(id) || false;
}
export function useNodeBusy(editor: Editor, id: string) {
  useExecutionChanges();
  return nodeIsBusy(editor, id);
}
export function nodeExecution(
  editor: Editor,
  id: string,
  locale?: Locale,
): NodeExecution {
  const state = states.get(editor)?.get(id);
  if (!state) return idleExecution;
  return {
    ...state,
    message:
      typeof state.message === "string"
        ? state.message
        : translatedErrorMessage(state.message, locale),
  };
}
export function useNodeExecution(editor: Editor, id: string, locale: Locale) {
  useExecutionChanges();
  return nodeExecution(editor, id, locale);
}
export function useWorkflowState(editor: Editor) {
  useExecutionChanges();
  const runs = [...(executions.get(editor)?.values() ?? [])];
  return {
    busy: runs.length > 0,
    stopping:
      runs.length > 0 && runs.every((run) => run.phase === "cancelling"),
  };
}
function updateExecution(editor: Editor, id: string, value: ExecutionState) {
  const current = states.get(editor) || new Map<string, ExecutionState>();
  states.set(editor, current);
  current.set(id, value);
  changed();
}
function cancelRuns(editor: Editor, runs: Set<WorkflowRun>) {
  for (const run of runs) {
    run.phase = "cancelling";
    run.controller.abort();
  }
  for (const [id, run] of executions.get(editor) || []) {
    if (runs.has(run) && states.get(editor)?.get(id)?.status === "queued")
      updateExecution(editor, id, {
        status: "cancelled",
        message: { key: "workflow.status.notRun" },
      });
  }
  changed();
}
export function stopAllExecutions(editor: Editor) {
  const runs = new Set(executions.get(editor)?.values());
  if (runs.size) cancelRuns(editor, runs);
  return runs.size > 0;
}

export function stopNodeExecution(editor: Editor, id: string) {
  const run = executions.get(editor)?.get(id);
  if (!run) return false;
  cancelRuns(editor, new Set([run]));
  return true;
}

export async function executeLevels(
  editor: Editor,
  levels: string[][],
  execute: (
    id: string,
    signal: AbortSignal,
    progress: (message: string) => void,
  ) => Promise<void>,
) {
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
      message: { key: "workflow.status.queued" },
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
            message: { key: "workflow.status.processing" },
          });
          try {
            await execute(id, controller.signal, (message) =>
              updateExecution(editor, id, { status: "running", message }),
            );
            controller.signal.throwIfAborted();
            updateExecution(editor, id, {
              status: "success",
              message: {
                key: editor.getShape(id)?.props.isLocked
                  ? "workflow.status.reusedLockedResult"
                  : "workflow.status.completed",
              },
            });
          } catch (error) {
            const aborted = controller.signal.aborted;
            if (!aborted) failureCause = error;
            updateExecution(editor, id, {
              status: aborted ? "cancelled" : "error",
              modelCapability:
                !aborted && error instanceof ModelConnectionError
                  ? error.capability
                  : undefined,
              message: aborted
                ? { key: "workflow.status.cancelled" }
                : error instanceof LocalizedError && error.translation
                  ? error.translation
                  : error instanceof Error
                    ? error.message
                    : { key: "workflow.status.failed" },
            });
            if (!aborted) cancelRuns(editor, new Set([run]));
            throw error;
          }
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failureCause || failure.reason;
    }
  } finally {
    ids.forEach((id) => {
      if (running.get(id) === run) running.delete(id);
      const status = states.get(editor)?.get(id)?.status;
      if (status === "queued" || status === "running")
        updateExecution(editor, id, {
          status: "cancelled",
          message: { key: "workflow.status.notRun" },
        });
    });
    changed();
  }
}
