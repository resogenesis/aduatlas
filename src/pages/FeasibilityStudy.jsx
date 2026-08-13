import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { track, EV } from "../lib/analytics";

// Tier 3 purchase page — "Personalized Property Feasibility Study".
// Public marketing page built from the approved purchase-page copy. The CTA
// deep-links to /unlock with the report tier preselected.

const DRAWING_FEATURES = [
  "Property dimensions",
  "Applicable ADU regulations",
  "Required setbacks",
  "Largest ADU that may be allowed",
  "Utility dots and distance markers",
];

const WORKSHEETS = [
  { n: 1, name: "Pre-Site Estimate", desc: "Organize the information needed to begin estimating site preparation and utility costs." },
  { n: 2, name: "Pre-Site Verification", desc: "Record verified information, measurements, fees, and estimates as you receive them." },
  { n: 3, name: "Builder Preparation", desc: "Prepare the property and project information builders need for a more productive conversation." },
  { n: 4, name: "Traditional Build", desc: "Organize and compare costs for a traditional site-built ADU." },
  { n: 5, name: "Modular/Prefab Build", desc: "Organize and compare the unit, delivery, installation, and completion costs for a modular or prefabricated ADU." },
  { n: 6, name: "Total ADU Project Cost", desc: "Combine your selected ADU or builder quote with pre-site costs, city fees, professional fees, and other known costs to create a realistic estimated total project cost." },
];

const Cta = ({ children, className = "" }) => (
  <Link
    to="/unlock"
    state={{ tier: "report" }}
    onClick={() => track(EV.TIER_SELECTED, { tier: "report", source: "feasibility-study-page" })}
    className={`group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors ${className}`}
  >
    {children} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
  </Link>
);

// Sample property drawing — a marketing illustration of what the buyer
// receives (per the approved mock): dimensioned lot, main house, possible
// ADU, compass, trees, and utility dots with a legend.
const SampleDrawing = () => (
  <svg viewBox="0 0 640 420" role="img" aria-label="Sample personalized property drawing: a 100 by 60 foot lot with the main house, the largest possible ADU, setbacks, a compass, and utility markers" className="w-full h-auto">
    {/* canvas */}
    <rect x="0" y="0" width="640" height="420" rx="16" className="fill-[#161814]" />
    {/* lot */}
    <rect x="70" y="60" width="500" height="290" className="fill-[#1E211C] stroke-[#C8C2B0]" strokeWidth="1.5" />
    {/* setback band (dashed) */}
    <rect x="94" y="84" width="452" height="242" fill="none" className="stroke-[#98B83A]" strokeWidth="1" strokeDasharray="5 4" />
    {/* dimension arrows */}
    <line x1="70" y1="40" x2="570" y2="40" className="stroke-[#C8C2B0]" strokeWidth="1" markerStart="url(#arr)" markerEnd="url(#arr)" />
    <text x="320" y="32" textAnchor="middle" className="fill-[#F5F1E8]" fontSize="13">100′</text>
    <line x1="46" y1="60" x2="46" y2="350" className="stroke-[#C8C2B0]" strokeWidth="1" />
    <text x="34" y="210" textAnchor="middle" className="fill-[#F5F1E8]" fontSize="13" transform="rotate(-90 34 210)">60′</text>
    {/* main house */}
    <rect x="130" y="130" width="200" height="150" className="fill-[#0E0F0C] stroke-[#F5F1E8]" strokeWidth="1.5" />
    <text x="230" y="210" textAnchor="middle" className="fill-[#F5F1E8]" fontSize="13" fontWeight="600">MAIN HOUSE</text>
    {/* possible ADU */}
    <rect x="415" y="150" width="105" height="110" fill="none" className="stroke-[#C6F24E]" strokeWidth="2" strokeDasharray="7 5" />
    <text x="467" y="200" textAnchor="middle" className="fill-[#C6F24E]" fontSize="11" fontWeight="600">POSSIBLE</text>
    <text x="467" y="216" textAnchor="middle" className="fill-[#C6F24E]" fontSize="11" fontWeight="600">ADU</text>
    {/* separation arrow */}
    <line x1="332" y1="205" x2="413" y2="205" className="stroke-[#C8C2B0]" strokeWidth="1" strokeDasharray="3 3" />
    {/* utility dots */}
    <circle cx="546" cy="180" r="5" fill="#5AB0FF" />
    <circle cx="546" cy="200" r="5" fill="#4CD08A" />
    <circle cx="546" cy="220" r="5" fill="#FF9D5A" />
    {/* trees */}
    <circle cx="105" cy="95" r="16" className="fill-[#2A3324]" />
    <circle cx="540" cy="320" r="18" className="fill-[#2A3324]" />
    <circle cx="360" cy="320" r="13" className="fill-[#2A3324]" />
    {/* compass */}
    <circle cx="597" cy="86" r="20" className="fill-[#0E0F0C] stroke-[#C8C2B0]" strokeWidth="1" />
    <text x="597" y="82" textAnchor="middle" className="fill-[#F5F1E8]" fontSize="11" fontWeight="700">N</text>
    <line x1="597" y1="88" x2="597" y2="100" className="stroke-[#C6F24E]" strokeWidth="2" />
    {/* legend */}
    <g fontSize="11" className="fill-[#C8C2B0]">
      <circle cx="150" cy="382" r="4" fill="#5AB0FF" /><text x="160" y="386">Water</text>
      <circle cx="230" cy="382" r="4" fill="#4CD08A" /><text x="240" y="386">Sewer</text>
      <circle cx="312" cy="382" r="4" fill="#FF9D5A" /><text x="322" y="386">Electrical</text>
      <line x1="400" y1="382" x2="424" y2="382" className="stroke-[#98B83A]" strokeWidth="1" strokeDasharray="5 4" /><text x="430" y="386">Setbacks</text>
    </g>
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
        <path d="M0,1 L7,4 L0,7" fill="none" className="stroke-[#C8C2B0]" strokeWidth="1" />
      </marker>
    </defs>
  </svg>
);

