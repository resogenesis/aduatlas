// ADUAtlas lockup: the production A-mark stands in for the "A" of ADU,
// followed by "DU" in ADU green and "Atlas" in Atlas blue. The mark's
// outline follows currentColor by default so it can sit on light or dark
// surfaces; pass markClassName to force a color.
const GREEN = "#2E5E44";
const BLUE = "#2B5C8A";
const GOLD = "#B8892E";

const Logomark = ({ className = "h-8", markOnly = false, textClassName = "" }) => (
  <span className={`inline-flex items-center ${className}`} style={{ color: GREEN }}>
    <svg viewBox="0 0 28 28" fill="none" className="h-full w-auto shrink-0" aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 19 L14 9 L19 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="6" r="2.5" fill={GOLD} />
    </svg>
    {!markOnly && (
      <span className={`font-primary font-extrabold tracking-[-0.02em] leading-none text-[1.3rem] ml-[0.15em] ${textClassName}`}>
        <span style={{ color: GREEN }}>DU</span>
        <span style={{ color: BLUE }} className="font-bold ml-[0.28em]">
          Atlas
        </span>
      </span>
    )}
  </span>
);

export default Logomark;
