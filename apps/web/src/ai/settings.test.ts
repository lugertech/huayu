import {
  defaultSettings,
  modelCheckStatus,
  modelEndpoint,
  newLanguageConnection,
  parseSettings,
  updateConnection,
} from "./model-config";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const verified = { status: "verified" } as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("__HUAYU_DEV_API_ORIGIN__", "");
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", {
    location: { origin: "http://127.0.0.1:5173" },
    addEventListener: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("browser model settings", () => {
  it("offers setup for a new browser and remembers later without saving a model", async () => {
    const {
      shouldOfferModelSetup,
      dismissModelSetup,
      MODEL_STORAGE_KEY,
      getSettings,
    } = await import("./settings");
    expect(shouldOfferModelSetup()).toBe(true);
    expect(getSettings().language).toEqual([]);
    expect(newLanguageConnection()).toMatchObject({
      name: "",
      baseUrl: "",
      apiKey: "",
      model: "",
    });
    dismissModelSetup();
    expect(shouldOfferModelSetup()).toBe(false);
    expect(localStorage.getItem(MODEL_STORAGE_KEY)).toBeNull();
  });

  it("still offers setup with only search enabled and accepts a keyless local model", async () => {
    const { saveSettings, shouldOfferModelSetup } = await import("./settings");
    const settings = defaultSettings();
    settings.search = {
      ...settings.search,
      enabled: true,
      apiKey: "test-only",
    };
    saveSettings(settings);
    expect(shouldOfferModelSetup()).toBe(true);
    saveSettings({
      ...settings,
      language: [
        {
          ...newLanguageConnection(),
          baseUrl: "http://localhost:11434/v1",
          model: "local-model",
        },
      ],
    });
    expect(shouldOfferModelSetup()).toBe(false);
  });

  it("ignores saved placeholder rows and retains real language connections from before the API URL was required", () => {
    const placeholder = { ...newLanguageConnection(), model: "gpt-6-luna" };
    const named = {
      ...newLanguageConnection(),
      name: "Gateway",
      baseUrl: "https://models.example/v1",
      model: "gpt-6-luna",
    };
    const implicitAddress = {
      ...newLanguageConnection(),
      apiKey: "test-only",
      model: "my-model",
      checks: { text: verified },
    };
    const settings = defaultSettings();
    settings.language = [placeholder, named, implicitAddress];
    settings.selection.text = placeholder.id;
    settings.selection.vision = named.id;

    const parsed = parseSettings(JSON.stringify(settings));
    expect(parsed.language).toEqual([
      named,
      { ...implicitAddress, baseUrl: "https://api.openai.com/v1" },
    ]);
    expect(parsed.selection).toMatchObject({ text: null, vision: named.id });
  });

  it("restores only the checks supported by each model connection", () => {
    const checks = {
      text: verified,
      vision: { status: "unsupported" } as const,
      image: verified,
      "image-edit": verified,
      speech: verified,
      transcription: verified,
      search: verified,
    };
    const saved = defaultSettings();
    saved.language.push({
      ...newLanguageConnection(),
      model: "example",
      checks,
    });
    for (const connection of [
      ...Object.values(saved.images),
      saved.speech,
      saved.transcription,
      saved.search,
    ])
      connection.checks = checks;
    const restored = parseSettings(JSON.stringify(saved));
    expect(restored.language[0].checks).toEqual({
      text: verified,
      vision: checks.vision,
    });
    for (const connection of Object.values(restored.images))
      expect(connection.checks).toEqual({
        image: verified,
        "image-edit": verified,
      });
    expect(restored.speech.checks).toEqual({ speech: verified });
    expect(restored.transcription.checks).toEqual({ transcription: verified });
    expect(restored.search.checks).toEqual({ search: verified });
  });

  it("migrates language selections separately and keeps v1 available for rollback", async () => {
    const {
      getSettings,
      MODEL_STORAGE_KEY,
      LEGACY_MODEL_STORAGE_KEY,
      saveSettingsEdits,
      connectionFor,
      requireConnection,
    } = await import("./settings");
    const legacy = JSON.stringify({
      version: 1,
      connections: {
        text: { baseUrl: "http://localhost:11434/v1", model: "writer" },
        vision: {
          baseUrl: "https://vision.example/v1",
          model: "reader",
          apiKey: "test-vision",
        },
        image: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "test-image",
          model: "gpt-image-1.5",
        },
        speech: { apiKey: "test-legacy-voice" },
        transcription: { apiKey: "test-legacy-asr" },
        search: { provider: "brave", apiKey: "test-legacy-search" },
      },
    });
    localStorage.setItem(LEGACY_MODEL_STORAGE_KEY, legacy);
    const migrated = getSettings();
    expect(connectionFor("text", migrated)).toMatchObject({
      model: "writer",
      protocol: "chat-completions",
    });
    expect(connectionFor("vision", migrated)).toMatchObject({
      model: "reader",
      apiKey: "test-vision",
    });
    expect(() => requireConnection("vision", migrated)).toThrow();
    expect(modelCheckStatus("image", migrated.images["gpt-image"])).toBe(
      "pending",
    );
    expect(migrated.speech.apiKey).toBe("");
    expect(migrated.transcription.apiKey).toBe("");
    expect(migrated.search.apiKey).toBe("");
    expect(localStorage.getItem(MODEL_STORAGE_KEY)).toBeNull();
    saveSettingsEdits(migrated, {
      ...migrated,
      selection: { ...migrated.selection, vision: null },
    });
    expect(localStorage.getItem(MODEL_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(LEGACY_MODEL_STORAGE_KEY)).toBe(legacy);
  });

  it("only migrates official image and search keys to their matching services", () => {
    const input = {
      image: {
        baseUrl: "https://gateway.example/v1",
        model: "gpt-image-2",
        apiKey: "test-other",
      },
      search: {
        baseUrl: "https://api.tavily.com/",
        provider: "tavily",
        apiKey: "test-search",
      },
    };
    const settings = parseSettings(
      JSON.stringify({ version: 1, connections: input }),
    );
    expect(settings.language).toEqual([]);
    expect(settings.images["gpt-image"].apiKey).toBe("");
    expect(settings.search).toMatchObject({
      enabled: true,
      apiKey: "test-search",
    });
  });

  it("merges edits in separate categories without replacing a selection made in another tab", async () => {
    const { saveSettings, getSettings, saveSettingsEdits } =
      await import("./settings");
    const original = defaultSettings();
    const language = {
      ...newLanguageConnection(),
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
    };
    saveSettings(original);
    const other = {
      ...original,
      language: [language],
      selection: { ...original.selection, text: language.id },
    };
    saveSettings(other);
    saveSettingsEdits(original, {
      ...original,
      search: { ...original.search, apiKey: "test-search", enabled: true },
    });
    expect(getSettings().language).toEqual(other.language);
    expect(getSettings().selection.text).toBe(language.id);
    expect(getSettings().search.apiKey).toBe("test-search");
  });

  it("keeps an edited credential with its URL when another tab changed them", async () => {
    const { saveSettings, getSettings, saveSettingsEdits } =
      await import("./settings");
    const before = {
      ...newLanguageConnection(),
      baseUrl: "https://original.example/v1",
      model: "original-model",
    };
    const original = { ...defaultSettings(), language: [before] };
    saveSettings({
      ...original,
      language: [
        {
          ...before,
          baseUrl: "https://other.example/v1",
          model: "other-model",
          apiKey: "test-other",
        },
      ],
    });
    saveSettingsEdits(original, {
      ...original,
      language: [{ ...before, apiKey: "test-original" }],
    });
    expect(getSettings().language[0]).toMatchObject({
      baseUrl: "https://original.example/v1",
      model: "other-model",
      apiKey: "test-original",
    });
  });

  it("keeps the active form connection when saving the same request settings", async () => {
    const { saveSettings, getSettings, saveSettingsEdits } =
      await import("./settings");
    const before = {
      ...newLanguageConnection(),
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
    };
    const original = { ...defaultSettings(), language: [before] };
    saveSettings(original);

    const editing = { ...before, name: "My local model" };
    saveSettingsEdits(original, { ...original, language: [editing] });
    const saved = getSettings();
    expect(saved.language[0]).toBe(editing);

    const checked = { ...editing, checks: { text: verified } };
    saveSettingsEdits(saved, { ...saved, language: [checked] });
    expect(getSettings().language[0]).toBe(checked);
  });

  it("retains verification from a new test only when the committed settings still match it", async () => {
    const { saveSettings, getSettings, saveSettingsEdits } =
      await import("./settings");
    const before = {
      ...newLanguageConnection(),
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
      checks: { text: verified, vision: verified },
    };
    const original = { ...defaultSettings(), language: [before] };
    saveSettings(original);
    const changed = updateConnection(before, { protocol: "responses" });
    expect(changed.checks).toEqual({});
    saveSettingsEdits(original, {
      ...original,
      language: [{ ...changed, checks: { text: verified } }],
    });
    expect(getSettings().language[0]?.checks).toEqual({ text: verified });

    const previous = getSettings();
    saveSettings({
      ...previous,
      language: [
        { ...changed, baseUrl: "http://localhost:10110/v1", checks: {} },
      ],
    });
    saveSettingsEdits(previous, {
      ...previous,
      language: [{ ...changed, checks: { text: verified, vision: verified } }],
    });
    expect(getSettings().language[0]).toMatchObject({
      baseUrl: "http://localhost:10110/v1",
      checks: {},
    });
  });

  it("requires verified image understanding and defaults to the only enabled image provider", async () => {
    const { requireConnection } = await import("./settings");
    const language = {
      ...newLanguageConnection(),
      baseUrl: "http://localhost:11434/v1",
      model: "local-model",
      checks: { text: verified },
    };
    const settings = { ...defaultSettings(), language: [language] };
    expect(requireConnection("text", settings).id).toBe(language.id);
    expect(() => requireConnection("vision", settings)).toThrow();
    expect(() => requireConnection("image", settings)).toThrow();
    settings.images.seedream = {
      ...settings.images.seedream,
      apiKey: "test-ark",
      enabled: true,
    };
    expect(requireConnection("image", settings).provider).toBe("seedream");
    settings.images["gpt-image"] = {
      ...settings.images["gpt-image"],
      apiKey: "test-openai",
      enabled: true,
    };
    settings.selection.defaultImage = "seedream";
    expect(requireConnection("image", settings).provider).toBe("seedream");
    settings.selection.image = "gpt-image";
    expect(requireConnection("image", settings).provider).toBe("gpt-image");
  });

  it("ignores a completed operation after its credentials changed", async () => {
    const { saveSettings, getSettings, recordSuccessfulCheck } =
      await import("./settings");
    const settings = defaultSettings();
    const started = {
      ...settings.images.seedream,
      apiKey: "test-before",
      enabled: true,
    };
    settings.images.seedream = updateConnection(started, {
      apiKey: "test-after",
    });
    saveSettings(settings);
    recordSuccessfulCheck("image", started);
    expect(getSettings().images.seedream.checks).toEqual({});
    recordSuccessfulCheck("image", settings.images.seedream);
    expect(getSettings().images.seedream.checks).toEqual({ image: verified });
  });

  it.each([5858, 5173, 9000])(
    "accepts an external model service on port %i even with an API path",
    (port) => {
      expect(
        modelEndpoint(
          { baseUrl: "http://model.example:" + port + "/api/v1" },
          "chat/completions",
        ),
      ).toBe("http://model.example:" + port + "/api/v1/chat/completions");
    },
  );

  it("rejects the application's API as a model service", () => {
    vi.stubGlobal("__HUAYU_DEV_API_ORIGIN__", "http://127.0.0.1:9000");
    for (const origin of ["http://127.0.0.1:5173", "http://127.0.0.1:9000"]) {
      expect(() =>
        modelEndpoint({ baseUrl: origin + "/api" }, "chat/completions"),
      ).toThrow();
      expect(
        modelEndpoint({ baseUrl: origin + "/v1" }, "chat/completions"),
      ).toBe(origin + "/v1/chat/completions");
    }
  });

  it("uses defaults when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage blocked");
      },
    });
    const { getSettings } = await import("./settings");
    expect(getSettings()).toEqual(defaultSettings());
  });

  it("keeps a saved setting active if writing a draft fails", async () => {
    const { getSettings, saveSettings } = await import("./settings");
    const saved = {
      ...defaultSettings(),
      selection: {
        text: null,
        vision: null,
        image: "seedream",
        defaultImage: null,
      },
    } as const;
    localStorage.setItem("huayu:model-settings:v2", JSON.stringify(saved));
    const loaded = getSettings();
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Storage full");
      },
    });
    expect(() => saveSettings(defaultSettings())).toThrow("Storage full");
    expect(getSettings()).toEqual(loaded);
    expect(loaded.selection.image).toBe("seedream");
  });

  it("accepts pasted address whitespace and a trailing slash", () => {
    expect(
      modelEndpoint(
        { baseUrl: "  http://localhost:11434/v1/ \n" },
        "responses",
      ),
    ).toBe("http://localhost:11434/v1/responses");
  });
});
