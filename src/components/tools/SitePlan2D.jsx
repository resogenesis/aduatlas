// Modern 2D site plan — the "feasibility drawing," rendered from the shared
// lotModel. Landscape orientation (lot DEPTH horizontal, front yard on the
// left) like a real lot plan, but styled for the dark app theme instead of a
// 2005 permit sheet: red property boundary, dashed setbacks, a light existing
// home, the lime proposed ADU, floating dimension labels, a north arrow, and a
// scale bar.
//
// Reads geometry in FEET from lotModel (origin front-left, x=width, y=depth)
// and maps it to SVG with depth on the horizontal axis.

const C = {
  lot: "#E8776B", // property boundary — red/coral, reads as "boundary"
  band: "#C6F24E", // buildable area (brand lime, low opacity)
  home: "#CBD5C0", // existing home mass
  adu: "#C6F24E", // proposed ADU
  dim: "#C8C2B0", // dimension text (text-paper-dim)
  faint: "#5A5E52", // dimension leader lines
  paper: "#F5F1E8",
};

const PAD = 44; // room for dimension labels around the lot
const MAX_W = 560; // drawing box, px (before responsive scaling)
const MAX_H = 300;

const ftLabel = (n) => `${Math.round(n)} ft`;

const SitePlan2D = ({ model, showSetbacks = true, showDimensions = true }) => {
  const { lot, buildable, home, adu, setbacks } = model;
  const lotW = lot.w;
  const lotD = lot.d;
  if (lotW <= 0 || lotD <= 0) return null;

  // Landscape: horizontal = depth, vertical = width.
  const scale = Math.min(MAX_W / lotD, MAX_H / lotW);
  const fx = (depthFt) => PAD + depthFt * scale; // front (y=0) at left
  const fy = (widthFt) => PAD + widthFt * scale;
  const svgW = lotD * scale + PAD * 2;
  const svgH = lotW * scale + PAD * 2;

  // Map a model rect {x(width), y(depth), w(width), d(depth)} to an SVG rect.
  const box = (r) => ({
    x: fx(r.y),
    y: fy(r.x),
    width: r.d * scale,
    height: r.w * scale,
  });

  const lotBox = box(lot);
  const bandBox = buildable && box(buildable);
  const homeBox = home && box(home);
  const aduBox = adu && box(adu);

  // Scale bar: pick a round footage that renders 40–120px wide.
  const targetPx = 90;
  const rawFt = targetPx / scale;
  const niceFt = [5, 10, 20, 25, 50, 100].reduce((a, b) =>
    Math.abs(b - rawFt) < Math.abs(a - rawFt) ? b : a
  );
  const barPx = niceFt * scale;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full h-auto rounded-2xl bg-canvas border border-stroke"
      role="img"
      aria-label="Site plan: lot boundary, setbacks, existing home, and proposed ADU"
    >
      {/* Buildable band */}
      {showSetbacks && bandBox && (
        <rect {...bandBox} fill={C.band} fillOpacity="0.10" />
      )}

      {/* Existing home */}
      {homeBox && (
        <g>
          <rect {...homeBox} fill={C.home} fillOpacity="0.28" stroke={C.home} strokeWidth="1" strokeOpacity="0.5" rx="2" />
          <text
            x={homeBox.x + homeBox.width / 2}
            y={homeBox.y + homeBox.height / 2}
            fill={C.paper}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Existing home
          </text>
        </g>
      )}

      {/* Proposed ADU */}
      {aduBox && (
        <g>
          <rect {...aduBox} fill={C.adu} fillOpacity="0.85" rx="2" />
          <text
            x={aduBox.x + aduBox.width / 2}
            y={aduBox.y + aduBox.height / 2 - 6}
            fill="#0E0F0C"
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            ADU
          </text>
          {adu.d >= 8 && (
            <text
              x={aduBox.x + aduBox.width / 2}
              y={aduBox.y + aduBox.height / 2 + 8}
              fill="#0E0F0C"
              fontSize="9"
              textAnchor="middle"
              dominantBaseline="middle"
              opacity="0.75"
            >
              {Math.round(adu.w)}′ × {Math.round(adu.d)}′
            </text>
          )}
        </g>
      )}

      {/* Setback dimension lines (dashed) around the buildable band */}
      {showSetbacks && bandBox && (
        <rect {...bandBox} fill="none" stroke={C.band} strokeWidth="1" strokeDasharray="5 4" strokeOpacity="0.65" />
      )}

      {/* Property boundary — drawn last so it sits on top */}
      <rect {...lotBox} fill="none" stroke={C.lot} strokeWidth="2" rx="1" />

      {/* Dimension labels */}
      {showDimensions && (
        <g fontSize="10.5" fill={C.dim} fontWeight="500">
          {/* Lot depth — below the lot */}
          <line x1={lotBox.x} y1={svgH - 16} x2={lotBox.x + lotBox.width} y2={svgH - 16} stroke={C.faint} strokeWidth="1" />
          <text x={lotBox.x + lotBox.width / 2} y={svgH - 20} textAnchor="middle">{ftLabel(lotD)} deep</text>
          {/* Lot width — left of the lot, rotated */}
          <line x1={20} y1={lotBox.y} x2={20} y2={lotBox.y + lotBox.height} stroke={C.faint} strokeWidth="1" />
          <text x={14} y={lotBox.y + lotBox.height / 2} textAnchor="middle" transform={`rotate(-90 14 ${lotBox.y + lotBox.height / 2})`}>{ftLabel(lotW)} wide</text>
          {/* Front / rear yard labels */}
          <text x={lotBox.x + 4} y={16} fill={C.faint} fontSize="9.5">FRONT ({ftLabel(setbacks.front)})</text>
          <text x={lotBox.x + lotBox.width - 4} y={16} textAnchor="end" fill={C.faint} fontSize="9.5">REAR ({ftLabel(setbacks.rear)})</text>
        </g>
      )}

      {/* North arrow (top-right) — north points "up" = toward the width axis top.
          Lots here front the street on the -y (left/front) edge, so we mark
          the drawing's orientation rather than true north. */}
      <g transform={`translate(${svgW - 26}, 30)`} opacity="0.8">
        <line x1="0" y1="10" x2="0" y2="-10" stroke={C.paper} strokeWidth="1.5" />
        <path d="M0,-12 L3.5,-5 L-3.5,-5 Z" fill={C.paper} />
        <text x="0" y="22" fill={C.dim} fontSize="9" textAnchor="middle" fontWeight="600">N</text>
      </g>

      {/* Scale bar (bottom-right) */}
      <g transform={`translate(${svgW - PAD - barPx}, ${svgH - 14})`}>
        <line x1="0" y1="0" x2={barPx} y2="0" stroke={C.dim} strokeWidth="2" />
        <line x1="0" y1="-3" x2="0" y2="3" stroke={C.dim} strokeWidth="2" />
        <line x1={barPx} y1="-3" x2={barPx} y2="3" stroke={C.dim} strokeWidth="2" />
        <text x={barPx / 2} y="-5" fill={C.dim} fontSize="9" textAnchor="middle">{niceFt} ft</text>
      </g>
    </svg>
  );
};

export default SitePlan2D;
