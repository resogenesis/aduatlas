// ADUAtlas logomark: the production mark (outlined rounded square, "A",
// corner dot, "atlas." wordmark) recolored for the Phase 1 light system.
// Outline, A and wordmark follow currentColor so the same component works on
// light and dark surfaces; the dot is gold and the period takes the theme accent
// (forest on the public site, lime in the dark portal).
const DOT = "#B8892E"; // gold

const Logomark = ({ className = "h-7", textClassName = "", markOnly = false }) => (
  <span className={`inline-flex items-center gap-1.5 ${className}`}>
    <svg viewBox="0 0 28 28" fill="none" className="h-full w-auto shrink-0" aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 19 L14 9 L19 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="6" r="2.5" fill={DOT} />
    </svg>
    {!markOnly && (
      <span className={`font-display text-[1.15rem] tracking-tight ${textClassName}`}>
        atlas<span className="text-accent">.</span>
      </span>
    )}
  </span>
);

export default Logomark;
