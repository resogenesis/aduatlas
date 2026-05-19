import { Link } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiDownload, FiFileText, FiMapPin } from "react-icons/fi";
import { ConfidenceRow, ConfidenceSummary } from "../components/funnel/ConfidenceChip";
import { CONFIDENCE, datapoint } from "../funnel/confidence";

// Sample Feasibility Report. Shows the 7-section deliverable a homeowner
// gets at the $399 tier. All data is mock and labeled 'Sample report'.

const sampleAddress = "1247 Mulberry Lane, Pasadena CA 91103";

const snapshot = [
  datapoint({ label: "Lot size", value: "5,200 sq ft", confidence: CONFIDENCE.HIGH, source: "LA County parcel" }),
  datapoint({ label: "Zoning", value: "RS-6 (single-family residential)", confidence: CONFIDENCE.HIGH, source: "Pasadena zoning map" }),
  datapoint({ label: "Primary structure", value: "1,850 sq ft, 1 story", confidence: CONFIDENCE.HIGH, source: "County records" }),
  datapoint({ label: "Year built", value: "1953", confidence: CONFIDENCE.HIGH, source: "County records" }),
  datapoint({ label: "Lot dimensions", value: "50' × 104'", confidence: CONFIDENCE.HIGH, source: "Parcel survey" }),
  datapoint({ label: "Existing setbacks", value: "Front 25' / Side 5' / Rear 18'", confidence: CONFIDENCE.HIGH, source: "Site plan reconstruction" }),
];

const buildable = [
  datapoint({ label: "Detached ADU permitted", value: "Yes", confidence: CONFIDENCE.HIGH, source: "Pasadena ADU code §17.50.290" }),
  datapoint({ label: "Max ADU size", value: "850 sq ft", confidence: CONFIDENCE.HIGH, source: "City cap (state baseline + local)", note: "State law allows up to 1,200 sq ft, but Pasadena caps RS-6 detached at 850." }),
  datapoint({ label: "Required setbacks", value: "Side 4' / Rear 4' / 10' from primary", confidence: CONFIDENCE.HIGH, source: "Pasadena ADU code" }),
  datapoint({ label: "Height limit", value: "16 ft (1 story)", confidence: CONFIDENCE.HIGH, source: "City code", note: "2-story permitted only with conditional use; not recommended." }),
  datapoint({ label: "Recommended footprint", value: "24' × 32' = 768 sq ft", confidence: CONFIDENCE.MEDIUM, source: "Lot envelope analysis", lastUpdated: "2026-04-22", note: "Maximizes usable space while leaving 4 ft side, 4 ft rear, 10 ft from main house.", toGreen: "Verified site survey confirms exact lot dimensions and locks footprint to ±2 ft. Includes neighbor-fence and tree clearance check." }),
  datapoint({ label: "Parking required", value: "None (within 0.5 mi of transit)", confidence: CONFIDENCE.HIGH, source: "AB 68 + city overlay" }),
];

const cost = [
  datapoint({ label: "Site prep + foundation", value: "$32K – $48K", confidence: CONFIDENCE.HIGH, source: "Pasadena builder bids 2024-26", lastUpdated: "2026-04-15", note: "Driveway access supports standard pour; no slope work needed." }),
  datapoint({ label: "Utility hookups", value: "$18K – $34K", confidence: CONFIDENCE.MEDIUM, source: "Sewer ~28 ft from pad; electric panel needs sub-panel", lastUpdated: "2026-04-22", toGreen: "Site walk-through with a utility contractor narrows this to ±$3K. Concierge tier includes the walk-through." }),
  datapoint({ label: "Structure (768 sq ft prefab)", value: "$140K – $185K", confidence: CONFIDENCE.HIGH, source: "Regional prefab market 2026", lastUpdated: "2026-04-10" }),
  datapoint({ label: "Permits + impact + plan check", value: "$11K – $14K", confidence: CONFIDENCE.HIGH, source: "Pasadena fee schedule", lastUpdated: "2026-03-30" }),
  datapoint({ label: "Crane / delivery / sales tax", value: "$8K – $12K", confidence: CONFIDENCE.MEDIUM, source: "Standard prefab logistics", lastUpdated: "2026-04-10", toGreen: "Final delivery quote from your selected prefab manufacturer locks this exactly. Quoted as part of builder selection." }),
  datapoint({ label: "Total all-in", value: "$209K – $293K", confidence: CONFIDENCE.MEDIUM, source: "Sum of above ± 15%", lastUpdated: "2026-04-22", note: "Excludes interior upgrades, landscaping, and contingency (recommend +10%).", toGreen: "Tightens to ±10% once utility walk-through and final prefab quote land." }),
];

