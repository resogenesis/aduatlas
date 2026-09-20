import { useEffect, useState } from "react";

// Types each sample string character by character, holds, deletes, moves on.
// Returns the current text. Respects prefers-reduced-motion by returning the
// first sample statically.
const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export const useTypewriter = (samples, { typeMs = 42, deleteMs = 22, holdMs = 1700 } = {}) => {
  // Reduced motion: show the first sample statically from the first render.
  const [text, setText] = useState(() => (prefersReducedMotion() ? samples[0] || "" : ""));

  useEffect(() => {
    if (typeof window === "undefined" || !samples.length || prefersReducedMotion()) return undefined;
    let sample = 0;
    let pos = 0;
    let deleting = false;
    let timer;
    const tick = () => {
      const current = samples[sample];
      if (!deleting) {
        pos += 1;
        setText(current.slice(0, pos));
        if (pos >= current.length) {
          deleting = true;
          timer = setTimeout(tick, holdMs);
          return;
        }
        timer = setTimeout(tick, typeMs);
      } else {
        pos -= 1;
        setText(current.slice(0, pos));
        if (pos <= 0) {
          deleting = false;
          sample = (sample + 1) % samples.length;
          timer = setTimeout(tick, 350);
          return;
        }
        timer = setTimeout(tick, deleteMs);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [samples, typeMs, deleteMs, holdMs]);

  return text;
};
