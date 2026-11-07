export function SidebarProjectsPlaceholder() {
  return (
    <div className="flex flex-col gap-0.5">
      {["72%", "56%", "84%", "64%", "48%"].map((width) => (
        <div key={width} className="sidebar-item">
          <span skullet-block="" className="h-3 rounded" style={{ width }} />
        </div>
      ))}
    </div>
  );
}
