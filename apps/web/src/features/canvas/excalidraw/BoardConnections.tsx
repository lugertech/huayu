import { useEditor } from "@/features/canvas/editor";
import { ComponentConnectionDots } from "@/features/canvas/components/ComponentConnectionDots";

export function BoardConnections() {
  const editor = useEditor();
  const selected = editor.getSelectedShapes();
  const frame = selected.length === 1 ? selected[0] : undefined;
  if (
    frame?.type !== "frame" ||
    frame.isLocked ||
    editor.getCurrentToolId() !== "select"
  )
    return null;

  const camera = editor.session.camera;
  const transform = editor.getPageTransform(frame);
  return (
    <div
      className="board-frame-connections"
      data-canvas-ui
      style={{
        width: frame.props.w,
        height: frame.props.h,
        transform: `translate(${(transform.x + camera.x) * camera.z}px, ${(transform.y + camera.y) * camera.z}px) scale(${camera.z}) rotate(${transform.rotation}rad)`,
      }}
    >
      <ComponentConnectionDots shape={frame} />
    </div>
  );
}
