import { useEditor } from "@/features/canvas/editor";
import { nodeExecution, useWorkflowState } from "@/workflow/execution-state";
import { resultIsStale } from "@/workflow/freshness";

/** Execution is a view layer, so progress never changes saved arrow colors or exports. */
export function BoardExecution() {
  const editor = useEditor();
  useWorkflowState(editor);
  const camera = editor.session.camera;
  return (
    <svg className="board-execution-overlay" aria-hidden="true">
      <g
        transform={`translate(${camera.x * camera.z} ${camera.y * camera.z}) scale(${camera.z})`}
      >
        {editor
          .getCurrentPageShapes()
          .filter((shape) => shape.type === "arrow")
          .map((shape) => {
            const bindings = editor.getBindingsFromShape(shape.id, "arrow");
            const from = bindings.find(
              (binding) => binding.props.terminal === "start",
            )?.toId;
            const to = bindings.find(
              (binding) => binding.props.terminal === "end",
            )?.toId;
            if (!from || !to) return null;
            const source = nodeExecution(editor, from);
            const target = nodeExecution(editor, to);
            const running =
              target.status === "running" ||
              (source.status === "running" && target.status === "queued");
            const stale =
              !editor.getShape(to)?.props.isLocked && resultIsStale(editor, to);
            if (!running && !stale) return null;
            const { start, end } = editor.arrowPoints(shape);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.hypot(dx, dy) || 1;
            const bend = shape.props.bend || 0;
            const control = {
              x: (start.x + end.x) / 2 - (dy / length) * bend * 2,
              y: (start.y + end.y) / 2 + (dx / length) * bend * 2,
            };
            const native = shape.props.excalidraw;
            const nativePoints: { x: number; y: number }[] | undefined =
              native?.points?.length >= 2
                ? native.points.map(([x, y]: number[]) => {
                    const origin = editor.getPageTransform(shape);
                    return {
                      x:
                        origin.x +
                        x * Math.cos(origin.rotation) -
                        y * Math.sin(origin.rotation),
                      y:
                        origin.y +
                        x * Math.sin(origin.rotation) +
                        y * Math.cos(origin.rotation),
                    };
                  })
                : undefined;
            const path =
              nativePoints && (nativePoints.length === 2 || native.elbowed)
                ? nativePoints
                    .map(
                      (point, index) =>
                        `${index ? "L" : "M"} ${point.x} ${point.y}`,
                    )
                    .join(" ")
                : `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
            return (
              <path
                key={shape.id}
                className={running ? "workflow-wire-running" : undefined}
                d={path}
                fill="none"
                stroke={running ? "var(--primary)" : "var(--muted-foreground)"}
                strokeWidth={2 / camera.z}
                strokeDasharray={
                  !running && stale
                    ? `${4 / camera.z} ${5 / camera.z}`
                    : undefined
                }
                opacity={running ? 1 : 0.65}
              />
            );
          })}
      </g>
    </svg>
  );
}
