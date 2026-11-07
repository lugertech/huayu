import { useEffect, useRef } from "react";

// Only the hover background moves; links and menu buttons keep stable hit areas.
export function SidebarProjectHighlight() {
  const highlightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const highlight = highlightRef.current!;
    const list = highlight.parentElement!;
    const scroller = list.closest(".sidebar-recent-list")!;
    const motion = matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let activeItem: HTMLElement | null = null;
    let pending: { item: HTMLElement; x: number; y: number } | null = null;
    let frame = 0;

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      activeItem?.removeAttribute("data-hover-target");
      activeItem = null;
      list.removeAttribute("data-hover-active");
      highlight.style.transition = "";
    };
    const paint = () => {
      frame = 0;
      if (!pending || !motion.matches) return;
      const { item, x, y } = pending;
      pending = null;
      if (!item.isConnected) {
        reset();
        return;
      }
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const left = itemRect.left - listRect.left;
      const top = itemRect.top - listRect.top;
      const pullX =
        Math.max(
          -1,
          Math.min(1, ((x - itemRect.left) / itemRect.width) * 2 - 1),
        ) * 2;
      const pullY =
        Math.max(
          -1,
          Math.min(1, ((y - itemRect.top) / itemRect.height) * 2 - 1),
        ) * 1.5;

      highlight.style.transition = activeItem ? "" : "none";
      highlight.style.width = `${itemRect.width}px`;
      highlight.style.height = `${itemRect.height}px`;
      highlight.style.transform = `translate(${left + pullX}px, ${top + pullY}px)`;
      if (activeItem !== item) {
        activeItem?.removeAttribute("data-hover-target");
        item.setAttribute("data-hover-target", "");
        activeItem = item;
      }
      list.setAttribute("data-hover-active", "");
    };
    const move = (event: PointerEvent) => {
      const item =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".sidebar-project-row")
          : null;
      if (
        event.pointerType !== "mouse" ||
        !motion.matches ||
        !item ||
        item.closest(".sidebar-project-list") !== list
      ) {
        reset();
        return;
      }
      pending = { item, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const press = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") reset();
    };

    list.addEventListener("pointermove", move);
    list.addEventListener("pointerleave", reset);
    list.addEventListener("pointerdown", press, true);
    list.addEventListener("keydown", reset, true);
    scroller.addEventListener("scroll", reset);
    window.addEventListener("resize", reset);
    motion.addEventListener("change", reset);
    return () => {
      reset();
      list.removeEventListener("pointermove", move);
      list.removeEventListener("pointerleave", reset);
      list.removeEventListener("pointerdown", press, true);
      list.removeEventListener("keydown", reset, true);
      scroller.removeEventListener("scroll", reset);
      window.removeEventListener("resize", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);

  return (
    <span
      ref={highlightRef}
      aria-hidden="true"
      className="sidebar-project-highlight"
    />
  );
}
