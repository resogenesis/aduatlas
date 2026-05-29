import { Link } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiHelpCircle, FiShield } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";

const levels = [
  {
    icon: FiCheck,
    pillClass: "bg-accent/15 text-accent border-accent/30",
    label: "Verified",
    when: "Pulled directly from an authoritative public source.",
    examples: [
      "County parcel records (lot size, owner, dimensions)",
      "City zoning maps and ADU code text",
      "Official permit fee schedules",
    ],
  },
  {
    icon: FiHelpCircle,
    pillClass: "bg-yellow-400/10 text-yellow-300 border-yellow-400/30",
    label: "Estimated",
    when: "Modeled from public data and standard assumptions.",
    examples: [
      "Max ADU size from the city's percent-of-primary rule applied to your lot",
      "Cost ranges from regional builder bids and prefab market data",
      "Setbacks from the local minimum, before easements are checked",
    ],
  },
  {
    icon: FiAlertTriangle,
    pillClass: "bg-red-400/10 text-red-300 border-red-400/30",
    label: "Unknown",
    when: "Requires on-site verification or a closer look at title or city records.",
    examples: [
      "Sewer line distance to your specific pad",
      "HOA or deed restrictions recorded against the parcel",
      "Soil bearing or slope-related foundation needs",
    ],
  },
];

const sources = [
  {
    name: "County parcel data",
    cadence: "Refreshed nightly where available",
    coverage: "Lot size, owner, dimensions",
  },
  {
    name: "City zoning maps and ADU code",
    cadence: "Reviewed per jurisdiction we cover",
    coverage: "Districts, overlays, base ADU rules",
  },
  {
    name: "Permit fee schedules",
    cadence: "Reviewed quarterly per city",
    coverage: "Posted by the city's permit office",
  },
  {
    name: "Regional cost models",
    cadence: "Refreshed quarterly",
    coverage: "Site prep + structure ranges by metro",
  },
  {
    name: "ADU code amendments",
    cadence: "Tracked as states and cities publish",
    coverage: "City and county ordinance changes (state baseline where one exists)",
  },
];

const notDoing = [
  "Legal advice. We are not lawyers.",
  "Engineering, structural, or geotechnical analysis.",
  "Appraisal or estimated future market value of your home.",
  "Permit determination. Only your city's permit office can issue or deny.",
  "Contractor licensing verification. We don't replace your due diligence.",
  "Lender prequalification or financing approval.",
];

