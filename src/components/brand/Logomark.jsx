// Temporary 2026-redesign wordmark. Replace with final asset when ready.
const Logomark = ({ className = "h-7", textClassName = "" }) => (
  <span className={`inline-flex items-center gap-1.5 ${className}`}>
    <svg viewBox="0 0 28 28" fill="none" className="h-full w-auto" aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 19 L14 9 L19 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="6" r="2.5" fill="#C6F24E" />
    </svg>
    <span className={`font-display text-[1.05rem] tracking-tight ${textClassName}`}>
      atlas<span style={{ color: "#C6F24E" }}>.</span>
    </span>
  </span>
);

export default Logomark;
