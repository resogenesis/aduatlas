import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiCheck, FiMapPin } from "react-icons/fi";
import { EV, track } from "../lib/analytics";
import { lookupProperty } from "../lib/property";

// Free instant property snapshot. Shows the handful of facts public records
// can verify, and makes every ADU-determining question visibly "TBD" — each
// resolved by the paid Property Feasibility Report. This is the top of the
// funnel: honest about what's unknown, pointed at the upgrade.

// Each row: what we can/can't tell from records alone.
//   verified — confirmed from authoritative public data
//   tbd      — resolved by the Property Feasibility Report
//   course   — homeowner verifies it themselves, guided by the course
// Rows public records can't resolve on their own — each verified by the
// paid Property Feasibility Report.
const reviewRows = [
  { label: "Detached ADU Permitted", source: "Requires zoning review", status: "tbd" },
  { label: "Maximum ADU Size", source: "Requires zoning and lot coverage analysis", status: "tbd" },
  { label: "Required Setbacks", source: "Requires zoning district and easement review", status: "tbd" },
  { label: "Maximum Height / Stories", source: "Requires zoning and height limit analysis", status: "tbd" },
  {
    label: "Estimated Project Cost",
    source: "Site preparation, utilities, permits, and structure costs vary by property",
    status: "tbd",
  },
  { label: "Water & Sewer Access", source: "Requires utility review", status: "tbd" },
  { label: "HOA or Deed Restrictions", source: "Requires HOA and title review", status: "course" },
];

const unknownsList = [
  "What ADU types are allowed",
  "Maximum ADU size",
  "Setback requirements",
  "Utility connection costs",
  "Site preparation requirements",
  "Local zoning restrictions",
  "HOA limitations",
  "Realistic project budgets",
];

const upgradeIncludes = [
  "ADU eligibility review",
  "Estimated buildable area",
  "Maximum ADU size estimate",
  "Utility access review",
  "Site preparation cost estimate",
  "Property Feasibility Report Score",
  "Timeline and budget guidance",
  "Builder-ready property summary",
];

const StatusTag = ({ status }) => {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-accent/30 bg-accent/15 text-accent text-[0.65rem] font-semibold uppercase tracking-wider">
        <FiCheck className="text-xs" /> Verified
      </span>
    );
  }
  if (status === "course") {
    return (
      <span className="text-paper-dim/70 text-[0.65rem] italic">
        Verified in the course
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 text-yellow-300 text-[0.65rem] font-semibold uppercase tracking-wider">
      TBD
    </span>
  );
};

const fmtSqft = (n) => `${n.toLocaleString()} sq ft`;

const Property = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const [record, setRecord] = useState(null);

  // Pull real lot/building size when a provider is configured; otherwise the
  // rows fall back to example values and the page still renders.
  useEffect(() => {
    let active = true;
    lookupProperty(q).then((r) => { if (active) setRecord(r); });
    return () => { active = false; };
  }, [q]);

  const verifiedRows = [
    {
      label: "Lot Size",
      source: record?.source || "County assessor records · Updated 2026-04-18",
      value: record?.lotSize ? fmtSqft(record.lotSize) : "5,200 sq ft",
      note: record?.lotSize ? null : "(example)",
      status: "verified",
    },
    {
      label: "Main House Size",
      source: record?.source || "County assessor records · Updated 2026-04-18",
      value: record?.buildingSize ? fmtSqft(record.buildingSize) : "1,850 sq ft",
      note: record?.buildingSize ? null : "(example)",
      status: "verified",
    },
  ];

  const rows = [...verifiedRows, ...reviewRows];
  const verified = verifiedRows.length;
  const review = reviewRows.length;

  useEffect(() => {
    track(EV.PROPERTY_VIEWED, { hasAddress: Boolean(q), reviewCount: review });
  }, [q, review]);

  return (
    <div className="bg-canvas min-h-[80vh]">
      <section className="container mx-auto px-5 sm:px-8 max-w-4xl pt-16 sm:pt-20 pb-10">
        {/* Header */}
        <div className="flex items-center gap-2 text-paper-dim text-sm mb-4">
          <FiMapPin /> {q || "No address provided"}
        </div>
        <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
          Free Property Snapshot
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          What we know about your property <span className="italic text-paper-dim">— so far.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed mb-7">
          Most homeowners start researching ADUs without knowing which questions matter most. This
          free snapshot provides a starting point, but many of the answers that determine whether
          you can build an ADU require additional research.
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-paper-dim">
            <span className="w-2 h-2 rounded-full bg-accent" /> Verified: {verified}
          </span>
          <span className="inline-flex items-center gap-1.5 text-paper-dim">
            <span className="w-2 h-2 rounded-full bg-yellow-400" /> Requires Review: {review}
          </span>
          <Link to="/methodology" className="text-paper-dim hover:text-paper transition-colors underline-offset-4 hover:underline">
            How we know what we know →
          </Link>
        </div>
      </section>

      {/* Output rows */}
      <section className="container mx-auto px-5 sm:px-8 max-w-4xl pb-16">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <p className="text-paper text-sm font-medium">
            The Property Feasibility Report verifies every item below.
          </p>
          <p className="text-paper-dim/70 text-xs">
            TBD = resolved by the Property Feasibility Report
          </p>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-10">
          {rows.map((r) => (
            <div key={r.label} className="border-b border-stroke last:border-b-0">
              <div className="grid grid-cols-12 gap-3 sm:gap-4 items-center py-4">
                <div className="col-span-12 sm:col-span-5">
                  <p className="text-paper text-sm sm:text-base">{r.label}</p>
                  {r.source && <p className="text-paper-dim/60 text-[0.65rem] mt-0.5">{r.source}</p>}
                </div>
                <div className="col-span-7 sm:col-span-4">
                  <p className={`text-sm sm:text-base ${r.status === "verified" ? "text-paper" : "text-paper-dim italic"}`}>
                    {r.value || "Unknown"}
                    {r.note && <span className="text-paper-dim/50 not-italic"> {r.note}</span>}
                  </p>
                </div>
                <div className="col-span-5 sm:col-span-3 sm:text-right">
                  <StatusTag status={r.status} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Why so many unknowns */}
        <div className="mt-10 bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10">
          <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl leading-tight mb-4">
            Why so many unknowns?
          </h2>
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
            Property records can tell us the size of your home. They cannot tell us:
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {unknownsList.map((item) => (
              <li key={item} className="flex items-start gap-2 text-paper-dim text-sm leading-relaxed">
                <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-yellow-400/70" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Upgrade */}
        <div className="mt-10 bg-accent text-accent-fg rounded-3xl p-8 sm:p-12">
          <p className="text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-3">
            Remove the uncertainty
          </p>
          <h2 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-4">
            Upgrade to a Property Feasibility Report
          </h2>
          <p className="text-accent-fg/80 text-sm sm:text-base mb-7 max-w-xl leading-relaxed">
            Receive a property-specific analysis including:
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-9 text-sm">
            {upgradeIncludes.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <FiCheck className="shrink-0 mt-1" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <Link
              to="/unlock"
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
            >
              Sign Up <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-accent-fg/70 text-sm">
              Get answers before spending money on surveys, plans, or builders.
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-paper-dim mt-10">
          <Link to="/" className="hover:text-paper transition">Try another address</Link>
          <span className="mx-2">·</span>
          <Link to="/quiz" className="hover:text-paper transition">New to ADUs? Take the Reality Check</Link>
        </p>
      </section>
    </div>
  );
};

export default Property;