const Methodology = () => {
  const heroRef = useReveal(0);

  return (
    <div className="bg-canvas">
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-10 sm:pb-12 border-b border-stroke">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/8 blur-3xl animate-drift-glow" />

        <div ref={heroRef} className="relative container mx-auto px-5 sm:px-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 mb-4 animate-fade-up">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">
              Methodology
            </span>
          </div>
          <h1
            className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-3xl animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            Honest about what's <span className="italic">verified, estimated, and unknown.</span>
          </h1>
          <p
            className="mt-5 text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            Every datapoint we show carries a confidence label. This page explains what each label means, where the data comes from, and exactly what we will and won't claim to know.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-14 sm:py-20 space-y-6">

        {/* Confidence levels */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <p className="text-accent text-xs uppercase tracking-[0.2em] mb-5">The three labels</p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-9">
            What each chip means on your snapshot.
          </h2>
          <div className="space-y-7">
            {levels.map(({ icon: Icon, pillClass, label, when, examples }) => (
              <div key={label} className="grid sm:grid-cols-12 gap-4 sm:gap-7 py-5 border-t border-stroke first:border-t-0 first:pt-0">
                <div className="sm:col-span-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${pillClass}`}>
                    <Icon className="text-xs" /> {label}
                  </span>
                </div>
                <div className="sm:col-span-9">
                  <p className="text-paper text-base sm:text-lg mb-3">{when}</p>
                  <ul className="space-y-1.5">
                    {examples.map((e) => (
                      <li key={e} className="flex items-start gap-2 text-paper-dim text-sm">
                        <span className="text-paper-dim/60 mt-1 shrink-0">·</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What raises a row */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <p className="text-accent text-xs uppercase tracking-[0.2em] mb-5">The path to verified</p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-5">
            Every Estimated or Unknown row has a path to Verified.
          </h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-7 max-w-2xl">
            Click "What raises this?" on any row in your snapshot. We show you exactly what we'd do to verify it, and which paid tier delivers that verification. No hidden steps. No buying twice.
          </p>
          <div className="bg-canvas border border-stroke rounded-2xl p-6">
            <p className="text-paper-dim text-[0.65rem] font-semibold tracking-[0.2em] uppercase mb-2">Example</p>
            <p className="text-paper text-sm sm:text-base mb-2">
              <span className="text-paper-dim">Sewer access:</span> Unknown
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 mx-2 align-middle" />
              <span className="text-red-300 text-xs uppercase tracking-wider">Low</span>
            </p>
            <p className="text-paper-dim text-sm leading-relaxed italic">
              "We pull your city's sewer line map, measure the distance from the closest tie-in to the proposed ADU pad, and flag whether a gravity tie-in works or a grinder pump is required (a $4K to $8K cost difference)."
            </p>
          </div>
        </section>

        {/* Data sources + cadence */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <p className="text-accent text-xs uppercase tracking-[0.2em] mb-5">Sources and cadence</p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-7">
            Where the data comes from. When it's refreshed.
          </h2>
          <div className="grid sm:grid-cols-2 gap-px bg-stroke rounded-2xl overflow-hidden">
            {sources.map((s) => (
              <div key={s.name} className="bg-canvas p-5">
                <p className="text-paper text-sm font-medium mb-1">{s.name}</p>
                <p className="text-paper-dim text-xs mb-1">{s.cadence}</p>
                <p className="text-paper-dim/60 text-xs">{s.coverage}</p>
              </div>
            ))}
          </div>
          <p className="text-paper-dim text-xs italic mt-6 leading-relaxed">
            Every datapoint in your output shows a "last updated" date. If it looks stale, we haven't refreshed that source recently. We'd rather show you the date than pretend it's fresh.
          </p>
          <p className="text-paper-dim text-xs italic mt-3 leading-relaxed">
            Coverage expands jurisdiction by jurisdiction. Most ADU rules live at the city, county, and ZIP level. If your city's ADU code isn't yet in our verified set, we will surface any state baseline where one exists and flag what we don't yet know.
          </p>
        </section>

        {/* What we don't do */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <div className="flex items-center gap-2 text-accent text-xs uppercase tracking-[0.2em] mb-5">
            <FiShield /> What we don't do
          </div>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-5">
            Pre construction guidance. <span className="italic text-paper-dim">Not legal, engineering, or appraisal.</span>
          </h2>
          <p className="text-paper-dim text-base leading-relaxed mb-7 max-w-2xl">
            ADUAtlas is a planning and decision-support tool. We help you understand what's possible and what to verify next. We do not replace any of the following:
          </p>
          <ul className="space-y-3">
            {notDoing.map((line) => (
              <li key={line} className="flex items-start gap-3 text-paper-dim text-sm sm:text-base">
                <span className="text-stroke mt-1 shrink-0">×</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-paper-dim text-xs italic mt-7 leading-relaxed max-w-2xl">
            Always confirm with your city, a licensed architect or engineer, your lender, and a qualified contractor before committing to a design or breaking ground. Our reports are built to make those conversations sharper, not to replace them.
          </p>
        </section>

        {/* CTA */}
        <section className="bg-accent text-accent-fg rounded-3xl p-8 sm:p-12 text-center">
          <h2 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-4">
            Now go check your property.
          </h2>
          <p className="text-accent-fg/80 text-base sm:text-lg max-w-xl mx-auto mb-7">
            Honest output. Source dated. Confidence labeled. Free to start.
          </p>
          <Link
            to="/"
            className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
          >
            Property Snapshot <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </section>
      </div>
    </div>
  );
};

export default Methodology;
