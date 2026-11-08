import { useEffect, type RefObject } from "react";

export function usePageReveals(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const sections =
      root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -32px 0px", threshold: 0.08 },
    );
    sections?.forEach((section) => {
      // Content remains visible when scripting or the observer is unavailable.
      if (section.getBoundingClientRect().top > window.innerHeight)
        section.classList.add("will-reveal");
      observer.observe(section);
    });
    return () => observer.disconnect();
  }, [root]);
}
