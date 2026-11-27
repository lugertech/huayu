import { useEffect, useRef, useState, type MouseEvent } from "react";

interface ChartBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function useChartViewport(bounds: ChartBounds) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    if (hasInitialized.current || bounds.width === 0) return;
    const frame = requestAnimationFrame(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      const scale =
        Math.min(rect.width / bounds.width, rect.height / bounds.height, 1) *
        1.2;
      setTransform({
        x: (rect.width - bounds.width * scale) / 2 - bounds.minX * scale,
        y: (rect.height - bounds.height * scale) / 2 - bounds.minY * scale,
        scale,
      });
      hasInitialized.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [bounds]);

  function startPan(event: MouseEvent) {
    event.stopPropagation();
    setDragStart({
      x: event.clientX - transform.x,
      y: event.clientY - transform.y,
    });
  }

  function movePan(event: MouseEvent) {
    if (!dragStart) return;
    event.stopPropagation();
    const x = event.clientX - dragStart.x;
    const y = event.clientY - dragStart.y;
    setTransform((previous) => ({ ...previous, x, y }));
  }

  function zoom(event: MouseEvent, factor: number) {
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setTransform((previous) => {
      const scale = Math.max(0.3, Math.min(2, previous.scale * factor));
      return {
        scale,
        x: centerX - (centerX - previous.x) * (scale / previous.scale),
        y: centerY - (centerY - previous.y) * (scale / previous.scale),
      };
    });
  }

  return {
    containerRef,
    transform,
    isDragging: dragStart !== null,
    startPan,
    movePan,
    endPan: () => setDragStart(null),
    zoomIn: (event: MouseEvent) => zoom(event, 1.1),
    zoomOut: (event: MouseEvent) => zoom(event, 0.9),
  };
}
