export function getToolDockLayout({
  width,
  dockWidth,
  left,
  right,
  gap,
}: {
  width: number;
  dockWidth: number;
  left: number;
  right: number;
  gap: number;
}) {
  const centered = (width - dockWidth) / 2;
  const start = left + gap;
  const end = right - gap - dockWidth;
  const stacked = start > end;
  return {
    shift: stacked || centered >= start ? 0 : end - centered,
    stacked,
  };
}
