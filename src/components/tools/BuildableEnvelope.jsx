import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { buildLotModel, EMPTY_LOT_INPUT, LOT_INPUT_KEYS, missingLotInput } from "./lotModel";
import { loadPacket } from "../../stores/courseStore";
import { loadLot, saveLot } from "../../stores/worksheetStore";
import { supabase } from "../../lib/supabase";
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
//
// And nothing at all is drawn until the homeowner has given us the numbers. The
// fields start EMPTY: no starter lot, no default setbacks, no assumed house
// depth. A paid deliverable must never state a dimension of someone's property
// that they did not tell us, so until every field is filled this renders an
// empty state that asks for the dimensions instead of a model.

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

const LABELS = Object.fromEntries(NUM_FIELDS.map((f) => [f.key, f.label]));

// Dimensions that an area-derived lookup can fill. Editing one of these by hand
// is what makes the lot "measured"; editing a setback says nothing about where
// the lot dimensions came from.
const DIM_KEYS = ["lotWidth", "lotDepth"];

// Lot state written by a build that seeded the form with invented numbers
// (50 x 120, 20/4/4 setbacks, 45 ft house). Those were never the homeowner's
// measurements, so a saved packet that still holds exactly that seed is dropped
// and the fields come back empty for the homeowner to fill in.
const RETIRED_SEED = { lotWidth: 50, lotDepth: 120, front: 20, rear: 4, side: 4, houseDepth: 45 };
const isRetiredSeed = (input) =>
  Boolean(input) && LOT_INPUT_KEYS.every((k) => Number(input[k]) === RETIRED_SEED[k]);

