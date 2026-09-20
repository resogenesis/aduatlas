import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { PILLARS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.pillars.eyebrow",
  "home.pillars.heading",
  "home.pillars.body",
  ...Array.from({ length: PILLARS_COUNT }, (_, i) => [`home.pillars.item.${i}.title`, `home.pillars.item.${i}.desc`]).flat(),
];

// A stylized site plan in the brand palette: lot line, dashed setbacks, the
// existing home, an ADU footprint in the rear yard, a gold address pin and a
// scale bar. Decorative, code-owned, no data behind it.
const SitePlanArt = () => (
  <svg viewBox="0 0 520 420" className="w-full h-auto" role="img" aria-label="Illustration of a lot with the main house, setback lines, and a proposed ADU footprint">
    <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.08" />
      </pattern>
    </defs>
    <rect width="520" height="420" rx="24" fill="var(--color-canvas)" />
    <rect width="520" height="420" rx="24" fill="url(#grid)" className="text-paper" />

    {/* street + sidewalk */}
    <rect x="0" y="360" width="520" height="60" fill="var(--color-surface-2)" />
    <line x1="0" y1="372" x2="520" y2="372" stroke="var(--color-stroke)" />
    <text x="24" y="398" fontSize="10" letterSpacing="2" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif">OAK STREET</text>

    {/* lot */}
    <rect x="90" y="40" width="340" height="320" fill="var(--color-surface-1-solid)" stroke="var(--color-paper)" strokeWidth="1.5" />
    {/* setback */}
    <rect x="114" y="64" width="292" height="272" fill="none" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="5 5" />
    <text x="118" y="58" fontSize="9" letterSpacing="1.5" fill="var(--color-accent)" fontFamily="Inter, sans-serif">4 FT SETBACK</text>

    {/* driveway */}
    <rect x="356" y="200" width="50" height="160" fill="var(--color-surface-2)" />

    {/* existing house */}
    <rect x="150" y="190" width="170" height="130" rx="2" fill="var(--color-canvas)" stroke="var(--color-paper)" strokeWidth="1.5" />
    <line x1="150" y1="190" x2="320" y2="320" stroke="var(--color-stroke)" />
    <line x1="320" y1="190" x2="150" y2="320" stroke="var(--color-stroke)" />
    <text x="235" y="262" textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif">EXISTING HOME</text>

    {/* ADU footprint */}
    <rect x="270" y="80" width="120" height="84" rx="2" fill="var(--color-accent)" />
    <text x="330" y="118" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#fff" fontFamily="Inter, sans-serif">ADU</text>
    <text x="330" y="134" textAnchor="middle" fontSize="9" letterSpacing="1" fill="#fff" fillOpacity="0.8" fontFamily="Inter, sans-serif">20 × 30 FT</text>

    {/* dimension lines */}
    <line x1="270" y1="176" x2="390" y2="176" stroke="var(--color-paper-dim)" strokeWidth="1" />
    <line x1="270" y1="171" x2="270" y2="181" stroke="var(--color-paper-dim)" />
    <line x1="390" y1="171" x2="390" y2="181" stroke="var(--color-paper-dim)" />
    <line x1="400" y1="80" x2="400" y2="164" stroke="var(--color-paper-dim)" strokeWidth="1" />
    <line x1="395" y1="80" x2="405" y2="80" stroke="var(--color-paper-dim)" />
    <line x1="395" y1="164" x2="405" y2="164" stroke="var(--color-paper-dim)" />

    {/* trees */}
    <circle cx="140" cy="100" r="22" fill="var(--color-accent)" fillOpacity="0.18" />
    <circle cx="140" cy="100" r="6" fill="var(--color-accent)" fillOpacity="0.5" />
    <circle cx="200" cy="130" r="16" fill="var(--color-accent)" fillOpacity="0.14" />

    {/* address pin */}
    <path d="M235 344c-8-9-14-16-14-24a14 14 0 0 1 28 0c0 8-6 15-14 24z" fill="var(--color-gold)" />
    <circle cx="235" cy="320" r="5" fill="#fff" />

    {/* scale bar */}
    <line x1="24" y1="340" x2="74" y2="340" stroke="var(--color-paper)" strokeWidth="2" />
    <line x1="24" y1="335" x2="24" y2="345" stroke="var(--color-paper)" />
    <line x1="74" y1="335" x2="74" y2="345" stroke="var(--color-paper)" />
    <text x="24" y="330" fontSize="9" letterSpacing="1.5" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif">10 FT</text>
    <text x="430" y="52" fontSize="9" letterSpacing="1.5" fill="var(--color-paper-dim)" fontFamily="Inter, sans-serif" textAnchor="end">N ↑</text>
  </svg>
);

const Step = ({ i, last }) => {
  const ref = useReveal(i * 90);
  const title = useContentText(`home.pillars.item.${i}.title`).replace("\n", " ");
  const desc = useContentText(`home.pillars.item.${i}.desc`);
  return (
    <li ref={ref} className="relative pl-14 pb-9 last:pb-0">
      {!last && <span className="absolute left-[1.15rem] top-10 bottom-0 w-px bg-stroke" aria-hidden />}
      <span className="absolute left-0 top-0 w-[2.3rem] h-[2.3rem] rounded-full bg-accent text-accent-fg text-xs font-bold inline-flex items-center justify-center">
        {String(i + 1).padStart(2, "0")}
      </span>
      <h3 className="font-semibold text-paper text-lg leading-tight pt-1.5 mb-1.5">{title}</h3>
      <p className="text-paper-dim text-sm leading-relaxed max-w-sm">{desc}</p>
    </li>
  );
};

const Pillars = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.pillars.eyebrow");
  const heading = useContentText("home.pillars.heading").replace("\n", " ");
  const body = useContentText("home.pillars.body");
  return (
    <AdminEditableSection keys={EDIT_KEYS} label="How it works">
      <section className="bg-canvas">
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-6 order-2 lg:order-1 rounded-[1.75rem] border border-stroke shadow-[0_30px_60px_-40px_rgba(23,32,27,0.35)] overflow-hidden">
            <SitePlanArt />
          </div>
          <div className="lg:col-span-6 order-1 lg:order-2">
            <div ref={ref} className="mb-10">
              <p className="text-accent text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-4">{eyebrow}</p>
              <h2 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-3xl sm:text-4xl lg:text-[2.6rem] leading-[1.05] mb-4">{heading}</h2>
              <p className="text-paper-dim text-base leading-relaxed max-w-md">{body}</p>
            </div>
            <ol>
              {Array.from({ length: PILLARS_COUNT }, (_, i) => (
                <Step key={i} i={i} last={i === PILLARS_COUNT - 1} />
              ))}
            </ol>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Pillars;
