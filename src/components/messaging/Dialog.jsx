import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// A modal dialog rendered into document.body, outside every page wrapper.
//
// WHY A PORTAL (R3-15). RootLayout's <main> runs the page-enter animation with
// fill-mode both, so it keeps a transform after the animation ends, and a
// transformed ancestor becomes the containing block for position: fixed. A
// "fixed inset-0" overlay rendered inside <main> was therefore sized to <main>
// (nearly 1,900px tall on a phone), and the form sat below the first screen: a
// homeowner tapped "Request introduction", the page blurred and nothing
// appeared. Rendered at the body, fixed means the viewport again, whatever any
// layout does with transforms later.
//
// The portal leaves the layout that sets the light theme tokens, so the wrapper
// carries theme-light itself. That class also paints the canvas background, and
// an unlayered class rule beats a Tailwind utility, so the transparent
// background is set inline.
//
// The panel never grows taller than the screen: on a short phone it scrolls
// inside itself instead of pushing its buttons off the bottom.
const Dialog = ({ open, onClose, labelledBy, children }) => {
  const panelRef = useRef(null);
  // The latest onClose, so a parent passing a fresh arrow on every render does
  // not re-run the open effect (which would move focus on every keystroke).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previous = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    // Focus the first field so a keyboard or screen reader user lands inside.
    const first = panelRef.current?.querySelector("textarea, input, select, button");
    first?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="theme-light fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "transparent" }}>
      <div className="absolute inset-0 bg-paper/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto bg-canvas border border-stroke rounded-3xl p-6 sm:p-7"
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default Dialog;
