import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiClipboard, FiUsers } from "react-icons/fi";

const pillars = [
  {
    Icon: FiBookOpen,
    title: "An ADU Course",
    desc: "Learn the process and the products before you spend.",
  },
  {
    Icon: FiClipboard,
    title: "A Personalized Property Feasibility Report",
    desc: "Your lot, your zoning, your buildable area.",
  },
  {
    Icon: FiUsers,
    title: "Professional Profiles",
    desc: "National and local builders and suppliers, for less than the cost of a typical survey.",
  },
];

const steps = [
  {
    n: "01",
    title: "Understand Your Property",
    desc: "Access your property's zoning regulations, setbacks, buildable area, and site considerations.",
  },
  {
    n: "02",
    title: "Explore Your ADU Options",
    desc: "Compare 25+ ADU types, construction methods, costs, and benefits.",
  },
  {
    n: "03",
    title: "Estimate Costs and Timelines",
    desc: "Understand pre-site costs, permits, inspections, utility connections, and realistic project timelines.",
  },
  {
    n: "04",
    title: "Obtain a Property Feasibility Report",
    desc: "Use GIS property data and zoning overlays to understand what may realistically fit on your property.",
  },
  {
    n: "05",
    title: "Compare Builders With Confidence",
    desc: "Use property-specific information to evaluate builder proposals and make informed decisions.",
  },
];

const HowToAdu = () => {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-canvas pt-24 sm:pt-28 pb-10 sm:pb-12 border-b border-stroke">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/8 blur-3xl animate-drift-glow" />

        <div className="relative container mx-auto px-5 sm:px-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 mb-4 animate-fade-up" style={{ animationDelay: "0ms" }}>
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">
              The ADU process
            </span>
          </div>

          <h1
            className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            How do you <span className="italic">ADU?</span>
          </h1>

          <p
            className="mt-4 sm:mt-5 text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            Building an ADU is more than choosing a structure and{" "}
            <span className="text-paper">hiring a builder.</span>
          </p>

          <div
            className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm animate-fade-up"
            style={{ animationDelay: "380ms" }}
          >
            <a href="#pillars" className="inline-flex items-center gap-1.5 text-paper hover:text-accent transition-colors">
              What ADUAtlas gives you <FiArrowRight className="text-xs" />
            </a>
            <span className="text-paper-dim/40">·</span>
            <a href="#steps" className="inline-flex items-center gap-1.5 text-paper-dim hover:text-paper transition-colors">
              The 5 steps
            </a>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="pillars" className="bg-canvas py-16 sm:py-20 border-t border-stroke scroll-mt-20">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            What ADUAtlas gives you
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-snug tracking-tight max-w-3xl">
            How ADUAtlas prepares homeowners before they build.
          </h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mt-5 max-w-2xl">
            An ADU Course, a personalized Property Feasibility Report, and access to professional profiles, including national and local builders and suppliers, for less than the cost of a typical survey.
          </p>

          <div className="grid md:grid-cols-3 gap-4 sm:gap-5 mt-10 sm:mt-12">
            {pillars.map((p) => {
              const { Icon } = p;
              return (
                <div
                  key={p.title}
                  className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent/40 transition-colors"
                >
                  <span className="text-accent text-2xl block mb-4" aria-hidden>
                    <Icon />
                  </span>
                  <h3 className="font-display text-paper text-lg sm:text-xl leading-snug mb-2">
                    {p.title}
                  </h3>
                  <p className="text-paper-dim text-sm sm:text-base leading-relaxed">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section id="steps" className="bg-canvas py-16 sm:py-24 border-t border-stroke scroll-mt-20">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            The 5 steps
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-snug tracking-tight max-w-2xl mb-10 sm:mb-12">
            From property unknown to project ready.
          </h2>

          <div className="space-y-px">
            {steps.map((s) => (
              <div
                key={s.n}
                className="grid grid-cols-12 gap-3 sm:gap-7 py-6 sm:py-7 border-t border-stroke last:border-b"
              >
                <div className="col-span-12 sm:col-span-2">
                  <span className="font-display text-paper-dim text-2xl sm:text-3xl tabular-nums">
                    {s.n}
                  </span>
                </div>
                <div className="col-span-12 sm:col-span-10">
                  <h3 className="font-display font-medium text-paper text-lg sm:text-xl lg:text-2xl leading-snug mb-2">
                    {s.title}
                  </h3>
                  <p className="text-paper-dim text-base leading-relaxed max-w-2xl">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closer */}
      <section className="bg-canvas py-16 sm:py-24 border-t border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-3xl text-center">
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-snug tracking-tight mb-5">
            Learn before you build.
          </h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-9">
            A builder can manage the construction process, but homeowners still need to understand the project, costs, and options. The more prepared you are before construction begins, the fewer surprises you will face later.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/unlock"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              Start the ADU Course — $99
              <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/course-outline"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-stroke text-paper font-medium hover:border-paper-dim transition"
            >
              See the course outline
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HowToAdu;
