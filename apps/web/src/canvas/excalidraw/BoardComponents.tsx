import { t, useLocale } from "@/i18n";
import { useEditor, type Editor, type CanvasShape } from "@/canvas/editor";
import { CanvasNode } from "@/Components/canvas/CanvasNode";
import { StartComponent } from "@/Components/shapes/StartShape/StartComponent";
import { DrawComponent } from "@/Components/shapes/DrawShape/DrawComponent";
import { InteractiveWebComponent } from "@/Components/shapes/InteractiveWebShape/InteractiveWebComponent";
import { NativeSVG } from "@/canvas/engine/visual";
import { useTheme } from "@/lib/theme";
import { isComponent, isCustomElement } from "./scene";

function frameClip(editor: Editor, shape: CanvasShape) {
  let parent = editor.getShape(shape.parentId);
  for (let depth = 0; parent && depth < 100; depth++) {
    if (parent.type === "frame") {
      const frame = editor.getPageTransform(parent);
      const origin = editor.getPageTransform(shape);
      const c = Math.cos(-origin.rotation);
      const s = Math.sin(-origin.rotation);
      const points = [
        [0, 0],
        [parent.props.w, 0],
        [parent.props.w, parent.props.h],
        [0, parent.props.h],
      ].map(([x, y]) => {
        const dx =
          frame.x +
          x * Math.cos(frame.rotation) -
          y * Math.sin(frame.rotation) -
          origin.x;
        const dy =
          frame.y +
          x * Math.sin(frame.rotation) +
          y * Math.cos(frame.rotation) -
          origin.y;
        return `${dx * c - dy * s}px ${dx * s + dy * c}px`;
      });
      return `polygon(${points.join(",")})`;
    }
    parent = editor.getShape(parent.parentId);
  }
}

/** Native geometry owns selection, transforms, bindings and history; React owns card content. */
export function BoardComponents() {
  useLocale();
  const editor = useEditor();
  const { resolved } = useTheme();
  const camera = editor.session.camera;
  const selected = new Set(editor.getSelectedShapeIds());
  return (
    <div className="board-component-layer">
      {editor
        .getCurrentPageShapes()
        .filter(isCustomElement)
        .sort((a, b) => a.index.localeCompare(b.index))
        .map((shape) => {
          const transform = editor.getPageTransform(shape);
          const props = shape.props;
          let content;
          if (shape.type === "start")
            content = <StartComponent shape={shape as any} />;
          else if (shape.type === "ai-draw")
            content = <DrawComponent shape={shape as any} />;
          else if (shape.type === "interactive-web")
            content = <InteractiveWebComponent shape={shape as any} />;
          else if (isComponent(shape))
            content = <CanvasNode shape={shape as any} />;
          else if (shape.type === "video")
            content = (
              <video
                controls
                src={props.src || editor.store.get(props.assetId)?.props?.src}
                className="board-node-surface h-full w-full"
              />
            );
          else if (["embed", "bookmark"].includes(shape.type))
            content = (
              <iframe
                title={t("canvas.tools.embeddedContent")}
                src={props.url}
                sandbox="allow-scripts allow-forms"
                referrerPolicy="no-referrer"
                className="board-node-surface h-full w-full"
              />
            );
          else content = <NativeSVG shape={shape} dark={resolved === "dark"} />;
          return (
            <div
              key={shape.id}
              className="board-component"
              data-component-id={shape.id}
              data-selected={selected.has(shape.id) || undefined}
              style={{
                width: props.w,
                height: props.h,
                opacity: shape.opacity,
                clipPath: frameClip(editor, shape),
                transformOrigin: "0 0",
                transform: `translate(${(transform.x + camera.x) * camera.z}px, ${(transform.y + camera.y) * camera.z}px) scale(${camera.z}) rotate(${transform.rotation}rad)`,
              }}
            >
              {content}
            </div>
          );
        })}
    </div>
  );
}
