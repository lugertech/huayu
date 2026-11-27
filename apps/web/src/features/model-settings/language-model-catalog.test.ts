import { describe, expect, it } from "vite-plus/test";
import {
  newLanguageConnection,
  type LanguageConnection,
} from "@/ai/model-config";
import { applyModelCatalog } from "./language-model-catalog";

function connection(
  model: string,
  overrides: Partial<LanguageConnection> = {},
): LanguageConnection {
  return {
    ...newLanguageConnection(),
    baseUrl: "https://models.example/v1",
    apiKey: "fixture-key",
    protocol: "responses",
    model,
    ...overrides,
  };
}

describe("updating the configured models from a catalog", () => {
  it("adds every selected model with the same API settings and keeps the initial display name once", () => {
    const draft = connection("", { name: "Preferred" });
    const updated = applyModelCatalog(
      [draft],
      draft,
      ["alpha", "beta", "gamma"],
      new Set(["beta", "gamma"]),
    );

    expect(updated.editedId).toBe(draft.id);
    expect(updated.language).toMatchObject([
      { ...draft, model: "beta" },
      { ...draft, id: expect.any(String), name: "", model: "gamma" },
    ]);
    expect(updated.language[1].id).not.toBe(draft.id);
  });

  it("removes unchecked catalog models only from the active connection and keeps existing verification", () => {
    const current = connection("alpha");
    const retained = connection("beta", {
      name: "Verified reader",
      baseUrl: " https://models.example/v1/ ",
      checks: { vision: { status: "verified" } },
    });
    const manual = connection("private-model");
    const otherKey = connection("alpha", { apiKey: "other-key" });
    const otherProtocol = connection("alpha", { protocol: "chat-completions" });
    const otherUrl = connection("alpha", {
      baseUrl: "https://other.example/v1",
    });

    const updated = applyModelCatalog(
      [current, retained, manual, otherKey, otherProtocol, otherUrl],
      current,
      ["alpha", "beta"],
      new Set(["beta"]),
    );

    expect(updated.language).toEqual([
      retained,
      manual,
      otherKey,
      otherProtocol,
      otherUrl,
    ]);
    expect(updated.editedId).toBe(retained.id);
  });

  it("reuses an already configured selection when adding through the same catalog", () => {
    const saved = connection("alpha", { enabled: false });
    const draft = connection("");

    expect(
      applyModelCatalog([saved, draft], draft, ["alpha"], new Set(["alpha"])),
    ).toEqual({
      language: [saved],
      editedId: saved.id,
    });
  });

  it("opens the chosen catalog model while keeping the manually entered model", () => {
    const manual = connection("manual");
    const updated = applyModelCatalog(
      [manual],
      manual,
      ["alpha"],
      new Set(["alpha"]),
    );

    expect(updated.language[0]).toBe(manual);
    expect(updated.language[1].model).toBe("alpha");
    expect(updated.editedId).toBe(updated.language[1].id);
  });
});