const risks = [
  { severity: "med", title: "Sewer depth not yet confirmed", desc: "Sewer is ~28 ft from the proposed pad; depth will determine whether a simple gravity tie-in works or whether a grinder pump is required (+$4–8K)." },
  { severity: "low", title: "Mature pepper tree at rear lot line", desc: "Roots may interfere with footing if foundation is placed within 8 ft. Arborist consult ~$300 recommended before final placement." },
  { severity: "low", title: "Pasadena historic-overlay check", desc: "Property is outside the listed historic district per current GIS, but overlay maps revise quarterly. Confirm at permit submittal." },
  { severity: "med", title: "Electric panel capacity", desc: "Existing 100A panel; ADU needs at minimum a 60A subfeed. Plan for $2.5K–4K upgrade or sub-panel." },
];

const financing = [
  { label: "HELOC", desc: "Strongest fit given 22 yrs of equity. Estimated rate 8.0–8.75% APR. Apply with primary lender." },
  { label: "Cash-out refinance", desc: "Not recommended. Current first mortgage rate (3.4%) is significantly below market." },
  { label: "Renovation mortgage (HomeStyle / 203k)", desc: "Possible but cumbersome; expect 60–90 day close." },
  { label: "CalHFA $40K ADU pre-development grant", desc: "You qualify based on income range and primary residence status. Apply within 30 days of plan approval." },
];

const nextSteps = [
  { n: "01", title: "Order a boundary survey", desc: "Pasadena requires one for ADU permits. ~$700, 2–3 weeks. Use the surveyors listed in your packet." },
  { n: "02", title: "Get 3 builder bids using the Builder Packet", desc: "Send the export below to the three matched builders. Bids will be apples-to-apples: same scope, same exclusions called out." },
  { n: "03", title: "Apply for the CalHFA grant", desc: "Don't skip this. The grant covers permit, plan check, and survey costs once you have an approved plan." },
];

