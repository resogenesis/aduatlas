import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import AddressIntake from "./AddressIntake";

const QuizHero = () => {
  // Animated sample readiness score: 0 → 47 with cubic ease-out.
  const [score, setScore] = useState(0);
  const target = 47;

  useEffect(() => {
    let raf;
    let start;
    const animate = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / 1700, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setScore(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;

  return (
    <section className="relative overflow-hidden bg-canvas pt-28 sm:pt-32 lg:pt-40 pb-20 sm:pb-24 lg:pb-32">
      {/* drifting glows */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-accent/10 blur-3xl animate-drift-glow" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-accent/5 blur-3xl animate-drift-glow" style={{ animationDelay: "-7s" }} />

      <div className="relative container mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">

        {/* LEFT: typographic statement + address intake */}
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 mb-7 sm:mb-8 animate-fade-up" style={{ animationDelay: "0ms" }}>
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs sm:text-sm font-medium tracking-[0.2em] uppercase">
              Pre-construction intelligence for homeowners
            </span>
          </div>

          <h1
            className="font-display font-medium text-paper text-[2.6rem] sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[1.02] tracking-tight max-w-4xl animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            Find out what you can build <span className="italic">on your property.</span>
          </h1>

          <p
            className="mt-7 sm:mt-9 text-paper-dim text-base sm:text-lg lg:text-xl max-w-xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            Get a real answer on feasibility, cost, and next steps — before talking to a builder, ordering a $500 survey, or drawing a single line.
          </p>

          <div className="mt-9 sm:mt-12 animate-fade-up" style={{ animationDelay: "380ms" }}>
            <AddressIntake size="lg" />
          </div>

          <div
            className="mt-7 flex flex-wrap items-center gap-4 sm:gap-6 text-sm animate-fade-up"
            style={{ animationDelay: "520ms" }}
          >
            <span className="text-paper-dim">No signup required</span>
            <span className="text-paper-dim/40">·</span>
            <Link to="/quiz" className="text-paper hover:text-accent transition-colors inline-flex items-center gap-1.5">
              New to ADUs? Start here <FiArrowRight className="text-xs" />
            </Link>
          </div>
        </div>

        {/* RIGHT: animated sample-score gauge */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div
            className="relative animate-fade-up animate-float-soft"
            style={{ animationDelay: "300ms" }}
          >
            <div aria-hidden className="absolute inset-0 rounded-3xl bg-accent/15 blur-2xl" />

            <div className="relative bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-8 w-[19rem] sm:w-[21rem] overflow-hidden">
              {/* shine sweep */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -inset-y-2 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-accent/15 to-transparent animate-shine-sweep" />
              </div>

              <div className="relative flex items-center justify-between mb-5">
                <span className="text-xs uppercase tracking-[0.2em] text-paper-dim">Sample score</span>
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
              </div>

              <div className="relative w-full aspect-square">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#2A2D26" strokeWidth="6" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke="#C6F24E" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 0.05s linear" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display font-medium text-paper text-7xl sm:text-8xl leading-none tabular-nums">
                    {score}
                  </span>
                  <span className="text-paper-dim text-xs uppercase tracking-[0.2em] mt-2">/ 100</span>
                </div>
              </div>

              <div className="relative mt-5 pt-5 border-t border-stroke">
                <p className="text-paper-dim text-xs uppercase tracking-wider mb-1.5">Result</p>
                <p className="text-paper font-display text-2xl">Foundational gaps</p>
                <p className="text-paper-dim text-sm mt-1.5 leading-relaxed">
                  Three things to fix before talking to a builder.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
};

export default QuizHero;
