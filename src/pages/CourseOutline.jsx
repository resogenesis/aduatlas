import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiPlayCircle, FiFileText, FiHelpCircle, FiImage } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";

const moduleIncludes = [
  { Icon: FiPlayCircle, label: "Short video lessons (3–7 min each)" },
  { Icon: FiFileText, label: "PDF lesson notes" },
  { Icon: FiHelpCircle, label: "Short quiz at the end of each module" },
  { Icon: FiImage, label: "Selected modules include photos and videos" },
];

const modules = [
  {
    n: "01",
    title: "ADU Basics",
    desc: "What an ADU is, the main types, and why homeowners build them.",
    topics: [
      "What is an ADU? — definitions, detached vs. attached, JADUs, tiny homes vs. ADUs, common uses",
      "Why homeowners build — family housing, aging parents, adult children, rental income, office & guest space",
    ],
  },
  {
    n: "02",
    title: "Understanding City & State ADU Regulations",
    desc: "The state, local, and HOA rules that decide what you can build.",
    topics: [
      "Why location matters — state rules vs. local zoning, city-specific regulations, HOA considerations",
      "Key regulations — setbacks, height limits, size limits, lot coverage, parking, utility requirements",
      "Why most homeowners get confused",
    ],
  },
  {
    n: "03",
    title: "The 10-Step ADU Process",
    desc: "Learn → Explore → Plan → Build, mapped end to end.",
    topics: [
      "Step-by-step roadmap: education, feasibility, budgeting, ADU selection, survey, site plan, builder selection, permits, construction, final inspection",
    ],
  },
  {
    n: "04",
    title: "Explore 25+ ADU Types & Construction Methods",
    tag: "Extensive ADU photos & videos",
    desc: "Every major build method and ADU style, compared on cost and value.",
    topics: [
      "Methods — stick-built, modular, prefab, panelized, SIP, manufactured",
      "Specialty ADUs — container homes, cabin kits, bunkies, timber frame, A-frame, dome homes, Quonset huts",
      "Cost comparison, pros and cons",
    ],
  },
  {
    n: "05",
    title: "Pre-Site Preparation & Budgets",
    tag: "Major value driver",
    desc: "The pre-site costs most homeowners never hear about — until they do.",
    topics: [
      "Costs most homeowners miss or overlook — survey, site plan, utilities, excavation, concrete, retaining walls, tree removal, drainage",
      "Real examples",
    ],
  },
  {
    n: "06",
    title: "ADU FAQ",
    desc: "Straight answers to the questions homeowners ask most.",
    topics: [
      "Common ADU questions, answered",
    ],
  },
  {
    n: "07",
    title: "False Starts",
    tag: "NAPE",
    desc: "National ADU Property Evaluation — knowing when to stop before you spend.",
    topics: [
      "The National ADU Property Evaluation (NAPE)",
      "If the pre-site worksheet shows it could cost $75k, would you still move forward?",
    ],
  },
  {
    n: "08",
    title: "Builder Preparation",
    desc: "Walk into builder conversations ready, not guessing.",
    topics: [
      "When to contact builders, questions to ask, red flags",
      "How to compare quotes, and why builders need your property information",
    ],
    note: "Before requesting builder quotes, obtain your ADUAtlas Property Feasibility Study.",
  },
  {
    n: "09",
    title: "Property Feasibility Report Packet",
    desc: "What the packet includes — and why it saves you time and money.",
    topics: [
      "GIS property diagram with local zoning applied — dimensions, existing footprint, overlays, setbacks, largest possible ADU placement",
      "4 interactive worksheets — budget tools, timelines, permits, inspections",
      "NAPE score, plus a utility professional contact to mark your utility access",
    ],
  },
  {
    n: "10",
    title: "Moving Forward Prepared",
    desc: "Put it all together and take the next step with confidence.",
    topics: [
      "Selecting an ADU, comparing builders from the ADUAtlas Professional Profiles, planning realistically",
      "Next steps → Get your ADUAtlas Property Feasibility Study",
    ],
  },
];