// /api/property-lookup spends a metered provider call, so the server answers
// only a signed-in account entitled to Platinum (api/property-lookup.js). The
// lookup therefore sends the session's access token, the same way
// src/lib/adminApi.js does. The server makes the decision; this only carries
// the credential. With no session the request goes out bare and the server
// refuses it with 401, which is shown below as a sign-in problem.
const authHeader = async () => {
  if (!supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

// What the homeowner reads for each answer that is not a record. Each refusal
// says what actually happened, so a sign-in, plan or rate problem never reads
// as a provider failure. Any other status gets the generic message.
const AMBER = "text-amber-700";
const LOOKUP_REFUSALS = {
  401: "We could not confirm that you are signed in. Sign in again to use address lookup, or enter your dimensions below.",
  403: "Address lookup is part of Platinum, and we could not confirm Platinum on this account. Enter your dimensions below.",
  404: "No public record found for that address. Enter dimensions manually.",
  429: "You have run too many lookups in a short time. Wait a few minutes and try again, or enter your dimensions below.",
  501: "Address lookup isn't enabled yet. Enter your dimensions below.",
};
const LOOKUP_FAILED = "Lookup failed. Enter your dimensions manually.";

const BuildableEnvelope = () => {
  // Hydrate from the saved lot state (builder_packet.lot) so the geometry the
  // homeowner tuned here also powers their Property Report.
  const saved = useMemo(() => loadLot(), []);
  const [v, setV] = useState(() =>
    saved?.input && !isRetiredSeed(saved.input) ? { ...EMPTY_LOT_INPUT, ...saved.input } : EMPTY_LOT_INPUT
  );
  // True while the current dimensions came from an area-derived lookup rather
  // than being entered/confirmed by the homeowner. Editing a dimension by hand
  // clears it.
  const [dimsEstimated, setDimsEstimated] = useState(
    Boolean(saved?.dimsEstimated) && !isRetiredSeed(saved?.input)
  );
  // Raw strings, kept exactly as typed: "" means the homeowner has not answered
  // yet and must never be read as a zero.
  const set = (k, raw) => {
    setV((s) => ({ ...s, [k]: raw }));
    if (DIM_KEYS.includes(k)) setDimsEstimated(false);
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

  // null until every field is filled. Nothing geometric renders without it.
  const model = useMemo(() => buildLotModel(v, { dimsEstimated }), [v, dimsEstimated]);
  const missing = useMemo(() => missingLotInput(v), [v]);

  // Public records give an AREA, not dimensions, so the width and depth here are
  // estimates (flagged as such) and the setbacks stay blank: the record says
  // nothing about them and neither do we.
  const applyLookup = (d) => {
    const area = Number(d.lotSize) || 0;
    const bld = Number(d.buildingSize) || 0;
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    setLookupData({ ...d, fetchedAt: new Date().toISOString() });
    setCoords(Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { lat, lng } : null);
    setDimsEstimated(area > 0);
    setV((s) => {
      if (area <= 0) return s;
      const width = Math.max(20, Math.round(Math.sqrt(area / 2)));
      const depth = Math.max(20, Math.round(area / width));
      // The recorded building size is a floor area; turning it into a depth needs
      // the side setbacks, so only estimate it once the homeowner has entered
      // them. Otherwise the field stays as it is.
      const side = Number(s.side);
      const front = Number(s.front);
      const rear = Number(s.rear);
      const canEstimateHouse =
        bld > 0 && [side, front, rear].every((n) => Number.isFinite(n) && n >= 0) && s.side !== "" && s.front !== "" && s.rear !== "";
      const houseDepth = canEstimateHouse
        ? Math.min(Math.max(0, depth - front - rear), Math.max(10, Math.round(bld / Math.max(1, width - 2 * side))))
        : s.houseDepth;
      return { ...s, lotWidth: width, lotDepth: depth, houseDepth };
    });
  };

  const lookup = async () => {
    const a = address.trim();
    if (!a) return;
    setLook({ status: "loading", msg: "", tone: "text-paper-dim" });
    try {
      const r = await fetch(`/api/property-lookup?address=${encodeURIComponent(a)}`, {
        headers: await authHeader(),
      });
      if (LOOKUP_REFUSALS[r.status]) {
        setLook({ status: "idle", msg: LOOKUP_REFUSALS[r.status], tone: AMBER });
        return;
      }
      if (!r.ok) {
        setLook({ status: "idle", msg: LOOKUP_FAILED, tone: "text-red-700" });
        return;
      }
      const d = await r.json();
      applyLookup(d);
      const bits = [];
      if (d.lotSize) bits.push(`lot ${Number(d.lotSize).toLocaleString()} sq ft`);
      if (d.buildingSize) bits.push(`home ${Number(d.buildingSize).toLocaleString()} sq ft`);
      setLook({
        status: "idle",
        msg: `Filled from public records${bits.length ? ` (${bits.join(" · ")})` : ""}. Width and depth are estimated from the recorded area, so adjust them to your plat map. Setbacks and home depth are not in the record: enter those below.`,
        tone: "text-accent",
      });
    } catch {
      setLook({ status: "idle", msg: LOOKUP_FAILED, tone: "text-red-700" });
    }
  };

  const activeView = view === "map" && !coords ? "3d" : view;

  return (
    <div className="bg-surface-1-solid rounded-3xl border border-stroke p-6 sm:p-8">
      <h3 className="font-display text-paper text-2xl mb-1">Feasibility model</h3>
      <p className="text-paper-dim text-sm leading-relaxed mb-6">
        Enter your lot dimensions and setbacks, or look up an address, to see the buildable area
        and the largest ADU that fits behind your home, as a 3D model, a printable site plan, or on
        the real aerial. Nothing is drawn from assumed numbers, so the model appears once all six
        fields are filled in.
      </p>

      {/* Address auto-fill */}
      <div className="mb-6">
        <label className="block text-paper-dim text-[11px] font-medium mb-1.5">
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
            className="shrink-0 px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-50"
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
            <label className="block text-paper-dim text-[11px] font-medium mb-1.5">
              {f.label}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                value={v[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-canvas border border-stroke text-paper text-sm focus:outline-none focus:border-accent transition"
              />
              <span className="text-paper-dim text-xs">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Visualizer + cards — only once we have every number from the homeowner */}
      {!model ? (
        <MissingDimensions missing={missing} />
      ) : (
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
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${ on ?"bg-accent text-accent-fg": disabled ?"text-paper-dim/40 cursor-not-allowed":"text-paper-dim hover:text-paper"}`}
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
                  lotWidth={model.input.lotWidth}
                  lotDepth={model.input.lotDepth}
                  front={model.input.front}
                  rear={model.input.rear}
                  side={model.input.side}
                  houseDepth={model.input.houseDepth}
                />
              </Suspense>
            )}

            <p className="text-paper-dim text-[11px] leading-relaxed mt-3">
              {activeView === "map"
                ? "Aerial centered on your parcel. The outline is estimated from lot area, not a surveyed boundary. Adjust the dimension fields to match your plat map."
                : "A planning estimate from your inputs, not a survey or GIS record. Assumes a detached ADU in the rear yard. Drag the fields above to match your plat map."}
            </p>
          </div>

          {/* Feasibility cards */}
          <FeasibilityCards model={model} />
        </div>
      )}

      {model && (
        <p className="text-paper-dim text-[11px] leading-relaxed mt-6">
          Confirm setbacks, lot-coverage limits, FAR, height, and max unit size with your jurisdiction
          before design. Zoning-dependent figures show “verify your zone” until we can pull your
          municipality’s code.
        </p>
      )}
    </div>
  );
};

// The empty state: we hold no measurements for this property yet, so we say so
// and name what is still needed rather than drawing a lot nobody described.
const MissingDimensions = ({ missing }) => (
  <div className="rounded-2xl border border-dashed border-stroke bg-canvas px-6 py-10 text-center">
    <p className="text-paper font-semibold text-sm mb-2">Enter your lot dimensions to see the model</p>
    <p className="text-paper-dim text-xs leading-relaxed max-w-md mx-auto">
      The site plan, the 3D model and the feasibility figures are built from your measurements
      alone. We do not fill them with example numbers, so nothing is drawn until every field above
      has a value. Take them from your plat map, survey or property record, and use 0 where a
      setback really is zero.
    </p>
    {missing.length > 0 && (
      <p className="text-paper-dim text-xs mt-4">
        Still needed: <span className="text-paper">{missing.map((k) => LABELS[k] || k).join(", ")}</span>
      </p>
    )}
  </div>
);

const Chip = ({ on, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${ on ?"bg-accent/15 border-accent/40 text-accent":"bg-canvas border-stroke text-paper-dim hover:text-paper"}`}
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
