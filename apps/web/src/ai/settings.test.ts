import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

describe("browser model settings", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

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
