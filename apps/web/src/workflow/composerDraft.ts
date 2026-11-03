export const CREATION_TYPES = [
  "instruction",
  "ai-image",
  "website",
  "chart",
  "speech",
  "file",
] as const;
export type CreationType = (typeof CREATION_TYPES)[number];
export interface ComposerDraft {
  key: string;
  sourceIds: string[];
  prompt: string;
  type: CreationType;
}
export interface ComposerState {
  drafts: ComposerDraft[];
  activeKey: string | null;
}
export const emptyComposer = (): ComposerState => ({
  drafts: [],
  activeKey: null,
});
export const composerStorageKey = (projectId: string, pageId: string) =>
  `huayu:composer:v1:${encodeURIComponent(projectId)}:${encodeURIComponent(pageId)}`;

/** Restore only content drafts. Provider connections and other unknown fields are never retained. */
export function parseComposerState(raw: string | null): ComposerState {
  try {
    const value = JSON.parse(raw || "null");
    if (value?.version !== 1 || !Array.isArray(value.drafts))
      return emptyComposer();
    const keys = new Set<string>();
    const drafts: ComposerDraft[] = [];
    for (const item of value.drafts) {
      if (
        !item ||
        typeof item.key !== "string" ||
        keys.has(item.key) ||
        !Array.isArray(item.sourceIds) ||
        !item.sourceIds.every((id: unknown) => typeof id === "string") ||
        typeof item.prompt !== "string" ||
        !CREATION_TYPES.includes(item.type)
      )
        continue;
      keys.add(item.key);
      drafts.push({
        key: item.key,
        sourceIds: [...new Set(item.sourceIds)] as string[],
        prompt: item.prompt,
        type: item.type,
      });
      if (drafts.length === 8) break;
    }
    return {
      drafts,
      activeKey: drafts.some((draft) => draft.key === value.activeKey)
        ? value.activeKey
        : null,
    };
  } catch {
    return emptyComposer();
  }
}

export function openComposer(
  state: ComposerState,
  sourceIds: string[],
): ComposerState {
  const ids = [...new Set(sourceIds)];
  const key = JSON.stringify([...ids].sort());
  const draft = state.drafts.find((item) => item.key === key) || {
    key,
    sourceIds: ids,
    prompt: "",
    type: "instruction" as const,
  };
  return {
    activeKey: key,
    drafts: [draft, ...state.drafts.filter((item) => item.key !== key)].slice(
      0,
      8,
    ),
  };
}
export function updateComposer(
  state: ComposerState,
  patch: Partial<Pick<ComposerDraft, "sourceIds" | "prompt" | "type">>,
): ComposerState {
  return {
    ...state,
    drafts: state.drafts.map((draft) =>
      draft.key === state.activeKey ? { ...draft, ...patch } : draft,
    ),
  };
}
export function completeComposer(state: ComposerState): ComposerState {
  return {
    activeKey: null,
    drafts: state.drafts.filter((draft) => draft.key !== state.activeKey),
  };
}
