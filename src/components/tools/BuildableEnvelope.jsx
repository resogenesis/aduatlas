import { useMemo, useState } from "react";

// Buildable-envelope visualizer. Takes lot dimensions + setbacks + the existing
// home's footprint and draws a to-scale site plan: the lot, the setback lines,
// the resulting buildable area, and the largest ADU that fits in the rear yard.
//
// This is geometry from user-entered numbers — NOT a GIS/parcel lookup. The
// course teaches homeowners how to find their lot dimensions and local setbacks;
// this turns those numbers into the "largest possible placement" drawing that a
// full parcel-data pipeline would otherwise be needed to produce. Assumes a
// detached ADU sited in the rear yard behind the existing home.

const NUM_FIELDS = [
  { key: "lotWidth", label: "Lot width", unit: "ft" },
  { key: "lotDepth", label: "Lot depth", unit: "ft" },
  { key: "front", label: "Front setback", unit: "ft" },
  { key: "rear", label: "Rear setback", unit: "ft" },
  { key: "side", label: "Side setback (each)", unit: "ft" },
  { key: "houseDepth", label: "Existing home depth", unit: "ft" },
];

const DEFAULTS = {
  lotWidth: 50,
  lotDepth: 120,
  front: 20,
  rear: 4,
  side: 4,
  houseDepth: 45,
};

const fmt = (n) => Math.round(n).toLocaleString();

const BuildableEnvelope = () => {
  const [v, setV] = useState(DEFAULTS);
  const set = (k, val) => setV((s) => ({ ...s, [k]: Math.max(0, Number(val) || 0) }));

  const calc = useMemo(() => {
    const buildableW = Math.max(0, v.lotWidth - 2 * v.side);
    const buildableD = Math.max(0, v.lotDepth - v.front - v.rear);
    // Existing home occupies the front of the buildable band; the ADU takes the
    // rear yard behind it.
    const aduD = Math.max(0, buildableD - v.houseDepth);
    const aduFootprint = buildableW * aduD;
    const buildableArea = buildableW * buildableD;
    return { buildableW, buildableD, aduD, aduFootprint, buildableArea };
  }, [v]);

  // ── SVG layout (scaled so the longer lot dimension fits a fixed box) ──
  const PAD = 24;
  const MAX = 300;
  const scale = v.lotWidth > 0 && v.lotDepth > 0
    ? Math.min(MAX / v.lotWidth, MAX / v.lotDepth)
    : 1;
  const sx = (ft) => PAD + ft * scale;
  const sy = (ft) => PAD + ft * scale;
  const w = v.lotWidth * scale + PAD * 2;
  const h = v.lotDepth * scale + PAD * 2;

  const fits = calc.buildableW > 0 && calc.aduD > 0;

  return (
    <div className="bg-surface-1-solid rounded-3xl border border-stroke p-6 sm:p-8">
      <h3 className="font-display text-paper text-2xl mb-1">Buildable envelope</h3>
      <p className="text-paper-dim text-sm leading-relaxed mb-6">
        Enter your lot dimensions and setbacks — from your quiz, plat map, or Chapter 4 — to
        see the area where an ADU is allowed and the largest one that fits behind your home.
      </p>

      <div className="grid sm:grid-cols-[1fr_auto] gap-8 items-start">
        {/* Inputs + readout */}
        <div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {NUM_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-paper-dim text-[11px] font-medium tracking-[0.12em] uppercase mb-1.5">
                  {f.label}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={v[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-canvas border border-stroke text-paper text-sm focus:outline-none focus:border-accent transition"
                  />
                  <span className="text-paper-dim text-xs">{f.unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-paper-dim">Buildable area</span>
              <span className="text-paper tabular-nums">{fmt(calc.buildableArea)} sq ft</span>
            </div>
            <div className="flex justify-between">
              <span className="text-paper-dim">Rear yard depth for ADU</span>
              <span className="text-paper tabular-nums">{fmt(calc.aduD)} ft</span>
            </div>
            <div className="flex justify-between border-t border-stroke pt-2 mt-2">
              <span className="text-paper font-medium">Largest ADU footprint</span>
              <span className="font-display text-accent tabular-nums">
                {fmt(calc.aduFootprint)} sq ft
              </span>
            </div>
          </div>

          {!fits && (
            <p className="mt-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              With these numbers there's no rear-yard room left for a detached ADU. Try a smaller
              home-depth value, a conversion, or check whether your setbacks qualify for a
              reduction.
            </p>
          )}
        </div>

        {/* Site plan */}
        <div className="justify-self-center">
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="max-w-full h-auto rounded-xl bg-canvas border border-stroke"
            role="img"
            aria-label="Site plan showing lot, setbacks, existing home, and buildable ADU area"
          >
            {/* Lot */}
            <rect
              x={sx(0)} y={sy(0)}
              width={v.lotWidth * scale} height={v.lotDepth * scale}
              fill="none" stroke="currentColor" strokeWidth="1.5"
              className="text-stroke"
            />
            {/* Buildable band (inside setbacks) */}
            {calc.buildableW > 0 && calc.buildableD > 0 && (
              <rect
                x={sx(v.side)} y={sy(v.front)}
                width={calc.buildableW * scale} height={calc.buildableD * scale}
                fill="currentColor" fillOpacity="0.08"
                stroke="currentColor" strokeWidth="1" strokeDasharray="4 3"
                className="text-accent"
              />
            )}
            {/* Existing home (front of buildable band) */}
            {calc.buildableW > 0 && v.houseDepth > 0 && (
              <rect
                x={sx(v.side)} y={sy(v.front)}
                width={calc.buildableW * scale}
                height={Math.min(v.houseDepth, calc.buildableD) * scale}
                fill="currentColor" fillOpacity="0.25"
                className="text-paper-dim"
              />
            )}
            {/* Largest ADU (rear yard) */}
            {fits && (
              <rect
                x={sx(v.side)} y={sy(v.front + v.houseDepth)}
                width={calc.buildableW * scale} height={calc.aduD * scale}
                fill="currentColor" fillOpacity="0.85"
                className="text-accent"
              />
            )}
          </svg>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-3 text-[11px] text-paper-dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-paper-dim/40" /> Existing home
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-accent" /> ADU area
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border border-dashed border-accent" /> Setback line
            </span>
          </div>
        </div>
      </div>

      <p className="text-paper-dim text-[11px] leading-relaxed mt-6">
        Planning estimate from your inputs, not a survey or GIS record. Assumes a detached ADU in
        the rear yard. Confirm setbacks, lot-coverage limits, and max unit size with your
        jurisdiction before design.
      </p>
    </div>
  );
};

export default BuildableEnvelope;
