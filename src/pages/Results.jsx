import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowRight, FiCheck, FiLock } from "react-icons/fi";
import { isComplete, loadAnswers } from "../funnel/quizStore";
import { calculateScore } from "../funnel/scoring";

const Results = () => {
  const navigate = useNavigate();
  const answers = useMemo(loadAnswers, []);

  useEffect(() => {
    if (!isComplete(answers)) {
      navigate("/quiz", { replace: true });
    }
    // INTEGRATION POINT (analytics): fire "results_viewed" event here.
  }, [answers, navigate]);

  if (!isComplete(answers)) return null;

  const { score, band, findings } = calculateScore(answers);

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl">

        <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5 text-center">
          Your ADU Readiness Report
        </p>
        <h1 className="font-display font-medium text-paper text-3xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-center mb-4">
          Your score: <span className="text-accent">{score}%</span>
          <br className="hidden sm:block" />
          <span className="italic text-paper-dim">Here's what you're missing.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg max-w-xl mx-auto text-center mb-12">
          Based on your ZIP, lot, budget, timeline, and what you do (and don't) know.
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12 mb-6">
          <div className="flex flex-col sm:flex-row items-center gap-10">
            <div className="relative w-44 h-44 shrink-0">
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
                <span className="font-display font-medium text-paper text-6xl leading-none">{score}</span>
                <span className="text-paper-dim text-xs uppercase tracking-[0.2em] mt-2">/ 100</span>
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Result</p>
              <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl mb-4">
                {band}
              </h2>
              <p className="text-paper-dim text-sm sm:text-base leading-relaxed">
                This is preliminary. Your full Feasibility Study refines this with GIS lot data, your local zoning rules, and pre-site cost estimates.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12 mb-6">
          <h3 className="font-display font-medium text-paper text-xl sm:text-2xl mb-6">
            What we found about your situation
          </h3>
          <ul className="space-y-5">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="font-display text-accent text-2xl leading-none shrink-0 w-7">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-paper-dim text-sm sm:text-base leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-accent text-accent-fg rounded-3xl p-8 sm:p-12">
          <div className="inline-flex items-center gap-2 mb-4 text-xs font-semibold tracking-[0.2em] uppercase">
            <FiLock /> Locked
          </div>
          <h3 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-4">
            Unlock the full plan + your Feasibility Study.
          </h3>
          <p className="text-accent-fg/80 mb-7 text-sm sm:text-base leading-relaxed max-w-xl">
            6 chapters. 20+ modules. GIS site plan. Pre-filled budget worksheets. Refined readiness score. Builder-ready RFP packet.
          </p>

          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-9 text-sm">
            {[
              "Full course: 6 chapters, 20+ modules",
              "GIS satellite view with lot dimensions",
              "Pre-filled pre-site cost worksheet",
              "Total budget worksheet with timelines",
              "Refined ADU Readiness Score",
              "Free utility-marking contact",
              "Builder/supplier matches by ZIP",
              "7-day full refund, no questions asked",
            ].map((item) => (
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
              Unlock for $79.99 <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-accent-fg/70 text-sm">One-time · Lifetime access · 7-day refund</span>
          </div>
        </div>

        <p className="text-center text-xs text-paper-dim mt-10">
          <Link to="/quiz" className="hover:text-paper transition">Retake quiz</Link>
          <span className="mx-2">·</span>
          <Link to="/" className="hover:text-paper transition">Back to homepage</Link>
        </p>

      </div>
    </div>
  );
};

export default Results;
