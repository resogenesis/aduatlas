import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";

const steps = [
  {
    n: "01",
    title: "Learn before you build",
    lede: "Take the How to ADU Course.",
    intro: "You will learn:",
    bullets: [
      "City, county, and ZIP-level ADU regulations",
      "25+ ADU types, construction methods, and a video library",
      "Budget planning and timelines, including pre-site and utility costs",
      "Common homeowner mistakes in the FAQ chapter",
    ],
  },
  {
    n: "02",
    title: "Get a Property Feasibility Report",
    lede: "The study provides information builders need to discuss your project. It includes — but is not limited to — the following:",
    bullets: [
      "Existing structure placement",
      "Lot dimensions",
      "Local ADU zoning overlays",
      "Setback requirements",
      "Potential ADU placement",
      "Interactive pre-site budget worksheet",
      "Pre-site planning considerations",
    ],
  },
  {
    n: "03",
    title: "Move forward prepared",
    lede: "After completing the course and receiving your Property Feasibility Report, you will be better prepared to discuss your project with builders.",
    bullets: [
      "Compare builder quotes more effectively",
      "Understand potential project costs",
      "Evaluate ADU options",
      "Plan for pre-site requirements",
      "Make informed decisions before construction begins",
    ],
  },
];

const StepCard = ({ s, i }) => {
  const ref = useReveal(i * 120);
  return (
    <div
      ref={ref}
      className="bg-surface-1-solid border border-stroke rounded-2xl p-7 sm:p-8 relative group hover:border-accent/40 transition-all duration-300"
    >
      <span className="font-display text-paper-dim text-3xl mb-4 block group-hover:text-accent transition-colors">
        {s.n}
      </span>
      <h3 className="font-display text-paper text-xl sm:text-2xl leading-snug mb-2">{s.title}</h3>
      {s.lede && (
        <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-4">{s.lede}</p>
      )}
      {s.intro && (
        <p className="text-paper text-sm font-medium mb-2">{s.intro}</p>
      )}
      <ul className="space-y-2 mb-4">
        {s.bullets.map((b) => (
          <li key={b} className="flex gap-2.5 text-paper-dim text-sm sm:text-base leading-snug">
            <FiCheck className="text-accent shrink-0 mt-1" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {s.closer && (
        <p className="text-paper text-sm sm:text-base leading-relaxed pt-3 border-t border-stroke">
          {s.closer}
        </p>
      )}
    </div>
  );
};

const FunnelSteps = () => {
  const headRef = useReveal(0);
  const ctaRef = useReveal(360);
  return (
    <section className="bg-canvas py-24 sm:py-32 border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl">
        <div ref={headRef} className="mb-14 sm:mb-20 max-w-2xl">
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight">
            How ADUAtlas works.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 sm:gap-6 mb-14 items-start">
          {steps.map((s) => <StepCard key={s.n} s={s} i={parseInt(s.n, 10) - 1} />)}
        </div>

        <div ref={ctaRef} className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Link
            to="/unlock"
            className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
          >
            Start the ADU Course <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/course-outline"
            className="group inline-flex items-center gap-1.5 text-paper hover:text-accent text-sm font-medium transition-colors"
          >
            See full course outline <FiArrowRight className="text-xs group-hover:translate-x-1 transition-transform" />
          </Link>
          <span className="text-paper-dim text-sm">
            $99 · Lifetime access · credit toward Property Feasibility Report
          </span>
        </div>
      </div>
    </section>
  );
};

export default FunnelSteps;