const ModuleCard = ({ m, i }) => {
  const ref = useReveal(i * 50);
  return (
    <div
      ref={ref}
      className="group bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="font-display text-paper-dim text-2xl sm:text-3xl tabular-nums group-hover:text-accent transition-colors">
          {m.n}
        </span>
        {m.tag && (
          <span className="text-[10px] sm:text-xs font-medium tracking-wider uppercase text-accent border border-accent/40 rounded-full px-2.5 py-1">
            {m.tag}
          </span>
        )}
      </div>
      <h3 className="font-display text-paper text-lg sm:text-xl leading-snug mb-2">{m.title}</h3>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed">{m.desc}</p>
      {m.topics && (
        <ul className="mt-4 space-y-2">
          {m.topics.map((t) => (
            <li key={t} className="flex items-start gap-2 text-paper-dim/90 text-sm leading-relaxed">
              <FiCheck className="shrink-0 mt-0.5 text-accent" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {m.note && (
        <p className="mt-4 text-sm italic text-accent/90 border-l-2 border-accent/40 pl-3">
          {m.note}
        </p>
      )}
    </div>
  );
};

const CourseOutline = () => {
  const headRef = useReveal(0);
  const stripRef = useReveal(120);
  const ideaRef = useReveal(120);
  const ctaRef = useReveal(180);

  return (
    <div className="w-full bg-canvas">
      {/* HERO */}
      <section className="pt-28 sm:pt-32 lg:pt-40 pb-14 sm:pb-20 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <div ref={headRef}>
            <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
              ADUAtlas ADU Course
            </p>
            <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-3xl">
              What does a homeowner need to know before spending money on an ADU?
            </h1>
            <p className="mt-6 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed">
              The course won't make you an ADU expert. It will help you understand the process, avoid mistakes, and see why a feasibility study matters — for homeowners in the pre-construction planning phase, nationwide.
            </p>
          </div>

          {/* Price + access strip */}
          <div
            ref={stripRef}
            className="mt-10 sm:mt-12 grid sm:grid-cols-3 gap-px bg-stroke border border-stroke rounded-2xl overflow-hidden"
          >
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Course fee</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">$99</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                Your $99 is credited toward the $399 Property Feasibility Report when you upgrade within 90 days.
              </p>
            </div>
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Access</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">Forever</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                Yours to keep. Renew the latest information any year for $99.
              </p>
            </div>
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Length</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">10 modules</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                2–3 hours total · 25–35 short videos, 3–7 minutes each.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT EACH MODULE INCLUDES */}
      <section className="py-16 sm:py-20 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Each module includes
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-10 max-w-2xl">
            Short, structured, and built for retention.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {moduleIncludes.map((inc) => (
              <div
                key={inc.label}
                className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6 flex items-start gap-3"
              >
                <span className="text-accent text-xl mt-0.5 shrink-0" aria-hidden>
                  <inc.Icon />
                </span>
                <p className="text-paper text-sm sm:text-base leading-snug">{inc.label}</p>
              </div>
            ))}
          </div>
          <p className="text-paper-dim text-sm mt-6">
            Module 4 includes extensive ADU photos and videos.
          </p>
        </div>
      </section>

      {/* MODULE LIST */}
      <section className="py-16 sm:py-24 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            The 10 modules
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-10 max-w-2xl">
            What you'll learn.
          </h2>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
            {modules.map((m, i) => <ModuleCard key={m.n} m={m} i={i} />)}
          </div>

          <p className="text-paper-dim text-sm mt-8">
            The 10-module ADUAtlas course. Your access never expires. Renew any year for $99 to refresh with the latest regulations, types, and costs.
          </p>
        </div>
      </section>

      {/* CORE IDEA + CTA */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <div
            ref={ideaRef}
            className="bg-surface-1-solid border border-stroke rounded-2xl p-7 sm:p-10"
          >
            <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
              The one idea this course reinforces
            </p>
            <p className="font-display text-paper text-2xl sm:text-3xl leading-snug tracking-tight max-w-3xl">
              Education tells you how the ADU process works. The Property Feasibility Study tells you how it applies to <span className="italic">your</span> property.
            </p>
          </div>

          <div ref={ctaRef} className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Start the ADU Course — $99
              <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-paper-dim text-sm inline-flex items-center gap-2">
              <FiCheck className="text-accent" />
              $99 credited toward your $399 Report when you upgrade within 90 days
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CourseOutline;
