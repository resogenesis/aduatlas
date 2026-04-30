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

  const ringColor =
    score >= 80 ? "#1F6F57" : score >= 60 ? "#2F5D50" : score >= 40 ? "#C68B00" : "#B23A3A";

  return (
    <div className="min-h-[80vh] bg-[#F4F7F6] py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-3xl">

        <p className="text-center text-[#2F5D50] font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3">
          YOUR ADU READINESS REPORT
        </p>
        <h1 className="text-center text-3xl sm:text-4xl font-bold text-primary mb-2">
          Your ADU Readiness Score: {score}% — here's what you're missing.
        </h1>
        <p className="text-center text-secondary mb-10">
          Based on your ZIP, lot, budget, timeline, and what you do (and don't) know.
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative w-40 h-40 shrink-0">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#E5E7EB" strokeWidth="12" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={ringColor}
                  strokeWidth="12"
                  strokeDasharray={`${(score / 100) * 326.7} 326.7`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-primary">{score}</span>
                <span className="text-xs text-secondary uppercase tracking-wider">/ 100</span>
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm text-secondary uppercase tracking-wider mb-1">Result</p>
              <h2 className="text-2xl sm:text-3xl font-semibold text-primary mb-3" style={{ color: ringColor }}>
                {band}
              </h2>
              <p className="text-secondary text-sm sm:text-base leading-relaxed">
                This is a preliminary snapshot. Your full Feasibility Study and Site Plan refines this score with GIS lot data, your local zoning rules, and pre-site cost estimates.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 mb-8">
          <h3 className="text-lg sm:text-xl font-semibold text-primary mb-5">
            What we found about your situation
          </h3>
          <ul className="space-y-3.5">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#2F5D50]/10 text-[#2F5D50] flex items-center justify-center text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="text-secondary text-sm sm:text-base leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-gradient-to-br from-[#0F3D33] to-[#1F6F57] rounded-2xl p-6 sm:p-10 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold tracking-wider uppercase text-white/80">
            <FiLock /> Locked — unlock with Paid Access
          </div>
          <h3 className="text-2xl sm:text-3xl font-semibold mb-3">
            Get your full Feasibility Study + Site Plan
          </h3>
          <p className="text-white/90 mb-6 text-sm sm:text-base leading-relaxed">
            Your free score is the headline. Paid Access unlocks the full plan: GIS lot view with dimensions, pre-filled pre-site cost worksheet, total budget worksheet, your refined ADU Readiness Score, a utility-marking contact, and a builder-ready RFP packet.
          </p>

          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-7 text-sm">
            {[
              "Full course — 6 chapters, 20+ modules",
              "GIS satellite view with lot dimensions",
              "Pre-filled pre-site cost worksheet",
              "Total budget worksheet with timelines",
              "Refined ADU Readiness Score",
              "Free utility-marking contact",
              "Builder/supplier matches by ZIP",
              "7-day full refund — no questions asked",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-white/90">
                <FiCheck className="shrink-0 mt-1" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Link
              to="/unlock"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-white text-[#0F3D33] font-semibold hover:bg-white/90 transition"
            >
              Unlock for $79.99 <FiArrowRight />
            </Link>
            <span className="text-white/70 text-sm">One-time payment · Lifetime access</span>
          </div>
        </div>

        <p className="text-center text-xs text-secondary mt-8">
          <Link to="/quiz" className="underline hover:text-primary">Retake the quiz</Link>
          {" · "}
          <Link to="/" className="underline hover:text-primary">Back to homepage</Link>
        </p>

      </div>
    </div>
  );
};

export default Results;
