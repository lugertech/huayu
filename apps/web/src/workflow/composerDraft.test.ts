import { describe, expect, it } from "vite-plus/test";
import {
  emptyComposer,
  openComposer,
  updateComposer,
  completeComposer,
  parseComposerState,
  composerStorageKey,
} from "./composerDraft";

describe("creation drafts", () => {
  it("restores requirements, output type and adjusted materials for the same selection", () => {
    let state = openComposer(emptyComposer(), ["shape:a", "shape:b"]);
    state = updateComposer(state, {
      prompt: "保留这个要求\n以及换行",
      type: "website",
      sourceIds: ["shape:b"],
    });
    state = { ...state, activeKey: null };
    const restored = openComposer(
      parseComposerState(JSON.stringify({ version: 1, ...state })),
      ["shape:b", "shape:a"],
    );
    expect(restored.drafts[0]).toMatchObject({
      sourceIds: ["shape:b"],
      prompt: "保留这个要求\n以及换行",
      type: "website",
    });
  });
  it("keeps independent drafts and removes only the submitted creation", () => {
    let state = updateComposer(openComposer(emptyComposer(), ["shape:a"]), {
      prompt: "第一份要求",
    });
    state = updateComposer(openComposer(state, ["shape:b"]), {
      prompt: "第二份要求",
    });
    state = completeComposer(state);
    expect(state.activeKey).toBeNull();
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0].prompt).toBe("第一份要求");
  });
  it("restores an open draft after refresh, ignores invalid data and never retains connection configuration", () => {
    const state = updateComposer(openComposer(emptyComposer(), ["shape:a"]), {
      prompt: "刷新后继续",
    });
    const payload = {
      version: 1,
      ...state,
      connections: { apiKey: "do-not-retain" },
      drafts: state.drafts.map((draft) => ({
        ...draft,
        model: "do-not-retain",
        apiKey: "do-not-retain",
      })),
    };
    expect(parseComposerState(JSON.stringify(payload))).toEqual(state);
    expect(
      JSON.stringify(parseComposerState(JSON.stringify(payload))),
    ).not.toContain("do-not-retain");
    expect(parseComposerState("broken JSON")).toEqual(emptyComposer());
    expect(
      parseComposerState(JSON.stringify({ version: 2, drafts: state.drafts })),
    ).toEqual(emptyComposer());
    expect(
      parseComposerState(
        JSON.stringify({
          version: 1,
          drafts: [{ ...state.drafts[0], sourceIds: [null] }],
        }),
      ),
    ).toEqual(emptyComposer());
  });
  it("isolates projects and pages and bounds retained drafts", () => {
    expect(composerStorageKey("project:a", "page:page")).not.toBe(
      composerStorageKey("project:b", "page:page"),
    );
    expect(composerStorageKey("project:a", "page:1")).not.toBe(
      composerStorageKey("project:a", "page:2"),
    );
    let state = emptyComposer();
    for (let i = 0; i < 20; i++) state = openComposer(state, [`shape:${i}`]);
    expect(state.drafts).toHaveLength(8);
    expect(state.drafts[0].sourceIds).toEqual(["shape:19"]);
  });
});
