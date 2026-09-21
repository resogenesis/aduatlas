import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Scroll-reveal for every top-level <section> under the given container,
// with a small stagger for sibling sections that enter together. Sections
// that already manage their own reveal (they contain [data-reveal] children)
// are left alone. Re-runs on every route change.
export const useAutoReveal = (ref) => {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const sections = Array.from(root.querySelectorAll("section")).filter((el) => !el.closest("[data-reveal]") && !el.querySelector("[data-reveal]"));
    if (!sections.length) return undefined;
    sections.forEach((el, i) => {
      el.setAttribute("data-reveal", "off");
      el.style.setProperty("--reveal-delay", `${Math.min(i, 3) * 60}ms`);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute("data-reveal", "on");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref, pathname]);
};
