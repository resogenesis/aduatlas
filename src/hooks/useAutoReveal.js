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
    // Skip sections that manage their own reveal (an ancestor or a child
    // carries data-reveal). Check the PARENT, not the element: on a re-run the
    // section itself already carries the attribute we set last time.
    const sections = Array.from(root.querySelectorAll("section")).filter(
      (el) => !(el.parentElement && el.parentElement.closest("[data-reveal]")) && !el.querySelector("[data-reveal]")
    );
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
    // Safety net: background tabs, print, and some embedded views never fire
    // intersection callbacks. Reveal everything after a moment regardless, and
    // whenever the tab becomes visible.
    const revealAll = () => sections.forEach((el) => el.setAttribute("data-reveal", "on"));
    const timer = window.setTimeout(revealAll, 1200);
    const onVisible = () => {
      if (document.visibilityState === "visible") revealAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      // Leave the DOM clean for the next run (route change or dev re-mount).
      sections.forEach((el) => {
        el.removeAttribute("data-reveal");
        el.style.removeProperty("--reveal-delay");
      });
    };
  }, [ref, pathname]);
};
