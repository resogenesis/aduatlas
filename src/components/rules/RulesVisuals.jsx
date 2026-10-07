// Pictures for the rules pages. They explain the SHAPE of a rule (what an
// attached ADU is, where setbacks are measured, what a height limit measures),
// never its numbers: a drawing shows a number only when the published rule
// carries one as a typed value (value_numeric with its unit), and otherwise
// says "see the rule". A picture must never state something ADUAtlas has not
// verified.
//
// Photos are Pexels stock (free license, self-hosted under /images/rules,
// credits in public/images/rules/credits.json). They are labelled as
// illustrative wherever they appear, so nobody reads one as the place itself.

const stroke = "stroke-current";

// ── ADU types ───────────────────────────────────────────────────────────────
const House = ({ x, y, w = 70, h = 46, label }) => (
  <g>
    <polygon points={`${x},${y + 18} ${x + w / 2},${y} ${x + w},${y + 18}`} className={`${stroke} fill-none`} strokeWidth="2" />
    <rect x={x + 6} y={y + 18} width={w - 12} height={h - 18} className={`${stroke} fill-none`} strokeWidth="2" />
    {label && (
      <text x={x + w / 2} y={y + h + 14} textAnchor="middle" className="fill-current" fontSize="10">
        {label}
      </text>
    )}
  </g>
);
const Adu = ({ x, y, w = 34, h = 26, filled = true }) => (
  <g>
    <polygon points={`${x},${y + 10} ${x + w / 2},${y} ${x + w},${y + 10}`} className="stroke-accent fill-none" strokeWidth="2" />
    <rect x={x + 3} y={y + 10} width={w - 6} height={h - 10} className={`stroke-accent ${filled ? "fill-accent/20" : "fill-none"}`} strokeWidth="2" />
  </g>
);

const TYPES = [
  {
    key: "attached",
    title: "Attached",
    text: "Built onto the house, with its own entrance.",
    draw: (
      <svg viewBox="0 0 140 90" className="w-full h-auto text-paper-dim" aria-hidden>
        <House x={22} y={20} />
        <rect x={86} y={46} width={30} height={20} className="stroke-accent fill-accent/20" strokeWidth="2" />
      </svg>
    ),
  },
  {
    key: "detached",
    title: "Detached",
    text: "A separate small building, usually in the back yard.",
    draw: (
      <svg viewBox="0 0 140 90" className="w-full h-auto text-paper-dim" aria-hidden>
        <House x={12} y={20} />
        <Adu x={96} y={36} />
      </svg>
    ),
  },
  {
    key: "conversion",
    title: "Garage or interior conversion",
    text: "Existing space, like a garage, turned into a home.",
    draw: (
      <svg viewBox="0 0 140 90" className="w-full h-auto text-paper-dim" aria-hidden>
        <House x={12} y={20} />
        <rect x={84} y={40} width={40} height={26} className="stroke-accent fill-accent/20" strokeWidth="2" />
        <line x1={84} y1={53} x2={124} y2={53} className="stroke-accent" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    ),
  },
  {
    key: "jadu",
    title: "Junior ADU",
    text: "A small unit inside the house itself, where the rules allow one.",
    draw: (
      <svg viewBox="0 0 140 90" className="w-full h-auto text-paper-dim" aria-hidden>
        <House x={35} y={20} />
        <rect x={47} y={44} width={22} height={18} className="stroke-accent fill-accent/20" strokeWidth="2" />
      </svg>
    ),
  },
];

export const AduTypes = ({ allowed = {} }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {TYPES.map((t) => (
      <figure key={t.key} data-adu-type={t.key} className="bg-canvas border border-stroke rounded-2xl p-4">
        {t.draw}
        <figcaption className="mt-2">
          <span className="block text-paper font-semibold text-sm">{t.title}</span>
          <span className="block text-paper-dim text-xs leading-relaxed mt-1">{t.text}</span>
          {allowed[t.key] && <span className="block text-paper text-xs mt-2">{allowed[t.key]}</span>}
        </figcaption>
      </figure>
    ))}
  </div>
);

// ── Lot plan ────────────────────────────────────────────────────────────────
const Dim = ({ x1, y1, x2, y2, label, lx, ly, anchor = "middle" }) => (
  <g>
    <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-accent" strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
    <text x={lx} y={ly} textAnchor={anchor} className="fill-current" fontSize="11">
      {label}
    </text>
  </g>
);

