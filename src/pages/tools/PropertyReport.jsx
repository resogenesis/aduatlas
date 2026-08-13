import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiHelpCircle } from "react-icons/fi";
import WorksheetBar from "../../components/tools/WorksheetBar";
import SitePlan2D from "../../components/tools/SitePlan2D";
import { buildLotModel } from "../../components/tools/lotModel";
import { loadPacket } from "../../stores/courseStore";
import { loadLot, loadWorksheets, NAPE_CATEGORIES, NAPE_GRADES, scoreNape } from "../../stores/worksheetStore";
import { money } from "../../components/tools/worksheetKit";
import { presiteTotal, tpcTotals, verificationTotal } from "./worksheetDefs";

// Property Feasibility Report — assembled per the ADUAtlas Feasibility Study
// Tool spec. Every value carries one of three statuses:
//   verified  — from public records or a source the homeowner confirmed
//   estimated — derived (e.g. dimensions from lot area, largest-fit footprint)
//   verify    — "Verification Required": data we cannot source yet; never
//               assumed to be "no constraint"
// CRITICAL REQUIREMENT (from the spec): this is a preliminary property
// feasibility analysis based on available data — never an approval and never
// a guarantee that an ADU fits.

const STATUS = {
  verified: { label: "Verified", cls: "text-accent border-accent/40 bg-accent/10" },
  estimated: { label: "Estimated", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
  verify: { label: "Verification required", cls: "text-paper-dim border-stroke bg-canvas" },
};

const Badge = ({ status }) => (
  <span className={`inline-block shrink-0 text-[0.6rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS[status].cls}`}>
    {STATUS[status].label}
  </span>
);

const Row = ({ label, value, status, note }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-stroke/60 last:border-b-0">
    <div className="min-w-0">
      <p className="text-paper text-sm">{label}</p>
      {note && <p className="text-paper-dim/70 text-xs mt-0.5 leading-relaxed">{note}</p>}
    </div>
    <div className="flex items-center gap-3 shrink-0 text-right">
      <span className="text-paper text-sm tabular-nums">{value ?? "—"}</span>
      <Badge status={status} />
    </div>
  </div>
);

const Section = ({ number, title, subtitle, children }) => (
  <section className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-9 mb-5">
    <div className="flex items-baseline gap-4 mb-5">
      <span className="font-display text-accent text-xl">{number}</span>
      <div>
        <h2 className="font-display text-paper text-xl sm:text-2xl leading-snug">{title}</h2>
        {subtitle && <p className="text-paper-dim text-sm mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </section>
);

// Regulations the study must overlay (spec §4) — all municipal data we cannot
// source yet, so each is a Verification Required line with a place to record
// the city's answer (the Pre-Site Verification worksheet).
const REGULATIONS = [
  "Maximum ADU size", "Maximum lot coverage", "Floor-area-ratio limits",
  "Rear setback", "Side setbacks", "Corner-side setback", "Front setback",
  "Required separation from the primary structure", "Maximum height",
  "Number of stories permitted", "Minimum lot size or lot width",
  "Parking requirements", "Fire-access requirements", "Maximum number of ADUs allowed",
  "Owner-occupancy requirements", "Historic-district restrictions",
  "HOA limitations", "Short-term-rental restrictions",
];

// Constraints to check (spec §5) — unavailable data is labeled Verification
// Required, never assumed absent.
const CONSTRAINTS = [
  "Recorded easements", "Utility easements", "Drainage easements",
  "Floodplain or flood zone", "Protected trees", "Significant slope or elevation change",
  "Retaining walls", "Waterways or drainage areas", "Septic system or well location",
  "Overhead utility lines", "Existing accessory structures",
  "Required fire or emergency access", "Utility connection points",
];

const NEXT_STEPS = [
  "Review every section of this report and mark anything that requires verification",
  "Verify utilities — locations, connection points, capacity, responsibility, and fees",
  "Complete the Pre-Site Estimate Worksheet with every known, estimated, and unknown expense",
  "Obtain professional quotes for major site and utility costs",
  "Determine your total budget: pre-site + structure + construction + delivery + permits + professional fees + contingency",
  "Confirm the city process — permits, plans, fees, inspections, and expected timelines",
  "Compare ADU options against your property, regulations, goals, timeline, and budget",
  "Interview builders with the same information and questions",
  "Compare complete proposals — the same scope, not only the bottom-line price",
  "Decide whether to move forward — only when you understand what you can build, where, and what it may cost",
];

const RESULTS = {
  likely: { label: "Likely Feasible", tone: "bg-accent/10 border-accent/40 text-accent", Icon: FiCheckCircle,
    note: "Based on available data and your NAPE answers, no major obstacle has been identified. This remains a preliminary analysis — complete the verification items below before spending significant money." },
  possible: { label: "Possible with Verification", tone: "bg-amber-500/10 border-amber-500/40 text-amber-300", Icon: FiHelpCircle,
    note: "Key information is missing or several factors need research. Work through the verification items below with your city and utility providers before making major commitments." },
  nogo: { label: "Potential No-Go", tone: "bg-red-500/10 border-red-500/40 text-red-300", Icon: FiAlertTriangle,
    note: "One or more automatic no-go conditions were identified in your NAPE evaluation. Verify each flagged condition with your local planning department — a No today is not always a No forever." },
};

const sqft = (n) => (n ? `${Math.round(n).toLocaleString()} sq ft` : null);

const PropertyReport = () => {
  const packet = useMemo(() => loadPacket(), []);
  const lot = useMemo(() => loadLot(), []);
  const ws = useMemo(() => loadWorksheets(), []);

  const lookup = lot?.lookup || null;
  const model = lot?.input ? buildLotModel(lot.input, { dimsEstimated: lot.dimsEstimated }) : null;
  const nape = scoreNape(ws.readyScore?.answers || {});

  const presite = presiteTotal(ws.preSiteEstimate?.values || {});
  const verification = verificationTotal(ws.preSiteVerification?.values || {});
  const totals = tpcTotals(ws.totalProjectCost?.values || {});

  // Missing-information list (spec §8) — assembled from what's actually absent.
  const missing = [];
  if (!lookup) missing.push("Public-record snapshot — run the address lookup in the Feasibility tool");
  if (!model) missing.push("Lot geometry — enter your dimensions and setbacks in the Feasibility tool");
  if (model && lot?.dimsEstimated) missing.push("Lot dimensions are estimated from recorded area — confirm against your plat map or survey");
  missing.push("Parcel number (APN), zoning district, and lot type — confirm with your county and city");
  missing.push("Applicable ADU regulations — record your city's answers (section 04)");
  missing.push("Easements, flood zones, and site constraints — confirm with city/county records (section 05)");
  if (!nape.complete) missing.push("NAPE evaluation incomplete — answer all questions in the ADU Ready Score");
  if (!verification) missing.push("Utility connection charges and city fees — Pre-Site Verification worksheet");

  const result = !nape.complete
    ? RESULTS.possible
    : nape.grade === "F"
      ? RESULTS.nogo
      : nape.grade === "A" || nape.grade === "B"
        ? RESULTS.likely
        : RESULTS.possible;

  const addr = lot?.address || packet.address || "";

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={null} />

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Property Feasibility Report
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-3">
        {addr || "Your property."}
      </h1>
      <p className="text-paper-dim text-sm mb-2">Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-8">
        A preliminary property feasibility analysis based on available public data, your entered
        geometry, and your evaluations. A survey shows what exists; this report helps you
        understand what may be possible. It is not an approval, a survey, an engineering document,
        or a guarantee that an ADU fits.
      </p>

      {/* Feasibility result */}
      <div className={`rounded-3xl border p-6 sm:p-8 mb-8 ${result.tone}`}>
        <div className="flex items-center gap-3 mb-2">
          <result.Icon className="text-2xl" />
          <h2 className="font-display text-2xl sm:text-3xl">{result.label}</h2>
        </div>
        <p className="text-paper-dim text-sm leading-relaxed max-w-3xl">{result.note}</p>
      </div>

      <Section number="01" title="Property identification" subtitle="A ZIP code can contain multiple jurisdictions — identify the property precisely.">
        <Row label="Full property address" value={addr || null} status={addr ? "verified" : "verify"} note={!addr ? "Add your address in My Property or the Feasibility tool" : null} />
        <Row label="Parcel number / APN" value={null} status="verify" note="Find it on your property-tax record or county assessor site" />
        <Row label="Zoning district" value={null} status="verify" note="Your city's zoning map or planning department" />
        <Row label="Lot type (standard, corner, flag, irregular)" value={null} status="verify" note="Corner and irregular lots can have different setback rules" />
      </Section>

      <Section number="02" title="Lot data" subtitle={lookup ? `Source: ${lookup.source}${lookup.fetchedAt ? ` · retrieved ${new Date(lookup.fetchedAt).toLocaleDateString()}` : ""}` : "Run the address lookup in the Feasibility tool to pull public records."}>
        <Row label="Total lot square footage" value={sqft(lookup?.lotSize)} status={lookup?.lotSize ? "verified" : "verify"} />
        <Row
          label="Lot width × depth"
          value={model ? `${model.stats.lotDims.w} ft × ${model.stats.lotDims.d} ft` : null}
          status={model ? (lot.dimsEstimated ? "estimated" : "verified") : "verify"}
          note={lot?.dimsEstimated ? "Estimated from recorded lot area — adjust to your plat map in the Feasibility tool" : model ? "As entered by you in the Feasibility tool" : null}
        />
        <Row label="Parcel boundary / lot shape" value={null} status="verify" note="Requires your plat map or county parcel polygon — irregular lots need the actual boundary, not average dimensions" />
        <Row label="Street frontage, alley, and north orientation" value={null} status="verify" />
      </Section>

      <Section number="03" title="Primary structure" subtitle="Footprint is distinct from total finished square footage.">
        <Row label="Building size (finished)" value={sqft(lookup?.buildingSize)} status={lookup?.buildingSize ? "verified" : "verify"} />
        <Row label="Year built" value={lookup?.yearBuilt || null} status={lookup?.yearBuilt ? "verified" : "verify"} />
        <Row label="Property type" value={lookup?.propertyType || null} status={lookup?.propertyType ? "verified" : "verify"} />
        <Row
          label="Footprint placement on lot"
          value={model?.home ? `${model.home.w} ft × ${model.home.d} ft (front of buildable band)` : null}
          status={model?.home ? "estimated" : "verify"}
          note="Placement assumes the home fills the front of the buildable band — measure distances from your home to every property line"
        />
        <Row label="Stories, height, attached structures, driveway" value={null} status="verify" />
      </Section>

      <Section number="04" title="Applicable ADU regulations" subtitle="Each regulation needs your city's current answer, its source, and effective date. Record them in the Pre-Site Verification worksheet — regulations vary by municipality and can change.">
        <div className="grid sm:grid-cols-2 gap-x-8">
          {REGULATIONS.map((r) => (
            <Row key={r} label={r} value={null} status="verify" />
          ))}
        </div>
        {(packet.hoaNotes || "").trim() && (
          <p className="text-paper-dim text-xs leading-relaxed mt-4">
            <span className="text-paper font-medium">Your HOA / restriction notes:</span> {packet.hoaNotes}
          </p>
        )}
      </Section>

      <Section number="05" title="Property constraints" subtitle="Unavailable information is listed as Verification Required — never assumed to be no constraint.">
        <div className="grid sm:grid-cols-2 gap-x-8">
          {CONSTRAINTS.map((c) => (
            <Row key={c} label={c} value={null} status="verify" />
          ))}
        </div>
        {(packet.utilityNotes || "").trim() && (
          <p className="text-paper-dim text-xs leading-relaxed mt-4">
            <span className="text-paper font-medium">Your utility notes:</span> {packet.utilityNotes}
          </p>
        )}
      </Section>

      <Section number="06" title="Buildable envelope" subtitle="Geometry from your entered dimensions and setbacks — a planning estimate, not a survey.">
        {model ? (
          <>
            <div className="mb-6">
              <SitePlan2D model={model} showSetbacks showDimensions />
            </div>
            <Row label="Entered setbacks (front / rear / side)" value={`${model.setbacks.front} / ${model.setbacks.rear} / ${model.setbacks.side} ft`} status="estimated" note="Confirm the legally required setbacks for your zoning district" />
            <Row label="Buildable area after setbacks" value={sqft(model.stats.buildableArea)} status="estimated" />
            <Row
              label="Maximum estimated ADU footprint"
              value={model.adu ? `${model.adu.w} ft × ${model.adu.d} ft — ${sqft(model.stats.aduArea)}` : "Does not fit with current inputs"}
              status="estimated"
              note="Largest single-story rectangle behind the home within your entered setbacks — before lot-coverage, FAR, separation, and easement limits are applied"
            />
            <Row label="Lot coverage with home + max ADU" value={`${Math.round(model.stats.coverage * 100)}%`} status="estimated" note="Compare to your city's maximum lot coverage" />
            <Row label="One-story vs. two-story potential" value={null} status="verify" note="Depends on your city's height and story limits" />
            <Row label="Alternative placement options" value={null} status="verify" note="This model assumes rear-yard placement — corner and side placements depend on your parcel shape and access" />
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-paper-dim text-sm mb-4">No lot geometry yet — set up your property in the Feasibility tool and it appears here.</p>
            <Link to="/feasibility" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors">
              Open the Feasibility tool <FiArrowRight />
            </Link>
          </div>
        )}
      </Section>

      <Section number="07" title="NAPE evaluation" subtitle="The National ADU Property Evaluation — your Yes/No self-assessment.">
        {nape.answered > 0 ? (
          <>
            <div className="flex items-baseline gap-4 mb-4">
              <span className={`font-display text-5xl ${nape.grade === "F" ? "text-red-300" : "text-accent"}`}>
                {nape.complete ? nape.grade : "–"}
              </span>
              <span className="text-paper text-lg">{nape.points}/100 points</span>
              <span className="text-paper-dim text-sm">{nape.answered}/27 answered</span>
            </div>
            {nape.complete && (
              <p className="text-paper-dim text-sm leading-relaxed mb-4">{NAPE_GRADES[nape.grade].note}</p>
            )}
            {NAPE_CATEGORIES.map((cat) => (
              <Row key={cat.id} label={cat.title} value={`${nape.perCategory[cat.id]} / ${cat.points} pts`} status="estimated" />
            ))}
            {nape.noGoFlags.length > 0 && (
              <p className="text-red-300 text-sm leading-relaxed mt-4">
                <FiAlertTriangle className="inline mr-1.5" />
                No-go conditions flagged: {nape.noGoFlags.map((f) => f.q).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-paper-dim text-sm mb-4">Not scored yet.</p>
            <Link to="/packet/ready-score" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors">
              Take the NAPE evaluation <FiArrowRight />
            </Link>
          </div>
        )}
      </Section>

      <Section number="08" title="Budget summary" subtitle="Pulled live from your worksheets — planning estimates, not quotes.">
        <Row label="Pre-site estimate (Worksheet 1)" value={presite ? money(presite) : null} status={presite ? "estimated" : "verify"} note={!presite ? "Not started — complete the Pre-site Estimate worksheet" : null} />
        <Row label="Verified pre-site summary (Worksheet 2)" value={verification ? money(verification) : null} status={verification ? "estimated" : "verify"} note={!verification ? "Record utility charges and city fees as you confirm them" : null} />
        <Row label="Estimated total project (Worksheet 6)" value={totals.est ? money(totals.est) : null} status={totals.est ? "estimated" : "verify"} />
        <p className="text-paper-dim text-xs mt-4">
          <Link to="/packet" className="text-accent hover:text-paper transition-colors">Open your worksheets →</Link>
        </p>
      </Section>

      <Section number="09" title="Missing information to verify" subtitle="What this report cannot confirm from available data.">
        <ul className="space-y-2">
          {missing.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5 text-paper-dim text-sm leading-relaxed">
              <FiHelpCircle className="shrink-0 mt-0.5 text-amber-300" /> {m}
            </li>
          ))}
        </ul>
      </Section>

      <Section number="10" title="Recommended next steps" subtitle="From Module 10 — verify twice, build once.">
        <ol className="space-y-2.5">
          {NEXT_STEPS.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-paper-dim text-sm leading-relaxed">
              <span className="shrink-0 font-display text-accent w-6">{String(i + 1).padStart(2, "0")}</span> {s}
            </li>
          ))}
        </ol>
      </Section>

      <p className="text-paper-dim text-xs leading-relaxed">
        This is a preliminary property feasibility analysis based on available public data and
        published information at the time of generation. It does not state or imply that an ADU is
        approved or guaranteed to fit. Property data, public records, and local regulations can
        contain errors or change — verify final project information with your city departments and
        qualified professionals. Not legal advice, engineering, appraisal, or a permit
        determination. <Link to="/methodology" className="underline-offset-2 hover:underline transition">Read our methodology →</Link>
      </p>
    </div>
  );
};

export default PropertyReport;
