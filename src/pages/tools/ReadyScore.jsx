import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiRefreshCcw } from "react-icons/fi";
import WorksheetBar from "../../components/tools/WorksheetBar";
import {
  loadWorksheet,
  NAPE_CATEGORIES,
  NAPE_GRADES,
  NAPE_TOTAL_ITEMS,
  saveWorksheet,
  scoreNape,
} from "../../stores/worksheetStore";

// National ADU Property Evaluation (NAPE) — the official Module 7 scoring
// system: five weighted categories, 100 possible points, Yes/No answers,
// graded A–F. Grade F ("False Start") triggers whenever an automatic no-go
// condition is answered No, regardless of points. Answer honestly — resist
// the urge to answer the way you wish were true. Every "No" is a flag to
// verify with your local planning department, never a final verdict.

const GRADE_TONES = {
  A: "text-accent",
  B: "text-accent",
  C: "text-amber-300",
  D: "text-orange-300",
  F: "text-red-300",
};

const ReadyScore = () => {
  const [answers, setAnswers] = useState(() => loadWorksheet("readyScore")?.answers || {});
  const [savedAt, setSavedAt] = useState(null);

  const result = scoreNape(answers);
  const gradeInfo = result.grade ? NAPE_GRADES[result.grade] : null;

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      saveWorksheet("readyScore", {
        answers,
        points: result.points,
        grade: result.grade,
        completedAt: result.complete ? new Date().toISOString() : null,
      });
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [answers, result.points, result.grade, result.complete]);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Feasibility Report · NAPE
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-4">
        National ADU Property Evaluation.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-8">
        The official NAPE scoring system from Module 7: five weighted categories, 100 possible
        points, graded A–F. Answer each question honestly — resist the urge to answer the way you
        wish were true. A "No" is a flag to verify, not a final verdict; everything varies by
        property and municipality.
      </p>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Questions */}
        <div className="lg:col-span-2">
          {NAPE_CATEGORIES.map((cat) => (
            <div key={cat.id} className="mb-8">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h3 className="text-accent text-xs font-medium tracking-[0.2em] uppercase">{cat.title}</h3>
                <span className="text-paper-dim text-xs tabular-nums">
                  {result.perCategory[cat.id]} / {cat.points} pts
                </span>
              </div>
              <div className="space-y-2.5">
                {cat.items.map((it) => {
                  const val = answers[it.id];
                  return (
                    <div
                      key={it.id}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-center p-4 bg-surface-1-solid rounded-xl border border-stroke"
                    >
                      <p className="text-sm text-paper leading-relaxed">
                        {it.q}
                        {it.noGo && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-wider text-red-300/80">
                            <FiAlertTriangle className="text-[0.6rem]" /> no-go if No
                          </span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        {[{ v: true, label: "Yes", on: "bg-accent text-accent-fg border-accent" },
                          { v: false, label: "No", on: "bg-red-500/15 text-red-300 border-red-500/40" }].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setAnswers((a) => ({ ...a, [it.id]: opt.v }))}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                              val === opt.v
                                ? opt.on
                                : "bg-canvas border-stroke text-paper-dim hover:text-paper hover:border-paper-dim"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Score card */}
        <div className="lg:sticky lg:top-8 self-start">
          <div className="bg-surface-1-solid rounded-3xl border border-stroke p-7 sm:p-8 text-center mb-4">
            <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-2">NAPE Score</h3>
            <div className={`font-display text-7xl my-2 ${result.complete ? GRADE_TONES[result.grade] : "text-paper-dim/40"}`}>
              {result.complete ? result.grade : "–"}
            </div>
            <p className="font-display text-paper text-2xl mb-1">
              {result.points}<span className="text-paper-dim text-base">/100</span>
            </p>
            <p className="text-paper-dim text-sm">
              {result.answered}/{NAPE_TOTAL_ITEMS} answered
            </p>
            {!result.complete && (
              <p className="text-paper-dim/70 text-xs mt-2">Answer every question to lock in your grade.</p>
            )}
            <button
              type="button"
              onClick={() => setAnswers({})}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-xs font-medium print:hidden"
            >
              <FiRefreshCcw /> Start over
            </button>
          </div>

          {gradeInfo && (
            <div className="bg-surface-1-solid rounded-2xl border border-stroke p-5 text-sm mb-4">
              <p className="text-paper font-semibold mb-1">Grade {result.grade} — {gradeInfo.label}</p>
              <p className="text-paper-dim leading-relaxed">{gradeInfo.note}</p>
            </div>
          )}

          {result.noGoFlags.length > 0 && (
            <div className="bg-red-500/5 rounded-2xl border border-red-500/30 p-5 text-sm">
              <p className="text-red-300 font-semibold mb-2 flex items-center gap-2">
                <FiAlertTriangle /> No-go conditions flagged
              </p>
              <ul className="space-y-1.5">
                {result.noGoFlags.map((f) => (
                  <li key={f.id} className="text-paper-dim text-xs leading-relaxed">{f.q}</li>
                ))}
              </ul>
              <p className="text-paper-dim/70 text-xs leading-relaxed mt-3">
                A "No-Go" today does not always mean "No" forever — regulations change, utility
                projects occur, and variances may be available. Verify your options with your local
                planning department before giving up on the project.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-paper-dim text-xs leading-relaxed mt-10">
        NAPE is an early planning tool, not a permit approval, and it does not replace professional
        due diligence. Confirm regulatory flags with your local planning department and cost flags
        with the pre-site worksheets. Not legal advice or a permit determination.
      </p>
    </div>
  );
};

export default ReadyScore;
