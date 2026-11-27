import { t, useLocale, type MessageKey, type Values } from "@/i18n";
import { translatedErrorMessage, type ErrorTranslation } from "@/i18n/errors";
import { useSyncExternalStore } from "react";
import type { Capability } from "@/ai/model-config";
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
  progress?: { key: MessageKey; values?: Values };
  error?: string | ErrorTranslation;
  modelCapability?: Capability;
  recording?: Recording;
  completed?: number;
  total?: number;
}

const idle: AnalysisTask = { phase: "idle" };
const tasks = new Map<string, AnalysisTask>();
const listeners = new Set<() => void>();

export function updateAnalysisTask(id: string, value: AnalysisTask) {
  tasks.set(id, value);
  listeners.forEach((listener) => listener());
}

function taskFor(id?: string) {
  return id ? tasks.get(id) || idle : idle;
}

export function setAnalysisPhase(id: string, phase: "cancelling" | "saving") {
  updateAnalysisTask(id, { ...taskFor(id), phase });
}

export function getAnalysisTask(id?: string) {
  const { error, progress, ...task } = taskFor(id);
  return {
    ...task,
    busy: !["idle", "completed", "failed", "cancelled"].includes(task.phase),
    error:
      typeof error === "object" ? translatedErrorMessage(error) : (error ?? ""),
    progress: progress ? t(progress.key, progress.values) : "",
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
