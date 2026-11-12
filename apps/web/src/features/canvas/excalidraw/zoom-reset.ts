import { getCommonBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

export function getResetZoomViewport(
  elements: readonly ExcalidrawElement[],
  {
    width,
    height,
    scrollX,
    scrollY,
    zoom,
  }: Pick<AppState, "width" | "height" | "scrollX" | "scrollY" | "zoom">,
) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const centerX = halfWidth / zoom.value - scrollX;
  const centerY = halfHeight / zoom.value - scrollY;
  const resetZoom = { value: 1 as AppState["zoom"]["value"] };
  const elementsMap = new Map(elements.map((element) => [element.id, element]));
  let targetX = centerX;
  let targetY = centerY;
  let nearestDistance = Infinity;

  // Keep the current center if any element intersects the 100% viewport.
  // Otherwise center the closest element, which also works for dispersed scenes.
  for (const element of elements) {
    const [left, top, right, bottom] = getCommonBounds([element], elementsMap);
    const gapX = Math.max(left - centerX, centerX - right, 0);
    const gapY = Math.max(top - centerY, centerY - bottom, 0);
    if (gapX <= halfWidth && gapY <= halfHeight) {
      return {
        scrollX: halfWidth - centerX,
        scrollY: halfHeight - centerY,
        zoom: resetZoom,
      };
    }
    const distance = Math.hypot(gapX, gapY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      targetX = (left + right) / 2;
      targetY = (top + bottom) / 2;
    }
  }
  return {
    scrollX: halfWidth - targetX,
    scrollY: halfHeight - targetY,
    zoom: resetZoom,
  };
}
