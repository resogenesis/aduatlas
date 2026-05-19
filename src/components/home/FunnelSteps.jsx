import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";

const steps = [
  {
    n: "01",
    title: "Check your property",
    desc: "Type your address. Get an instant snapshot of lot size, what's likely buildable, and a rough cost band, with confidence labels on every line.",
  },
  {
    n: "02",
    title: "See what's verified vs. estimated",
    desc: "Free output is honest about what we know, what we're modeling, and what still needs verification. No fake confidence.",
  },
  {
    n: "03",
    title: "Unlock the Feasibility Report",
    desc: "$399 verifies every line, names your real costs and risks, and produces a builder-ready packet for apples-to-apples bids. 7-day refund.",
  },
];

const StepCard = ({ s, i }) => {
  const ref = useReveal(i * 120);
  return (
    <div
      ref={ref}
      className="bg-surface-1-solid border border-stroke rounded-2xl p-7 sm:p-8 relative group hover:-translate-y-1 hover:border-accent/40 transition-all duration-300"
    >
      <span className="font-display text-paper-dim text-3xl mb-4 block group-hover:text-accent transition-colors">
        {s.n}
      </span>
      <h3 className="font-display text-paper text-xl sm:text-2xl leading-snug mb-3">{s.title}</h3>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed">{s.desc}</p>
    </div>
  );
};

const FunnelSteps = () => {
  const headRef = useReveal(0);
  const ctaRef = useReveal(360);
  return (
    <section className="bg-canvas py-24 sm:py-32 border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
        <div ref={headRef} className="mb-14 sm:mb-20 max-w-2xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            How it works
          </p>
          <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Curiosity to <span className="italic">buildable plan</span> in three moves.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 sm:gap-6 mb-14">
          {steps.map((s, i) => <StepCard key={s.n} s={s} i={i} />)}
        </div>

        <div ref={ctaRef} className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
          >
            Check my property <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <span className="text-paper-dim text-sm">
            No signup · No credit card · Honest about what we don't know yet
          </span>
        </div>
      </div>
    </section>
  );
};

export default FunnelSteps;