const Report = () => {
  return (
    <div className="bg-canvas min-h-screen pb-20">

      {/* Header */}
      <section className="border-b border-stroke bg-surface-1-solid">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl py-12 sm:py-16">
          <div className="flex items-center gap-2 text-paper-dim text-sm mb-4">
            <FiMapPin /> {sampleAddress}
          </div>
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Sample Feasibility Report
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            What you can build, <span className="italic">verified.</span>
          </h1>
          <p className="text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed mb-7">
            This is what every paying customer receives. Real homeowners get this for their address, with their parcel data, their cost band, and their next steps.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              Get my Feasibility Report · $399 <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <button
              onClick={() => alert("INTEGRATION POINT: server-side PDF generation pending.")}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full border border-stroke text-paper hover:border-paper-dim transition font-medium"
            >
              <FiDownload /> Download sample (PDF)
            </button>
          </div>

          <p className="text-paper-dim/70 text-[0.65rem] leading-relaxed mt-7 max-w-3xl">
            ADUAtlas provides verified pre construction guidance, not legal advice, engineering, appraisal, or permit determination. Always confirm with your city, a licensed architect or engineer, and a qualified contractor before committing to a design. <Link to="/methodology" className="underline-offset-2 hover:underline hover:text-paper-dim transition">Read our methodology →</Link>
          </p>
        </div>
      </section>

      <div className="container mx-auto px-5 sm:px-8 max-w-5xl py-12 sm:py-16 space-y-6">

        {/* 1. Property snapshot */}
        <Section number="01" title="Property snapshot" subtitle="Verified facts about your lot, structure, and zoning.">
          <div className="mb-5">
            <ConfidenceSummary points={snapshot} />
          </div>
          {snapshot.map((p, i) => <ConfidenceRow key={i} point={p} />)}
        </Section>

        {/* 2. What you can build */}
        <Section number="02" title="What you can build" subtitle="Sized envelope, allowed types, real constraints.">
          <div className="mb-5">
            <ConfidenceSummary points={buildable} />
          </div>
          {buildable.map((p, i) => <ConfidenceRow key={i} point={p} />)}
        </Section>

        {/* 3. Cost breakdown */}
        <Section number="03" title="Cost breakdown" subtitle="Line-item budget with realistic ranges.">
          <div className="mb-5">
            <ConfidenceSummary points={cost} />
          </div>
          {cost.map((p, i) => <ConfidenceRow key={i} point={p} />)}
        </Section>

        {/* 4. Risk register */}
        <Section number="04" title="Risk register" subtitle="What could go wrong, ranked by severity.">
          <ul className="space-y-4">
            {risks.map((r) => (
              <li key={r.title} className="flex items-start gap-4 py-4 border-b border-stroke last:border-b-0">
                <span className={`shrink-0 mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.65rem] font-semibold uppercase tracking-wider ${
                  r.severity === "high" ? "bg-red-400/10 text-red-300 border-red-400/30" :
                  r.severity === "med" ? "bg-yellow-400/10 text-yellow-300 border-yellow-400/30" :
                  "bg-paper-dim/10 text-paper-dim border-stroke"
                }`}>
                  <FiAlertTriangle className="text-xs" />
                  {r.severity.toUpperCase()}
                </span>
                <div>
                  <h4 className="font-display text-paper text-base sm:text-lg mb-1">{r.title}</h4>
                  <p className="text-paper-dim text-sm leading-relaxed">{r.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* 5. Financing pathways */}
        <Section number="05" title="Financing pathways" subtitle="Real options tied to your situation.">
          <ul className="space-y-4">
            {financing.map((f) => (
              <li key={f.label} className="flex items-start gap-4 py-4 border-b border-stroke last:border-b-0">
                <FiCheck className="shrink-0 mt-1 text-accent" />
                <div>
                  <h4 className="font-display text-paper text-base sm:text-lg mb-1">{f.label}</h4>
                  <p className="text-paper-dim text-sm leading-relaxed">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* 6. Next 3 steps */}
        <Section number="06" title="Next 3 steps" subtitle="Specific. Sequenced. Named.">
          <ol className="space-y-5">
            {nextSteps.map((s) => (
              <li key={s.n} className="flex items-start gap-5 py-3">
                <span className="shrink-0 font-display text-accent text-2xl leading-none w-9 mt-0.5">{s.n}</span>
                <div>
                  <h4 className="font-display text-paper text-base sm:text-lg mb-1">{s.title}</h4>
                  <p className="text-paper-dim text-sm leading-relaxed">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* 7. Builder Packet + Conversation Guide */}
        <Section number="07" title="Builder Packet + Conversation Guide" subtitle="What you take to every builder. Same scope. Same questions. Apples-to-apples.">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-canvas border border-stroke rounded-2xl p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-3">
                <FiFileText className="text-accent text-xl" />
                <h4 className="font-display text-paper text-lg">builder_packet.pdf</h4>
              </div>
              <p className="text-paper-dim text-sm leading-relaxed mb-5">
                One-page RFP with your lot, scope, constraints, and exclusions. Builders quote against the same spec.
              </p>
              <button
                onClick={() => alert("INTEGRATION POINT: PDF generation pending.")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
              >
                <FiDownload /> Download Builder Packet
              </button>
            </div>

            <Link
              to="/report/sample/conversation-guide"
              className="group bg-canvas border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <FiFileText className="text-accent text-xl" />
                <h4 className="font-display text-paper text-lg">conversation_guide.pdf</h4>
              </div>
              <p className="text-paper-dim text-sm leading-relaxed mb-5">
                Five conversations every builder should pass. Lot-specific questions a homeowner shouldn't have to know to ask.
              </p>
              <span className="inline-flex items-center gap-2 text-accent text-sm font-semibold group-hover:gap-3 transition-all">
                Open Conversation Guide <FiArrowRight />
              </span>
            </Link>
          </div>
        </Section>

        {/* Final CTA */}
        <div className="bg-accent text-accent-fg rounded-3xl p-8 sm:p-12 text-center">
          <h2 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-4">
            Get this for your address.
          </h2>
          <p className="text-accent-fg/80 text-base sm:text-lg max-w-xl mx-auto mb-7">
            $399. One-time. 7-day full refund. Replaces a $500+ official survey and weeks of builder back-and-forth.
          </p>
          <Link
            to="/unlock"
            className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
          >
            See pricing tiers <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
};

const Section = ({ number, title, subtitle, children }) => (
  <section className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-10">
    <div className="flex items-baseline gap-5 mb-6">
      <span className="font-display text-accent text-2xl">{number}</span>
      <div>
        <h2 className="font-display text-paper text-2xl sm:text-3xl leading-snug">{title}</h2>
        <p className="text-paper-dim text-sm mt-1">{subtitle}</p>
      </div>
    </div>
    {children}
  </section>
);

export default Report;
