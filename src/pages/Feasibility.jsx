import { useMemo, useState } from "react";
import { FiRefreshCcw } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import BuildableEnvelope from "../components/tools/BuildableEnvelope";

// Feasibility questions grouped into the four dimensions a real ADU
// pre-screen covers. Each answers Yes / Unsure / No; "Unsure" scores partial
// so an honest "I don't know" pulls the score down without zeroing it — the
// point is to surface what still needs checking, not to reward guessing.
const groups = [
  {
    title: "Zoning & Legal",
    items: [
      "Is an ADU permitted by your property's zoning?",
      "Does your lot meet the minimum lot size for an ADU?",
      "Can your planned ADU fit within the maximum size your zoning allows?",
      "Can the ADU meet front and street-side setback requirements?",
      "Can the ADU meet side and rear setback requirements?",
      "Is your property free of HOA or deed restrictions that limit ADUs?",
    ],
  },
  {
    title: "Site & Physical",
    items: [
      "Is there enough usable yard area for the ADU footprint?",
      "Is the site relatively flat, needing little grading?",
      "Is the site clear of protected trees or conservation areas?",
      "Is the property outside a floodplain or coastal high-hazard zone?",
      "Are water, sewer, and power connections within reasonable reach?",
    ],
  },
  {
    title: "Access",
    items: [
      "Is there vehicle access to the ADU site?",
      "Can construction equipment reach the build area?",
      "Is the site free of easement or right-of-way conflicts?",
      "Can you meet parking requirements, or are you exempt?",
    ],
  },
  {
    title: "Market & Value",
    items: [
      "Are there comparable ADUs nearby to support an appraisal?",
      "Does an ADU fit the character of your neighborhood?",
      "Does the expected rent or value gain justify the cost?",
    ],
  },
];

// Flat count for scoring, independent of how items are grouped.
const totalQuestions = groups.reduce((n, g) => n + g.items.length, 0);

const OPTIONS = [
  { value: "yes", label: "Yes", on: "bg-accent text-accent-fg border-accent" },
  { value: "unsure", label: "Unsure", on: "bg-paper-dim/20 text-paper border-paper-dim/40" },
  { value: "no", label: "No", on: "bg-red-500/15 text-red-300 border-red-500/40" },
];

const interpret = (score) => {
  if (score >= 80) return { label: "HIGH READY", tone: "bg-accent/15 text-accent border-accent/30", note: "Most indicators favor an ADU. Move to design and a builder packet." };
  if (score >= 55) return { label: "MID READY", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30", note: "Promising, but several items need confirmation before you commit." };
  if (score >= 30) return { label: "LOW READY", tone: "bg-orange-500/15 text-orange-300 border-orange-500/30", note: "Real obstacles here. Confirm the No answers with your city before spending." };
  return { label: "NEEDS REVIEW", tone: "bg-red-500/15 text-red-300 border-red-500/30", note: "Unlikely without a variance or redesign. Start with a planner consult." };
};

const Feasibility = () => {
  const [answers, setAnswers] = useState({});

  const answered = Object.keys(answers).length;
  const score = useMemo(() => {
    const vals = Object.values(answers);
    if (!vals.length) return 0;
    const weight = vals.reduce((acc, v) => acc + (v === "yes" ? 1 : v === "unsure" ? 0.3 : 0), 0);
    return Math.round((weight / totalQuestions) * 100);
  }, [answers]);

  const reset = () => setAnswers({});
  const readiness = interpret(score);

  return (
    <div>
      <PageHeader
        title="Zoning & Legal Feasibility"
        subtitle="Answer each question honestly — including the ones you're unsure about. Your score shows how build-ready your property is and exactly what's left to confirm."
      />

      <section className="container mx-auto px-5 sm:px-8 py-12 sm:py-16 max-w-3xl">
        <div className="mb-12">
          <BuildableEnvelope />
        </div>

        <h3 className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-1">
          Readiness checklist
        </h3>
        <p className="text-paper-dim text-sm mb-6">
          The envelope shows what fits; this shows whether you're cleared to build it.
        </p>

        {groups.map((group, gi) => (
          <div key={group.title} className="mb-10">
            <h3 className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-4">
              {group.title}
            </h3>
            <div className="flex flex-col gap-3">
              {group.items.map((q, qi) => {
                const key = `${gi}-${qi}`;
                const current = answers[key];
                return (
                  <div
                    key={key}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-center p-4 bg-surface-1-solid rounded-xl border border-stroke"
                  >
                    <p className="text-sm text-paper leading-relaxed">{q}</p>
                    <div className="flex gap-2">
                      {OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setAnswers((a) => ({ ...a, [key]: opt.value }))}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                            current === opt.value
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

        {/* Score card */}
        <div className="bg-surface-1-solid rounded-3xl border border-stroke p-8 sm:p-10 text-center">
          <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-2">
            Your Feasibility Score
          </h3>
          <div className="font-display text-accent text-6xl my-3">
            {score}
            <span className="text-2xl text-paper-dim">/100</span>
          </div>
          <p className="text-paper-dim text-sm mb-6">
            {answered} of {totalQuestions} answered
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
          >
            <FiRefreshCcw /> Start over
          </button>
        </div>

        {/* Interpretation */}
        <h4 className="mt-10 mb-3 text-paper text-xs uppercase tracking-[0.2em]">
          What the score means
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-6">
          {[
            { lbl: "HIGH READY", range: "80–100", tone: "bg-accent/15 text-accent border-accent/30" },
            { lbl: "MID READY", range: "55–79", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
            { lbl: "LOW READY", range: "30–54", tone: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
            { lbl: "NEEDS REVIEW", range: "0–29", tone: "bg-red-500/15 text-red-300 border-red-500/30" },
          ].map((r) => (
            <div key={r.lbl} className={`rounded-xl border px-3 py-2.5 font-semibold text-center ${r.tone}`}>
              {r.lbl}
              <br />
              <span className="font-normal text-[10px] opacity-70">{r.range}</span>
            </div>
          ))}
        </div>

        {answered > 0 && (
          <div className={`rounded-xl border p-4 text-sm ${readiness.tone}`}>
            <strong>{readiness.label}:</strong> {readiness.note}
          </div>
        )}
      </section>
    </div>
  );
};

export default Feasibility;
