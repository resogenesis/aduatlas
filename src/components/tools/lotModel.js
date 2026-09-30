// Shared lot geometry + stats model — the single source of truth both the 2D
// site plan and the 3D site model render from, and the stat cards read from.
//
// Everything is in FEET, origin at the FRONT-LEFT corner of the lot:
//   x → right   (along lot WIDTH, the street-facing dimension)
//   y → back    (along lot DEPTH, front setback is small-y, rear is large-y)
// Rectangles are { x, y, w, d } where (x, y) is the front-left corner, w spans
// x (width), d spans y (depth).
//
// HONEST DATA BOUNDARY: this model is built ONLY from lot dimensions + setbacks
// the homeowner entered (or that we ESTIMATED from public-record lot AREA).
// There is no starting lot and there are no default dimensions: until all six
// numbers are present, buildLotModel returns null. What it builds is still
// NOT a surveyed parcel and NOT the municipal zoning code, so the model marks,
// per value, whether it is `measured`, `estimated`, or `unknown` — the UI uses
// those flags to decide what it may assert as fact vs. what it must label
// "estimated" or gate behind zoning verification. We never emit a code-
// compliance verdict (e.g. "meets setbacks ✅") the data can't support.

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// ── What the homeowner has actually told us ──────────────────────────────────
// The model needs all six numbers. A blank field is NOT a zero and NOT a
// default: nothing downstream may state a dimension, a footprint or a coverage
// figure for a property whose owner has not given us the measurement. So the
// inputs start empty, buildLotModel returns null until they are all filled,
// and every consumer renders an empty state rather than an invented lot.
export const LOT_INPUT_KEYS = ["lotWidth", "lotDepth", "front", "rear", "side", "houseDepth"];

// Lot width and depth have to be positive for any of the geometry to mean
// anything. The setbacks and the home depth may legitimately be zero.
const POSITIVE_KEYS = ["lotWidth", "lotDepth"];

const isBlank = (v) => {
  if (v === "" || v === null || v === undefined) return true;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return true;
  return false;
};

const entered = (input, key) => {
  if (isBlank(input?.[key])) return false;
  return POSITIVE_KEYS.includes(key) ? Number(input[key]) > 0 : true;
};

// Every field the homeowner still has to fill in before the model can be built.
export const missingLotInput = (input) => LOT_INPUT_KEYS.filter((k) => !entered(input, k));

export const hasCompleteLotInput = (input) => missingLotInput(input).length === 0;

const rectArea = (r) => (r ? r.w * r.d : 0);

// provenance: how much we trust each derived quantity given the inputs.
//   "measured"  — came straight from a value the homeowner confirmed
//   "estimated" — we derived it (from area, from an assumption about placement)
//   "unknown"   — needs zoning / survey data we don't have (Phase 2)
const PROVENANCE = {
  measured: "measured",
  estimated: "estimated",
  unknown: "unknown",
};

// Build the model from raw inputs.
//   input: { lotWidth, lotDepth, front, rear, side, houseDepth }
//   opts:  { dimsEstimated } — true when lot width/depth were derived from
//          public-record AREA rather than entered/confirmed by the homeowner.
export function buildLotModel(input, opts = {}) {
  // No complete set of measurements, no model. Callers treat null as "the
  // homeowner has not given us the dimensions yet" and show an empty state.
  if (!hasCompleteLotInput(input)) return null;

  const lotWidth = num(input.lotWidth);
  const lotDepth = num(input.lotDepth);
  const front = num(input.front);
  const rear = num(input.rear);
  const side = num(input.side);
  const houseDepth = num(input.houseDepth);
  const dimsEstimated = !!opts.dimsEstimated;

  const lot = { x: 0, y: 0, w: lotWidth, d: lotDepth };

  // Buildable band = lot minus setbacks on all four edges.
  const bW = Math.max(0, lotWidth - 2 * side);
  const bD = Math.max(0, lotDepth - front - rear);
  const buildable = bW > 0 && bD > 0 ? { x: side, y: front, w: bW, d: bD } : null;

  // Existing home fills the front of the buildable band; ADU takes the rear yard
  // behind it. Home depth is capped at the buildable depth.
  const homeD = buildable ? Math.min(houseDepth, bD) : 0;
  const home = buildable && homeD > 0 ? { x: side, y: front, w: bW, d: homeD } : null;

  const aduD = buildable ? Math.max(0, bD - homeD) : 0;
  const adu = buildable && aduD > 0 ? { x: side, y: front + homeD, w: bW, d: aduD } : null;

  const lotArea = rectArea(lot);
  const homeArea = rectArea(home);
  const aduArea = rectArea(adu);
  const buildableArea = rectArea(buildable);

  // Lot coverage = built footprint / lot area. Computable from the geometry we
  // have — but only as good as the (possibly estimated) dimensions behind it.
  const coverage = lotArea > 0 ? (homeArea + aduArea) / lotArea : 0;

  // Provenance of the dimensions themselves flows into everything derived.
  const dimProv = dimsEstimated ? PROVENANCE.estimated : PROVENANCE.measured;

  return {
    input: { lotWidth, lotDepth, front, rear, side, houseDepth },
    lot,
    setbacks: { front, rear, side },
    buildable,
    home,
    adu,
    fits: !!adu,
    stats: {
      lotArea,
      lotDims: { w: lotWidth, d: lotDepth },
      homeArea,
      homeDims: home ? { w: home.w, d: home.d } : null,
      aduArea,
      aduDims: adu ? { w: adu.w, d: adu.d } : null,
      buildableArea,
      coverage, // 0..1
    },
    provenance: {
      // Geometry we can compute from inputs — trust = trust in the inputs.
      lotDims: dimProv,
      lotArea: dimProv,
      homeFootprint: dimProv,
      aduFootprint: PROVENANCE.estimated, // always a "largest that fits" estimate
      coverage: dimProv,
      buildableEnvelope: PROVENANCE.estimated, // depends on setbacks + placement
      // Zoning / survey data we DON'T have — must stay unknown until Phase 2.
      farLimit: PROVENANCE.unknown,
      heightLimit: PROVENANCE.unknown,
      requiredSetbacks: PROVENANCE.unknown, // whether the entered setbacks are legal
      byRightAduSize: PROVENANCE.unknown,
      utilities: PROVENANCE.unknown,
      codeCompliance: PROVENANCE.unknown, // never assert "meets code"
    },
  };
}

// The manual-entry starting state: empty, because we do not know anything about
// this property until the homeowner tells us. Kept as strings so the number
// inputs render blank rather than showing a 0 the homeowner never typed.
export const EMPTY_LOT_INPUT = {
  lotWidth: "",
  lotDepth: "",
  front: "",
  rear: "",
  side: "",
  houseDepth: "",
};
