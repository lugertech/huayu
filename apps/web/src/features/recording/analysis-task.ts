import { t, useLocale, type MessageKey, type Values } from "@/i18n";
import { translatedErrorMessage, type ErrorTranslation } from "@/i18n/errors";
import { useSyncExternalStore } from "react";
import type { Capability } from "@/ai/settings";
import type { Recording } from "@/api/client";

export type AnalysisPhase =
  | "idle"
  | "preparing"
  | "transcribing"
  | "analyzing"
  | "summarizing"
  | "saving"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";
interface AnalysisTask {
  phase: AnalysisPhase;
  progress: string;
  progressKey?: MessageKey;
  progressValues?: Values;
  error: string;
  errorTranslation?: ErrorTranslation;
  modelCapability?: Capability;
  recording?: Recording;
  completed?: number;
  total?: number;
}

const idle: AnalysisTask = { phase: "idle", progress: "", error: "" };
const tasks = new Map<string, AnalysisTask>();
const listeners = new Set<() => void>();

export function updateAnalysisTask(id: string, value: AnalysisTask) {
  tasks.set(id, value);
  listeners.forEach((listener) => listener());
}

function taskFor(id?: string) {
  return id ? tasks.get(id) || idle : idle;
}

export function getAnalysisTask(id?: string) {
  const task = taskFor(id);
  return {
    ...task,
    busy: !["idle", "completed", "failed", "cancelled"].includes(task.phase),
    error: task.errorTranslation
      ? translatedErrorMessage(task.errorTranslation)
      : task.error,
    progress: task.progressKey
      ? t(task.progressKey, task.progressValues)
      : task.progress,
  };
}

export function useAnalysisTask(id?: string) {
  useLocale();
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => taskFor(id),
  );
  return getAnalysisTask(id);
}
