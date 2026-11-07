export type StylesPanelMode = "full" | "compact" | "mobile";

// Follow upstream's phone breakpoints; use compact desktop UI when the editor
// has at most a tablet's width. Measure the editor, not the browser window.
// https://github.com/excalidraw/excalidraw/blob/master/packages/common/src/editorInterface.ts
export function getStylesPanelMode(
  width: number,
  height: number,
): StylesPanelMode {
  if (width <= 599 || (height < 500 && width < 1000)) return "mobile";
  return width <= 1180 ? "compact" : "full";
}
