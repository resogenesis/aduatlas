import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiClock } from "react-icons/fi";

const QuizHero = () => {
  const [score, setScore] = useState(0);
  const target = 47;

  useEffect(() => {
    let raf;
    let start;
    const animate = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / 1500, 1);
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
      {/* ambient gradient blob */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-accent/5 blur-3xl" />

      <div className="relative container mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* LEFT: typographic statement */}
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 mb-6 sm:mb-8">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs sm:text-sm font-medium tracking-[0.2em] uppercase">
              The 2-Minute ADU Reality Check
            </span>
          </div>

          <h1 className="font-display font-medium text-paper text-[2.6rem] sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[1.02] tracking-tight">
            Most homeowners
            <br />
            think they're ready.
            <br />
            <span className="italic">They're not.</span>
          </h1>

          <p className="mt-7 sm:mt-9 text-paper-dim text-base sm:text-lg lg:text-xl max-w-xl leading-relaxed">
            Find out before you spend $500 on a survey or call a single builder. Get your personalized ADU Readiness Score in under two minutes.
          </p>

          <div className="mt-9 sm:mt-12 flex flex-wrap items-center gap-4">
            <Link
              to="/quiz"
              className="group inline-flex items-center gap-3 px-7 sm:px-9 py-4 sm:py-5 bg-accent text-accent-fg text-base sm:text-lg font-semibold rounded-full hover:bg-paper transition-colors duration-200"
            >
              Start Your ADU Plan
              <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="inline-flex items-center gap-2 text-paper-dim text-sm">
              <FiClock /> ~2 minutes · No signup
            </span>
          </div>
        </div>

        {/* RIGHT: live readiness gauge */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-accent/10 blur-2xl" />
            <div className="relative bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-10 w-[20rem] sm:w-[22rem]">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs uppercase tracking-[0.2em] text-paper-dim">Sample Score</span>
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
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display font-medium text-paper text-7xl sm:text-8xl leading-none">{score}</span>
                  <span className="text-paper-dim text-xs uppercase tracking-[0.2em] mt-2">/ 100</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-stroke">
                <p className="text-paper-dim text-xs uppercase tracking-wider mb-2">Result</p>
                <p className="text-paper font-display text-2xl">Foundational gaps</p>
                <p className="text-paper-dim text-sm mt-2 leading-relaxed">
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