const FeasibilityStudy = () => (
  <div className="bg-canvas min-h-screen">
    {/* Hero */}
    <section className="border-b border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-16 sm:py-24 text-center">
        <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5">
          Tier 3 · Personalized
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          Personalized Property <span className="italic">Feasibility Study.</span>
        </h1>
        <p className="text-paper-dim text-lg sm:text-xl mb-2">Understand what may be possible before you build.</p>
        <p className="text-paper-dim text-base max-w-2xl mx-auto leading-relaxed mb-7">
          Before you choose an ADU or ask a builder for an estimate, you need to understand what may
          legally fit on your property. Your personalized study applies your property dimensions and
          the applicable ADU regulations to help you understand whether an ADU may be allowed — and
          the largest ADU that may be permitted.
        </p>
        <div className="font-display text-accent text-5xl sm:text-6xl mb-2">$399</div>
        <p className="text-paper-dim text-sm mb-7">
          Includes the ADUAtlas Course, builder profile access, your personalized property drawing,
          and six dynamic worksheets.
        </p>
        <Cta>Get your Feasibility Study</Cta>
        <p className="text-paper-dim/70 text-xs mt-4">
          Purchased the $99 course within the last 90 days? Your $99 credit may be applied to this purchase.
        </p>
      </div>
    </section>

    {/* Drawing */}
    <section className="container mx-auto px-5 sm:px-8 max-w-6xl py-14 sm:py-20">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-4 sm:p-6">
            <SampleDrawing />
          </div>
          <p className="text-paper-dim/70 text-xs leading-relaxed mt-3 text-center">
            Planning and educational tool. Final requirements and approval must be verified.
          </p>
        </div>
        <div>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-tight mb-4">
            Your personalized property drawing.
          </h2>
          <p className="text-paper-dim text-base leading-relaxed mb-6">
            You will receive a drawing like this one, customized with your property dimensions and
            applicable ADU regulations — your lot, the location of your main house, a compass, a
            legend of required setbacks and other requirements, and the largest ADU that may be
            allowed on your property.
          </p>
          <ul className="space-y-2.5 mb-6">
            {DRAWING_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-paper text-sm leading-relaxed">
                <FiCheck className="shrink-0 mt-0.5 text-accent" /> {f}
              </li>
            ))}
          </ul>
          <p className="text-paper-dim text-sm leading-relaxed">
            After a utility professional marks your utilities, you can add their locations to the
            drawing and estimate the distance between the utilities and the proposed ADU — the
            measurements that make your pre-site estimate realistic.
          </p>
        </div>
      </div>
    </section>

    {/* Six worksheets */}
    <section className="border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl py-14 sm:py-20">
        <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-tight text-center mb-10">
          Six dynamic worksheets.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WORKSHEETS.map((w) => (
            <div key={w.n} className="bg-surface-1-solid border border-stroke rounded-2xl p-6">
              <span className="inline-flex w-8 h-8 rounded-full bg-accent text-accent-fg font-display text-sm items-center justify-center mb-3">
                {w.n}
              </span>
              <h3 className="font-display text-paper text-lg mb-1.5">{w.name}</h3>
              <p className="text-paper-dim text-sm leading-relaxed">{w.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Closing CTA */}
    <section className="border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl py-16 sm:py-24 text-center">
        <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-tight mb-4">
          Learn the process. Understand your property. <span className="italic">Prepare to move forward.</span>
        </h2>
        <p className="text-paper-dim text-base leading-relaxed max-w-2xl mx-auto mb-8">
          ADUAtlas does not try to make homeowners ADU experts. We provide the education,
          personalized information, and planning tools homeowners need to understand the process,
          ask better questions, and have informed conversations with their city and builders.
        </p>
        <Cta>Get your personalized Feasibility Study — $399</Cta>
        <p className="text-paper-dim text-sm mt-6 italic">ADUAtlas builds better-prepared homeowners.</p>
        <p className="text-paper-dim/70 text-xs leading-relaxed mt-6 max-w-2xl mx-auto">
          The Property Feasibility Study is a planning and educational tool. It is not a survey,
          permit, or guarantee of approval. Final requirements and approval must be verified with
          the applicable local authority and qualified professionals.
        </p>
      </div>
    </section>
  </div>
);

export default FeasibilityStudy;