export const LotPlan = ({ side, rear, front }) => (
  <svg viewBox="0 0 380 320" className="w-full h-auto max-w-md text-paper" role="img" aria-label={`Lot plan: the house near the street, a detached ADU in the back yard. Side setback ${side}. Rear setback ${rear}. Front setback ${front}.`}>
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-accent" />
      </marker>
    </defs>
    {/* lot */}
    <rect x="40" y="30" width="240" height="230" className="stroke-current fill-none" strokeWidth="2" strokeDasharray="6 4" />
    <text x="60" y="22" className="fill-current" fontSize="11">Back of the lot</text>
    {/* street */}
    <rect x="20" y="282" width="280" height="26" className="fill-current opacity-10" />
    <text x="160" y="299" textAnchor="middle" className="fill-current" fontSize="11">Street</text>
    {/* house */}
    <rect x="100" y="170" width="120" height="58" className="stroke-current fill-none" strokeWidth="2" />
    <text x="160" y="203" textAnchor="middle" className="fill-current" fontSize="12">House</text>
    {/* ADU */}
    <rect x="200" y="70" width="56" height="56" className="stroke-accent fill-accent/20" strokeWidth="2" />
    <text x="228" y="102" textAnchor="middle" className="fill-current" fontSize="12">ADU</text>
    {/* setbacks */}
    <Dim x1={256} y1={98} x2={280} y2={98} label={`Side: ${side}`} lx={288} ly={102} anchor="start" />
    <Dim x1={228} y1={30} x2={228} y2={70} label={`Rear: ${rear}`} lx={222} ly={54} anchor="end" />
    <Dim x1={160} y1={228} x2={160} y2={260} label={`Front: ${front}`} lx={168} ly={250} anchor="start" />
  </svg>
);

// ── Height ──────────────────────────────────────────────────────────────────
export const HeightPicture = ({ height }) => (
  <svg viewBox="0 0 320 200" className="w-full h-auto max-w-md text-paper" role="img" aria-label={`A house and a smaller ADU beside it. ADU height limit: ${height}.`}>
    <defs>
      <marker id="arrow-h" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-accent" />
      </marker>
    </defs>
    <line x1="10" y1="180" x2="310" y2="180" className="stroke-current" strokeWidth="2" />
    {/* house */}
    <polygon points="30,90 95,40 160,90" className="stroke-current fill-none" strokeWidth="2" />
    <rect x="40" y="90" width="110" height="90" className="stroke-current fill-none" strokeWidth="2" />
    <text x="95" y="145" textAnchor="middle" className="fill-current" fontSize="12">House</text>
    {/* ADU */}
    <polygon points="200,120 240,95 280,120" className="stroke-accent fill-none" strokeWidth="2" />
    <rect x="207" y="120" width="66" height="60" className="stroke-accent fill-accent/20" strokeWidth="2" />
    <text x="240" y="156" textAnchor="middle" className="fill-current" fontSize="12">ADU</text>
    {/* height marker */}
    <line x1="292" y1="95" x2="292" y2="180" className="stroke-accent" strokeWidth="1.5" markerStart="url(#arrow-h)" markerEnd="url(#arrow-h)" />
    <text x="300" y="80" textAnchor="end" className="fill-current" fontSize="11">{`Height: ${height}`}</text>
  </svg>
);

// ── Photos ──────────────────────────────────────────────────────────────────
const PHOTOS = {
  "garden-cottage": { src: "/images/rules/garden-cottage.jpg", alt: "A small white cottage in a green garden, the kind of building an ADU can be", credit: "Photo: hugoteconecta / Pexels" },

  "desert-casita": { src: "/images/rules/desert-casita.jpg", alt: "A small adobe house in a dry desert landscape", credit: "Photo: Strange Happenings / Pexels" },
};

export const IllustrativePhoto = ({ name, className = "" }) => {
  const p = PHOTOS[name];
  if (!p) return null;
  return (
    <figure className={`overflow-hidden rounded-3xl border border-stroke ${className}`} data-illustrative-photo={name}>
      <img src={p.src} alt={p.alt} loading="lazy" decoding="async" className="w-full h-48 sm:h-64 object-cover" />
      <figcaption className="text-paper-dim text-[11px] px-4 py-2 bg-canvas">Illustrative photo, not of this place. {p.credit}</figcaption>
    </figure>
  );
};
