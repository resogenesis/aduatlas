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

  // Address → parcel lookup (api/property-lookup, RentCast). Public records give
  // lot AREA and building AREA, not dimensions — so derive plausible width/depth
  // from area (residential lots run ~1:2 width:depth) and let the user refine.
  const [address, setAddress] = useState("");
  const [look, setLook] = useState({ status: "idle", msg: "", tone: "text-paper-dim" });

  const applyLookup = (d) => {
    const area = Number(d.lotSize) || 0;
    const bld = Number(d.buildingSize) || 0;
    setV((s) => {
      const width = area > 0 ? Math.max(20, Math.round(Math.sqrt(area / 2))) : s.lotWidth;
      const depth = area > 0 ? Math.max(20, Math.round(area / width)) : s.lotDepth;
      const bw = Math.max(1, width - 2 * s.side);
      const houseDepth = bld > 0
        ? Math.min(Math.max(0, depth - s.front - s.rear), Math.max(10, Math.round(bld / bw)))
        : s.houseDepth;
      return { ...s, lotWidth: width, lotDepth: depth, houseDepth };
    });
  };

  const lookup = async () => {
    const a = address.trim();
    if (!a) return;
    setLook({ status: "loading", msg: "", tone: "text-paper-dim" });
    try {
      const r = await fetch(`/api/property-lookup?address=${encodeURIComponent(a)}`);
      if (r.status === 501) {
        setLook({ status: "idle", msg: "Address lookup isn't enabled yet — enter your dimensions below.", tone: "text-amber-300" });
        return;
      }
      if (r.status === 404) {
        setLook({ status: "idle", msg: "No public record found for that address. Enter dimensions manually.", tone: "text-amber-300" });
        return;
      }
      if (!r.ok) {
        setLook({ status: "idle", msg: "Lookup failed. Enter your dimensions manually.", tone: "text-red-300" });
        return;
      }
      const d = await r.json();
      applyLookup(d);
      const bits = [];
      if (d.lotSize) bits.push(`lot ${Number(d.lotSize).toLocaleString()} sq ft`);
      if (d.buildingSize) bits.push(`home ${Number(d.buildingSize).toLocaleString()} sq ft`);
      setLook({
        status: "idle",
        msg: `Filled from public records${bits.length ? ` (${bits.join(" · ")})` : ""}. Dimensions are estimated from area — adjust to your plat map.`,
        tone: "text-accent",
      });
    } catch {
      setLook({ status: "idle", msg: "Lookup failed. Enter your dimensions manually.", tone: "text-red-300" });
    }
  };

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

      {/* Address auto-fill */}
      <div className="mb-6">
        <label className="block text-paper-dim text-[11px] font-medium tracking-[0.12em] uppercase mb-1.5">
          Auto-fill from address
        </label>
        <div className="flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="123 Main St, City, ST 90210"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
          />
          <button
            type="button"
            onClick={lookup}
            disabled={look.status === "loading" || !address.trim()}
            className="shrink-0 px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-semibold hover:bg-paper transition-colors disabled:opacity-50"
          >
            {look.status === "loading" ? "Looking…" : "Look up"}
          </button>
        </div>
        {look.msg && <p className={`mt-2 text-xs leading-relaxed ${look.tone}`}>{look.msg}</p>}
      </div>

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
