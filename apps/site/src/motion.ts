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

export function useTaglineReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (
      !element ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const words = element.querySelectorAll<HTMLElement>("[data-word]");
    let frame = 0;
    let maximum = 0;
    element.classList.add("has-word-reveal");
    const observer = new IntersectionObserver(
      ([entry]) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          maximum = Math.max(
            maximum,
            Math.ceil(entry.intersectionRatio * words.length),
          );
          words.forEach((word, index) =>
            word.classList.toggle("is-lit", index < maximum),
          );
          if (maximum === words.length) observer.disconnect();
        });
      },
      {
        threshold: Array.from({ length: 21 }, (_, index) => index / 20),
        rootMargin: "0px 0px -12% 0px",
      },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root]);
}
