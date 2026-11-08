import type { Editor, VecLike } from "@/features/canvas/editor";
import { isCustomElement } from "./scene";

/** Component bodies can be inert at overview zoom, so use canvas geometry for drops. */
export function componentAtDropPoint(editor: Editor, screenPoint: VecLike) {
  const point = editor.screenToPage(screenPoint);
  return editor
    .getCurrentPageShapes()
    .filter(isCustomElement)
    .sort((a, b) => b.index.localeCompare(a.index))
    .find((shape) => {
      const transform = editor.getPageTransform(shape);
      const dx = point.x - transform.x;
      const dy = point.y - transform.y;
      const x =
        dx * Math.cos(transform.rotation) + dy * Math.sin(transform.rotation);
      const y =
        -dx * Math.sin(transform.rotation) + dy * Math.cos(transform.rotation);
      return x >= 0 && y >= 0 && x <= shape.props.w && y <= shape.props.h;
    });
}
