import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiMapPin } from "react-icons/fi";
import { ConfidenceRow, ConfidenceSummary } from "../components/funnel/ConfidenceChip";
import { CONFIDENCE, TIER, datapoint } from "../funnel/confidence";

// Free instant feasibility output. Every row carries a confidence level;
// medium and low rows surface inline 'Verify →' upsell CTAs to /unlock.

const Property = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();

  // Derive a deterministic-looking but mock output from the address string
  // so different inputs feel personalized. INTEGRATION POINT: replace with
  // real GIS + zoning lookup against ATTOM / Regrid / Mapbox.
  const points = useMemo(() => mockPropertyOutput(q), [q]);

  const lowOrMedium = points.filter((p) => p.confidence !== "high").length;

  return (
    <div className="bg-canvas min-h-[80vh]">
      <section className="container mx-auto px-5 sm:px-8 max-w-4xl pt-16 sm:pt-20 pb-10">

        {/* Header */}
        <div className="flex items-center gap-2 text-paper-dim text-sm mb-4">
          <FiMapPin /> {q || "No address provided"}
        </div>
        <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
          Free property snapshot
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          Here's what we can <span className="italic text-paper-dim">tell so far.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed mb-7">
          Honest answer: some of this is verified, most is estimated, and a few things still need a closer look. The Builder-Ready Report verifies every line below.
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ConfidenceSummary points={points} />
          <Link to="/methodology" className="text-paper-dim text-xs hover:text-paper transition-colors underline-offset-4 hover:underline">
            How we know what we know →
          </Link>
        </div>
      </section>

      {/* Output rows */}
      <section className="container mx-auto px-5 sm:px-8 max-w-4xl pb-16">
        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-10">
          {points.map((p, i) => (
            <ConfidenceRow key={i} point={p} />
          ))}
        </div>

        {lowOrMedium > 0 && (
          <div className="mt-8 bg-accent text-accent-fg rounded-3xl p-7 sm:p-10">
            <p className="text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-3">
              Remove the uncertainty
            </p>
            <h2 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-4">
              {lowOrMedium} {lowOrMedium === 1 ? "row" : "rows"} above are estimated or unknown.
            </h2>
            <p className="text-accent-fg/80 text-sm sm:text-base mb-7 max-w-xl leading-relaxed">
              The Builder-Ready Report cross-checks each row against city records, parcel data, and utility maps. You get verified numbers you can actually take to a builder or your city.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/unlock"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
              >
                See the report tiers <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/quiz"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-accent-fg/20 text-accent-fg font-medium hover:border-accent-fg/60 transition"
              >
                Take the 2-min Reality Check
              </Link>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-paper-dim mt-10">
          <Link to="/" className="hover:text-paper transition">Try another address</Link>
          <span className="mx-2">·</span>
          <Link to="/quiz" className="hover:text-paper transition">New to ADUs? Take the quiz</Link>
        </p>
      </section>
    </div>
  );
};

// Pseudo-personalized mock output. Same address always returns the same
// numbers so the page feels real on refresh. Replace with API call.
const mockPropertyOutput = (q) => {
  const seed = hash(q);
  const lotSqft = 3000 + (seed % 9) * 800;
  const maxAdu = Math.round(lotSqft * 0.18);
  const setbackSide = 3 + (seed % 3);
  const setbackRear = 5 + (seed % 4);
  const costLow = 145 + (seed % 8) * 10;
  const costHigh = 220 + (seed % 12) * 15;
  const stories = (seed % 3 === 0) ? "1 or 2 stories likely OK" : "1 story recommended";

  return [
    datapoint({
      label: "Lot size",
      value: `~${lotSqft.toLocaleString()} sq ft`,
      confidence: CONFIDENCE.HIGH,
      source: "County parcel data",
      lastUpdated: "2026-04-18",
    }),
    datapoint({
      label: "Detached ADU allowed",
      value: "Likely yes",
      confidence: CONFIDENCE.MEDIUM,
      source: "State + city zoning model",
      lastUpdated: "2026-04-12",
      unlocksAt: TIER.REPORT,
      note: "Confirmed jurisdiction permits detached ADUs; specific lot constraints not yet checked.",
      toGreen: "We pull your lot's specific zoning designation, check it against the city's current ADU code (with the latest amendment date), and verify no lot-specific overlay (historic, hillside, coastal) overrides the baseline rule.",
    }),
    datapoint({
      label: "Max ADU size",
      value: `~${maxAdu} sq ft`,
      confidence: CONFIDENCE.MEDIUM,
      source: "Zoning model + lot coverage rule",
      lastUpdated: "2026-04-12",
      unlocksAt: TIER.REPORT,
      toGreen: "We apply your city's actual ADU sq-ft cap, the percentage-of-primary-home rule, and your lot's measured coverage — not a generic state baseline. Often raises or lowers this estimate by 200+ sq ft.",
    }),
    datapoint({
      label: "Setbacks",
      value: `${setbackSide} ft side · ${setbackRear} ft rear`,
      confidence: CONFIDENCE.MEDIUM,
      source: "Standard local minimum",
      lastUpdated: "2026-03-22",
      unlocksAt: TIER.REPORT,
      toGreen: "We check your specific zoning class and any easements recorded against the parcel. Easements (utility, drainage, access) frequently override the standard minimum and can cut buildable area.",
    }),
    datapoint({
      label: "Stories permitted",
      value: stories,
      confidence: CONFIDENCE.MEDIUM,
      source: "Height envelope estimate",
      lastUpdated: "2026-03-22",
      unlocksAt: TIER.REPORT,
      toGreen: "We measure your lot's height envelope against the actual code, including any conditional-use requirement that 2-story ADUs may trigger. Some cities permit 2-story by right; many do not.",
    }),
    datapoint({
      label: "Cost range (site prep + structure)",
      value: `$${costLow}K – $${costHigh}K`,
      confidence: CONFIDENCE.MEDIUM,
      source: "Regional cost model",
      lastUpdated: "2026-04-01",
      unlocksAt: TIER.REPORT,
      note: "Wide because site prep and utility hookup costs vary 5×.",
      toGreen: "We model your specific site: sewer distance to pad, slope, soil class, panel capacity, crane access. The verified range typically tightens to ±15% — and surfaces the exact line-items that drive the spread.",
    }),
    datapoint({
      label: "Sewer access",
      value: "Unknown",
      confidence: CONFIDENCE.LOW,
      source: "Requires utility map review",
      unlocksAt: TIER.REPORT,
      toGreen: "We pull your city's sewer-line map, measure the distance from the closest tie-in to the proposed ADU pad, and flag whether a gravity tie-in works or a grinder pump is required (a $4K–$8K cost difference).",
    }),
    datapoint({
      label: "HOA / deed restrictions",
      value: "Unknown",
      confidence: CONFIDENCE.LOW,
      source: "Requires HOA / title check",
      unlocksAt: TIER.REPORT,
      toGreen: "We check your parcel against recorded CC&Rs and known HOA boundaries. Even when zoning permits an ADU, an HOA or deed restriction can prohibit it outright — discovering this late is the most expensive surprise homeowners face.",
    }),
  ];
};

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export default Property;
