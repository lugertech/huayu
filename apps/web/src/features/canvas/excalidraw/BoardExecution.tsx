import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { useEditor } from "@/features/canvas/editor";
import {
  nodeExecution,
  stopAllExecutions,
  useWorkflowState,
} from "@/workflow/execute";
import { resultIsStale } from "@/workflow/freshness";
import { createPortal } from "react-dom";

/** Execution is a view layer, so progress never changes saved arrow colors or exports. */
export function BoardExecution() {
  const { t } = useTranslations();
  const editor = useEditor();
  const { busy, stopping } = useWorkflowState(editor);
  const stopLabel = t("canvas.node.stopRun");
  const controls = busy && (
    <div
      className="board-run-controls flex items-center gap-2 px-2.5 py-[3px] text-popover-foreground"
      data-canvas-ui
    >
      <span
        className="min-w-12 text-xs font-medium whitespace-nowrap"
        role="status"
      >
        {t(stopping ? "workflow.status.stopping" : "canvas.node.running")}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-red-600 hover:text-red-600 disabled:text-muted-foreground disabled:transition-none"
        disabled={stopping}
        aria-label={stopLabel}
        title={stopLabel}
        onClick={() => stopAllExecutions(editor)}
      >
        <span aria-hidden="true" className="size-3.5 bg-current" />
      </Button>
    </div>
  );
  const camera = editor.session.camera;
  const wires = (
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
  return (
    <>
      {controls && createPortal(controls, document.body)}
      {wires}
    </>
  );
}
