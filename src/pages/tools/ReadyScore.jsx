import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiRefreshCcw, FiX } from "react-icons/fi";
import WorksheetBar from "../../components/tools/WorksheetBar";
import { loadPacket } from "../../stores/courseStore";
import {
  READY_SCORE_GROUPS,
  READY_SCORE_TOTAL,
  gradeReadyScore,
  loadWorksheet,
  readyScoreOutcome,
  saveWorksheet,
} from "../../stores/worksheetStore";

// National Property ADU Ready Score — 20 questions graded A–F, aligned with
// the course's NAPE (National ADU Property Evaluation, Module 7). Built for
// homeowners and Realtors: preparedness auto-checks from the project brief;
// property and budget flags are honest Yes/No self-answers. A flag is a
// prompt to verify with the local planning department, never a verdict.

const GRADE_TONES = {
  A: "text-accent",
  B: "text-accent",
  C: "text-amber-300",
  D: "text-orange-300",
  F: "text-red-300",
};

const ReadyScore = () => {
  const packet = useMemo(() => loadPacket(), []);
  const [answers, setAnswers] = useState(() => loadWorksheet("readyScore")?.answers || {});
  const [savedAt, setSavedAt] = useState(null);

  // Preparedness auto-answers, derived live from the project brief.
  const autoAnswers = useMemo(() => {
    const auto = {};
    READY_SCORE_GROUPS[0].items.forEach((it) => {
      auto[it.id] = Boolean(String(packet[it.fromPacket] || "").trim());
    });
    return auto;
  }, [packet]);

  const answerOf = (it) => (it.fromPacket ? autoAnswers[it.id] : answers[it.id]);

  const answeredCount = READY_SCORE_GROUPS.flatMap((g) => g.items).filter(
    (it) => answerOf(it) !== undefined
  ).length;
  const yesCount = READY_SCORE_GROUPS.flatMap((g) => g.items).filter((it) => answerOf(it) === true).length;
  const complete = answeredCount === READY_SCORE_TOTAL;
  const grade = gradeReadyScore(yesCount);
  const outcome = readyScoreOutcome(grade);
  const flags = READY_SCORE_GROUPS.flatMap((g) => g.items).filter((it) => answerOf(it) === false);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      saveWorksheet("readyScore", {
        answers,
        yesCount,
        grade: complete ? grade : null,
        completedAt: complete ? new Date().toISOString() : null,
      });
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [answers, yesCount, grade, complete]);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Feasibility Report · NAPE
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-4">
        ADU Ready Score.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-8">
        Twenty questions, graded A–F — your property's detached-ADU readiness at a glance, for you
        and for a Realtor. Answer honestly: resist the urge to answer the way you wish were true.
        A "No" is a flag to verify, not a final verdict — everything varies by property and
        municipality.
      </p>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Questions */}
        <div className="lg:col-span-2">
          {READY_SCORE_GROUPS.map((group) => (
            <div key={group.id} className="mb-8">
              <h3 className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-1">{group.title}</h3>
              <p className="text-paper-dim text-xs mb-4">{group.blurb}</p>
              <div className="space-y-2.5">
                {group.items.map((it) => {
                  const val = answerOf(it);
                  return (
                    <div
                      key={it.id}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-center p-4 bg-surface-1-solid rounded-xl border border-stroke"
                    >
                      <p className="text-sm text-paper leading-relaxed">{it.q}</p>
                      {it.fromPacket ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold justify-self-start sm:justify-self-end ${val ? "text-accent" : "text-paper-dim"}`}>
                          {val ? <><FiCheck /> Yes</> : <><FiX /> Not yet</>}
                          <Link to="/my-property" className="ml-1 font-normal underline underline-offset-2 text-paper-dim/70 hover:text-paper transition print:hidden">
                            edit
                          </Link>
                        </span>
                      ) : (
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
                      )}
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
            <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-2">Ready Score</h3>
            <div className={`font-display text-7xl my-2 ${complete ? GRADE_TONES[grade] : "text-paper-dim/40"}`}>
              {complete ? grade : "–"}
            </div>
            <p className="text-paper-dim text-sm">
              {yesCount} of {READY_SCORE_TOTAL} favorable · {answeredCount}/{READY_SCORE_TOTAL} answered
            </p>
            {!complete && (
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

          {complete && (
            <div className="bg-surface-1-solid rounded-2xl border border-stroke p-5 text-sm mb-4">
              <p className="text-paper font-semibold mb-1">{outcome.label}</p>
              <p className="text-paper-dim leading-relaxed">{outcome.note}</p>
            </div>
          )}

          {flags.length > 0 && (
            <div className="bg-surface-1-solid rounded-2xl border border-stroke p-5 text-sm">
              <p className="text-paper font-semibold mb-2">Your flags to verify</p>
              <ul className="space-y-1.5">
                {flags.map((f) => (
                  <li key={f.id} className="text-paper-dim text-xs leading-relaxed flex items-start gap-2">
                    <FiX className="shrink-0 mt-0.5 text-red-300" /> {f.q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <p className="text-paper-dim text-xs leading-relaxed mt-10">
        One flag may be solvable; several together may mean pause or rethink — and Proceed, Adjust,
        and Pause are all wins when you reach them before spending money. Confirm regulatory flags
        with your local planning department and cost flags with the budget worksheet. Not legal
        advice or a permit determination.
      </p>
    </div>
  );
};

export default ReadyScore;
