// Stylized site plan in the brand palette: lot line, dashed setbacks, the
// existing home, an ADU footprint in the rear yard, a gold address pin and a
// scale bar. Decorative, code-owned, no data behind it.
const SitePlanArt = ({ className = "" }) => (
  <svg viewBox="0 0 520 420" className={`w-full h-auto ${className}`} role="img" aria-label="Illustration of a lot with the main house, setback lines, and a proposed ADU footprint">
    <defs>
      <pattern id="spa-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.08" />
      </pattern>
    </defs>
    <rect width="520" height="420" rx="24" fill="var(--color-canvas)" />
    <rect width="520" height="420" rx="24" fill="url(#spa-grid)" className="text-paper" />
    <rect x="0" y="360" width="520" height="60" fill="var(--color-surface-2)" />
    <line x1="0" y1="372" x2="520" y2="372" stroke="var(--color-stroke)" />
    <text x="24" y="398" fontSize="10" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif">Oak Street</text>
    <rect x="90" y="40" width="340" height="320" fill="var(--color-surface-1-solid)" stroke="var(--color-paper)" strokeWidth="1.5" />
    <rect x="114" y="64" width="292" height="272" fill="none" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="5 5" />
    <text x="118" y="58" fontSize="9" fill="var(--color-accent)" fontFamily="Inter, sans-serif">4 ft setback</text>
    <rect x="356" y="200" width="50" height="160" fill="var(--color-surface-2)" />
    <rect x="150" y="190" width="170" height="130" rx="2" fill="var(--color-canvas)" stroke="var(--color-paper)" strokeWidth="1.5" />
    <line x1="150" y1="190" x2="320" y2="320" stroke="var(--color-stroke)" />
    <line x1="320" y1="190" x2="150" y2="320" stroke="var(--color-stroke)" />
    <text x="235" y="262" textAnchor="middle" fontSize="10" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif">Existing home</text>
    <rect x="270" y="80" width="120" height="84" rx="2" fill="var(--color-accent)" />
    <text x="330" y="118" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">ADU</text>
    <text x="330" y="134" textAnchor="middle" fontSize="9" fill="#fff" fillOpacity="0.8" fontFamily="Inter, sans-serif">20 × 30 ft</text>
    <line x1="270" y1="176" x2="390" y2="176" stroke="var(--color-paper-dim)" strokeWidth="1" />
    <line x1="270" y1="171" x2="270" y2="181" stroke="var(--color-paper-dim)" />
    <line x1="390" y1="171" x2="390" y2="181" stroke="var(--color-paper-dim)" />
    <circle cx="140" cy="100" r="22" fill="var(--color-accent)" fillOpacity="0.18" />
    <circle cx="140" cy="100" r="6" fill="var(--color-accent)" fillOpacity="0.5" />
    <circle cx="200" cy="130" r="16" fill="var(--color-accent)" fillOpacity="0.14" />
    <path d="M235 344c-8-9-14-16-14-24a14 14 0 0 1 28 0c0 8-6 15-14 24z" fill="var(--color-gold)" />
    <circle cx="235" cy="320" r="5" fill="#fff" />
    <line x1="24" y1="340" x2="74" y2="340" stroke="var(--color-paper)" strokeWidth="2" />
    <line x1="24" y1="335" x2="24" y2="345" stroke="var(--color-paper)" />
    <line x1="74" y1="335" x2="74" y2="345" stroke="var(--color-paper)" />
    <text x="24" y="330" fontSize="9" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif">10 ft</text>
  </svg>
);

export default SitePlanArt;
