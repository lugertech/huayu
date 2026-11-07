import { t } from "@/i18n";
import {
  COMPONENT_CONFIGS,
  getDefaultComponentProps,
  type ComponentType,
} from "@/config/components";
import {
  Editor,
  createCanvasStore,
  createShapeId,
  type VecLike,
} from "./editor";

export function createCanvasShape(
  editor: Editor,
  type: ComponentType,
  point?: VecLike,
) {
  const config = COMPONENT_CONFIGS[type];
  const viewport = editor.getViewportPageBounds();
  const center = point || viewport.center;
  const id = createShapeId();
  const props =
    type === "frame"
      ? {
          w: config.defaultSize.w,
          h: config.defaultSize.h,
          name: t("canvas.frame"),
          color: "black",
        }
      : getDefaultComponentProps(type);
  editor.run(() => {
    editor.createShape({
      id,
      type,
      x: center.x - config.defaultSize.w / 2,
      y: center.y - config.defaultSize.h / 2,
      props,
    });
    editor.select(id);
    editor.setCurrentTool("select");
  });
  if (
    !point &&
    (config.defaultSize.w + 48 / editor.session.camera.z > viewport.w ||
      config.defaultSize.h + 96 / editor.session.camera.z > viewport.h)
  )
    editor.zoomToBounds(editor.getShapePageBounds(id)!);
  return id;
}

/** A live card uses the same renderer without changing the document until placement. */
export class ComponentDrag {
  private state:
    | { phase: "pressed" | "finished" | "cancelled" }
    | { phase: "dragging"; preview: Editor; previewId: string } = {
    phase: "pressed",
  };
  get preview() {
    return this.state.phase === "dragging" ? this.state.preview : null;
  }
  constructor(
    private readonly editor: Editor,
    readonly type: ComponentType,
    private readonly start: VecLike,
  ) {}

  move(point: VecLike) {
    if (
      this.state.phase === "finished" ||
      this.state.phase === "cancelled" ||
      (this.state.phase === "pressed" &&
        Math.hypot(point.x - this.start.x, point.y - this.start.y) <= 8)
    )
      return;
    const page = this.editor.screenToPage(point);
    const size = COMPONENT_CONFIGS[this.type].defaultSize;
    if (this.state.phase === "pressed") {
      const preview = new Editor(createCanvasStore());
      preview.theme = this.editor.theme;
      preview.setViewport(this.editor.viewport);
      const previewId = createCanvasShape(preview, this.type, {
        x: page.x,
        y: page.y + size.h / 2 - 20,
      });
      preview.select();
      this.state = { phase: "dragging", preview, previewId };
    } else if (this.state.phase === "dragging") {
      this.preview.theme = this.editor.theme;
      this.preview.setViewport(this.editor.viewport);
      this.preview.updateShape({
        id: this.state.previewId,
        x: page.x - size.w / 2,
        y: page.y - 20,
      });
    }
  }

  finish(point: VecLike, validDrop: boolean) {
    if (this.state.phase === "finished" || this.state.phase === "cancelled")
      return;
    const dragged = this.state.phase === "dragging";
    this.state = { phase: "finished" };
    if (!dragged || !validDrop) return;
    const page = this.editor.screenToPage(point);
    return createCanvasShape(this.editor, this.type, {
      x: page.x,
      y: page.y + COMPONENT_CONFIGS[this.type].defaultSize.h / 2 - 20,
    });
  }

  cancel() {
    this.state = { phase: "cancelled" };
  }
}
