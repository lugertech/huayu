import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

describe("browser model settings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("__HUAYU_DEV_API_ORIGIN__", "");
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("initial model setup", () => {
    beforeEach(() => {
      const storage = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      });
      vi.stubGlobal("window", {
        location: { origin: "http://127.0.0.1:5858" },
        addEventListener: vi.fn(),
      });
    });

    it("merges edited fields with changes already written by another tab", async () => {
      const {
        getSettings,
        defaultSettings,
        MODEL_STORAGE_KEY,
        saveConnectionEdits,
      } = await import("./settings");
      getSettings();
      const other = defaultSettings();
      other.connections.text.model = "changed-elsewhere";
      other.connections.image.baseUrl = "https://example.test/images";
      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(other));
      saveConnectionEdits({ image: { model: "new-image" } });
      expect(getSettings().connections).toMatchObject({
        text: { model: "changed-elsewhere" },
        image: { baseUrl: "https://example.test/images", model: "new-image" },
      });
    });
    it("releases reverted fields and keeps credentials with their service when merging tabs", async () => {
      const {
        changedConnectionFields,
        defaultSettings,
        getSettings,
        saveSettings,
        saveConnectionEdits,
      } = await import("./settings");
      const original = defaultSettings();
      const saved = original.connections.text;
      const changed = changedConnectionFields(saved, {
        ...saved,
        model: "temporary",
      });
      const reverted = changedConnectionFields(saved, {
        ...saved,
        ...changed,
        model: saved.model,
      });
      expect(reverted).toEqual({});
      const credentials = changedConnectionFields(saved, {
        ...saved,
        apiKey: "test-only",
      });
      const other = defaultSettings();
      other.connections.text.model = "newer-text";
      other.connections.text.baseUrl = "https://example.test/other";
      saveSettings(other);
      saveConnectionEdits({ text: reverted, image: { model: "edited-image" } });
      expect(getSettings().connections.text).toEqual(other.connections.text);
      saveConnectionEdits({ text: credentials });
      expect(getSettings().connections.text).toMatchObject({
        model: "newer-text",
        baseUrl: saved.baseUrl,
        apiKey: "test-only",
      });
      const search = original.connections.search;
      expect(
        changedConnectionFields(search, {
          ...search,
          provider: "brave",
          baseUrl: "https://api.search.brave.com",
        }),
      ).toEqual({
        provider: "brave",
        baseUrl: "https://api.search.brave.com",
        apiKey: "",
      });
    });
    it("offers setup for defaults and remembers skipping without saving model settings", async () => {
      const { shouldOfferModelSetup, dismissModelSetup, MODEL_STORAGE_KEY } =
        await import("./settings");
      expect(shouldOfferModelSetup()).toBe(true);

      dismissModelSetup();
      expect(shouldOfferModelSetup()).toBe(false);
      expect(localStorage.getItem(MODEL_STORAGE_KEY)).toBeNull();
    });

    it("offers setup with only search configured and accepts an existing keyless model", async () => {
      const { shouldOfferModelSetup, saveSettings, defaultSettings } =
        await import("./settings");
      const settings = defaultSettings();
      settings.connections.search.apiKey = "test-only-search-key";
      saveSettings(settings);
      expect(shouldOfferModelSetup()).toBe(true);

      settings.connections.transcription.baseUrl = "http://localhost:8001/v1";
      saveSettings(settings);
      expect(shouldOfferModelSetup()).toBe(false);
    });
  });

  it("prefills current OpenAI models for new text and image connections", async () => {
    const { defaultSettings } = await import("./settings");
    expect(defaultSettings().connections).toMatchObject({
      text: { baseUrl: "https://api.openai.com/v1", model: "gpt-6-luna" },
      vision: { baseUrl: "https://api.openai.com/v1", model: "gpt-6-luna" },
      image: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-2.6-flare",
      },
    });
  });

  it("preserves an explicitly saved legacy image model for compatible services", async () => {
    const { parseSettings } = await import("./settings");
    const connection = {
      baseUrl: "https://compatible.example/v1",
      model: "gpt-image-1",
    };
    const settings = parseSettings(
      JSON.stringify({ version: 1, connections: { image: connection } }),
    );
    expect(settings.connections.image).toMatchObject(connection);
  });

  it.each([5858, 5173, 9000])(
    "accepts an external model service on port %i even with an API path",
    async (port) => {
      vi.stubGlobal("window", {
        location: { origin: "http://127.0.0.1:5173" },
        addEventListener: vi.fn(),
      });
      const { modelEndpoint, defaultSettings } = await import("./settings");
      const connection = defaultSettings().connections.text;
      connection.baseUrl = `http://model.example:${port}/api/v1`;
      expect(modelEndpoint(connection, "chat/completions")).toBe(
        `http://model.example:${port}/api/v1/chat/completions`,
      );
    },
  );

  it("rejects this application's API at a custom frontend or backend origin", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:7100" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("__HUAYU_DEV_API_ORIGIN__", "http://127.0.0.1:9000");
    const { modelEndpoint, defaultSettings } = await import("./settings");
    const { LocalizedError } = await import("@/i18n/errors");
    const connection = defaultSettings().connections.text;
    for (const origin of ["http://127.0.0.1:7100", "http://127.0.0.1:9000"]) {
      connection.baseUrl = `${origin}/api`;
      expect(() => modelEndpoint(connection, "chat/completions")).toThrow(
        LocalizedError,
      );
    }
    connection.baseUrl = "http://127.0.0.1:9000/v1";
    expect(modelEndpoint(connection, "chat/completions")).toBe(
      "http://127.0.0.1:9000/v1/chat/completions",
    );
    connection.baseUrl = "http://127.0.0.1:7100/apix";
    expect(modelEndpoint(connection, "chat/completions")).toBe(
      "http://127.0.0.1:7100/apix/chat/completions",
    );
  });

  it("still opens settings when browser storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage blocked");
      },
    });
    const { getSettings, defaultSettings } = await import("./settings");
    expect(getSettings()).toEqual(defaultSettings());
  });

  it("keeps the saved connection active when writing a draft fails", async () => {
    const { getSettings, saveSettings, defaultSettings } =
      await import("./settings");
    const saved = defaultSettings();
    saved.connections.text.model = "saved-model";
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(saved),
      setItem: () => {
        throw new Error("Storage full");
      },
    });
    expect(getSettings().connections.text.model).toBe("saved-model");
    const draft = defaultSettings();
    draft.connections.text.model = "unsaved-model";
    expect(() => saveSettings(draft)).toThrow("Storage full");
    expect(getSettings().connections.text.model).toBe("saved-model");
  });

  it("accepts a pasted address with surrounding whitespace and a trailing slash", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:5861" },
      addEventListener: vi.fn(),
    });
    const { modelEndpoint, defaultSettings } = await import("./settings");
    const connection = defaultSettings().connections.text;
    connection.baseUrl = "  http://localhost:11434/v1/ \n";
    expect(modelEndpoint(connection, "chat/completions")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });
});
