import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

const steps = [
  {
    n: "01",
    title: "Take the Reality Check",
    desc: "Seven questions. Two minutes. No signup. Zero credit card.",
  },
  {
    n: "02",
    title: "Get your Readiness Score",
    desc: "Personalized score, with the top three risks specific to your situation.",
  },
  {
    n: "03",
    title: "Unlock the full plan — $79.99",
    desc: "6 chapters. 20+ modules. Feasibility study, GIS site plan, builder-ready RFP. 7-day refund.",
  },
];

const FunnelSteps = () => {
  return (
    <section className="bg-surface-1-solid py-24 sm:py-32 border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">

        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 mb-14 sm:mb-20">
          <div className="lg:col-span-5">
            <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
              How it works
            </p>
            <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
              From <span className="italic">"I'm curious"</span> to builder-ready in three moves.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:pt-3">
            <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-xl">
              Skip the YouTube rabbit hole and the four-hour city-website session. Atlas gives you the answers in the order they actually matter.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-stroke rounded-2xl overflow-hidden">
          {steps.map((s) => (
            <div key={s.n} className="bg-canvas p-7 sm:p-9 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <span className="font-display text-paper-dim text-2xl">{s.n}</span>
                <span className="w-8 h-px bg-stroke" />
              </div>
              <h3 className="font-display font-medium text-paper text-xl sm:text-2xl leading-snug mb-3">
                {s.title}
              </h3>
              <p className="text-paper-dim text-sm leading-relaxed flex-1">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Link
            to="/quiz"
            className="group inline-flex items-center gap-3 px-7 py-4 bg-accent text-accent-fg font-semibold rounded-full hover:bg-paper transition-colors"
          >
            Start the Reality Check
            <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <span className="text-paper-dim text-sm">
            ~2 minutes · No signup · No credit card to start
          </span>
        </div>
      </div>
    </section>
  );
};

export default FunnelSteps;
