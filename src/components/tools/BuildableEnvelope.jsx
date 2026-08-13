import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { buildLotModel, DEFAULT_LOT_INPUT } from "./lotModel";
import { loadPacket } from "../../stores/courseStore";
import { loadLot, saveLot } from "../../stores/worksheetStore";
import SitePlan2D from "./SitePlan2D";
import FeasibilityCards from "./FeasibilityCards";

// Heavy views are code-split: the 3D model (Canvas + three) and the satellite
// map (MapLibre) each stream in only when their tab is active.
const SiteModel3D = lazy(() => import("./SiteModel3D"));
const LotMap = lazy(() => import("./LotMap"));

// Buildable-envelope / feasibility visualizer.
//
// Flow mirrors how homeowners think: find the property (address → coords), see
// what fits (site plan + 3D model), then the real-world context (satellite).
// All three views + the stat cards read from ONE shared lotModel so they never
// disagree. The 3D "architectural model" is the default premium view; the 2D
// plan is the print/measurement view; satellite is an optional layer.
//
// HONEST SCOPE: geometry comes from user-entered numbers (or dimensions we
// ESTIMATED from public-record lot AREA) — not a survey or the zoning code.
// Anything that needs municipal data (FAR/height limits, legal setbacks,
// by-right size, utilities) is shown as "verify your zone," never as a verdict.

const NUM_FIELDS = [
  { key: "lotWidth", label: "Lot width", unit: "ft" },
  { key: "lotDepth", label: "Lot depth", unit: "ft" },
  { key: "front", label: "Front setback", unit: "ft" },
  { key: "rear", label: "Rear setback", unit: "ft" },
  { key: "side", label: "Side setback (each)", unit: "ft" },
  { key: "houseDepth", label: "Existing home depth", unit: "ft" },
];

const VIEWS = [
  { key: "3d", label: "3D model" },
  { key: "plan", label: "Site plan" },
  { key: "map", label: "Satellite" },
];

const BuildableEnvelope = () => {
  // Hydrate from the saved lot state (builder_packet.lot) so the geometry the
  // homeowner tuned here also powers their Property Report.
  const saved = useMemo(() => loadLot(), []);
  const [v, setV] = useState(saved?.input || DEFAULT_LOT_INPUT);
  // True while the current dimensions came from an area-derived lookup rather
  // than being entered/confirmed by the homeowner. Any manual edit clears it.
  const [dimsEstimated, setDimsEstimated] = useState(Boolean(saved?.dimsEstimated));
  const set = (k, val) => {
    setV((s) => ({ ...s, [k]: Math.max(0, Number(val) || 0) }));
    setDimsEstimated(false);
  };

  const [address, setAddress] = useState(() => saved?.address || loadPacket().address || "");
  const [look, setLook] = useState({ status: "idle", msg: "", tone: "text-paper-dim" });
  const [coords, setCoords] = useState(saved?.coords || null);
  // Snapshot of the last successful public-records lookup, kept for the report.
  const [lookupData, setLookupData] = useState(saved?.lookup || null);

  // Debounced persistence of the whole lot state.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(
      () => saveLot({ input: v, dimsEstimated, coords, address, lookup: lookupData }),
      800
    );
    return () => clearTimeout(t);
  }, [v, dimsEstimated, coords, address, lookupData]);

  const [view, setView] = useState("3d");
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showShadows, setShowShadows] = useState(true);

  const model = useMemo(() => buildLotModel(v, { dimsEstimated }), [v, dimsEstimated]);

  const applyLookup = (d) => {
    const area = Number(d.lotSize) || 0;
    const bld = Number(d.buildingSize) || 0;
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    setLookupData({ ...d, fetchedAt: new Date().toISOString() });
    setCoords(Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { lat, lng } : null);
    setDimsEstimated(area > 0);
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

  const activeView = view === "map" && !coords ? "3d" : view;

  return (
    <div className="bg-surface-1-solid rounded-3xl border border-stroke p-6 sm:p-8">
      <h3 className="font-display text-paper text-2xl mb-1">Feasibility model</h3>
      <p className="text-paper-dim text-sm leading-relaxed mb-6">
        Enter your lot dimensions and setbacks — or look up an address — to see the buildable area
        and the largest ADU that fits behind your home, as a 3D model, a printable site plan, or on
        the real aerial.
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

      {/* Dimension inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
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

      {/* Visualizer + cards */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <div>
          {/* View tabs */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-stroke bg-canvas p-0.5">
              {VIEWS.map((tab) => {
                const disabled = tab.key === "map" && !coords;
                const on = activeView === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setView(tab.key)}
                    title={disabled ? "Look up an address to enable satellite" : undefined}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      on
                        ? "bg-accent text-accent-fg"
                        : disabled
                        ? "text-paper-dim/40 cursor-not-allowed"
                        : "text-paper-dim hover:text-paper"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Contextual layer toggles (3D + plan) */}
            {activeView !== "map" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Chip on={showSetbacks} onClick={() => setShowSetbacks((s) => !s)}>Setbacks</Chip>
                <Chip on={showDimensions} onClick={() => setShowDimensions((s) => !s)}>Dimensions</Chip>
                {activeView === "3d" && (
                  <Chip on={showShadows} onClick={() => setShowShadows((s) => !s)}>Shadows</Chip>
                )}
              </div>
            )}
          </div>

          {/* Active view */}
          {activeView === "3d" && (
            <Suspense fallback={<ViewFallback label="Building 3D model…" />}>
              <SiteModel3D
                model={model}
                showSetbacks={showSetbacks}
                showDimensions={showDimensions}
                showShadows={showShadows}
              />
            </Suspense>
          )}

          {activeView === "plan" && (
            <SitePlan2D model={model} showSetbacks={showSetbacks} showDimensions={showDimensions} />
          )}

          {activeView === "map" && coords && (
            <Suspense fallback={<ViewFallback label="Loading satellite…" />}>
              <LotMap
                lat={coords.lat}
                lng={coords.lng}
                lotWidth={v.lotWidth}
                lotDepth={v.lotDepth}
                front={v.front}
                rear={v.rear}
                side={v.side}
                houseDepth={v.houseDepth}
              />
            </Suspense>
          )}

          <p className="text-paper-dim text-[11px] leading-relaxed mt-3">
            {activeView === "map"
              ? "Aerial centered on your parcel. The outline is estimated from lot area, not a surveyed boundary — adjust the dimension fields to match your plat map."
              : "A planning estimate from your inputs, not a survey or GIS record. Assumes a detached ADU in the rear yard. Drag the fields above to match your plat map."}
          </p>
        </div>

        {/* Feasibility cards */}
        <FeasibilityCards model={model} />
      </div>

      <p className="text-paper-dim text-[11px] leading-relaxed mt-6">
        Confirm setbacks, lot-coverage limits, FAR, height, and max unit size with your jurisdiction
        before design. Zoning-dependent figures show “verify your zone” until we can pull your
        municipality’s code.
      </p>
    </div>
  );
};

const Chip = ({ on, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
      on
        ? "bg-accent/15 border-accent/40 text-accent"
        : "bg-canvas border-stroke text-paper-dim hover:text-paper"
    }`}
  >
    {children}
  </button>
);

const ViewFallback = ({ label }) => (
  <div className="h-[440px] lg:h-[560px] rounded-2xl border border-stroke bg-canvas flex items-center justify-center text-paper-dim text-sm">
    {label}
  </div>
);

export default BuildableEnvelope;
