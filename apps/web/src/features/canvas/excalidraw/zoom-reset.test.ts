import { describe, expect, it, vi } from "vite-plus/test";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { Editor, createCanvasStore } from "@/features/canvas/editor";
import { sceneFromEditor } from "./scene";
import { getResetZoomViewport } from "./zoom-reset";

vi.mock("@excalidraw/excalidraw", () => ({
  getCommonBounds: ([
    { x, y, width, height },
  ]: readonly ExcalidrawElement[]) => [x, y, x + width, y + height],
}));

const viewport = {
  width: 1000,
  height: 800,
  scrollX: 100,
  scrollY: -50,
  zoom: { value: 0.2 as AppState["zoom"]["value"] },
};
const centeredReset = { scrollX: -1900, scrollY: -1650, zoom: { value: 1 } };

function rectangles(...positions: [x: number, y: number][]) {
  const editor = new Editor(createCanvasStore());
  for (const [x, y] of positions) {
    editor.createShape({
      type: "geo",
      x,
      y,
      props: { geo: "rectangle", w: 100, h: 100 },
    });
  }
  return sceneFromEditor(editor);
}

describe("resetting the board to 100%", () => {
  it("brings edge content back when the centered reset would hide it", () => {
    expect(getResetZoomViewport(rectangles([150, 200]), viewport)).toEqual({
      scrollX: 300,
      scrollY: 150,
      zoom: { value: 1 },
    });
  });

  it("centers the closest element when content lies on both sides of the viewport", () => {
    expect(
      getResetZoomViewport(rectangles([50, 1950], [3650, 1950]), viewport),
    ).toEqual({ scrollX: -3200, scrollY: -1600, zoom: { value: 1 } });
  });

  it("keeps the viewport center when any element will remain partly visible", () => {
    expect(
      getResetZoomViewport(rectangles([150, 200], [2850, 2000]), viewport),
    ).toEqual(centeredReset);
  });

  it("keeps the viewport center on an empty board", () => {
    expect(getResetZoomViewport([], viewport)).toEqual(centeredReset);
  });
});
