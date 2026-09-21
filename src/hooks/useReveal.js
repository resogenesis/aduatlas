import { useEffect, useRef } from "react";

// Adds data-reveal="on" when the element enters the viewport.
// Pair with the [data-reveal] CSS rule for slide-up reveals.
export const useReveal = (delay = 0) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    el.setAttribute("data-reveal", "off");
    if (delay) el.style.transitionDelay = `${delay}ms`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-reveal", "on");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    // Safety net for tabs that never report intersection (background/print).
    const timer = window.setTimeout(() => el.setAttribute("data-reveal", "on"), 1500);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [delay]);
  return ref;
};
