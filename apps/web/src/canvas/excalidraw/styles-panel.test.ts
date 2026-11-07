import { describe, expect, it } from "vite-plus/test";
import { getStylesPanelMode } from "./styles-panel";

describe("responsive native styles", () => {
  it.each([
    { width: 599, height: 900, mode: "mobile" },
    { width: 600, height: 900, mode: "compact" },
    { width: 1180, height: 900, mode: "compact" },
    { width: 1181, height: 900, mode: "full" },
    { width: 999, height: 499, mode: "mobile" },
    { width: 999, height: 500, mode: "compact" },
    { width: 1000, height: 499, mode: "compact" },
    { width: 1440, height: 499, mode: "full" },
  ])("uses $mode controls at $width × $height", ({ width, height, mode }) => {
    expect(getStylesPanelMode(width, height)).toBe(mode);
  });
});
