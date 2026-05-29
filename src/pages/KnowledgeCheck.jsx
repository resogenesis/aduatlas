import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiCheck, FiX } from "react-icons/fi";
import {
  knowledgeQuestions,
  loadKnowledge,
  saveKnowledge,
  gradeKnowledge,
} from "../stores/knowledgeQuiz";
import { EV, track } from "../lib/analytics";

// 10-question graded knowledge check shown right after account creation.
// Steps through each question, then reveals the score and every gap — the
// honest "here's what you don't know yet" moment that funnels into the course.
const KnowledgeCheck = () => {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState(loadKnowledge);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    saveKnowledge(answers);
  }, [answers]);

  const q = knowledgeQuestions[step];
  const progress = ((step + 1) / knowledgeQuestions.length) * 100;
  const value = answers[q?.id] || "";

  const setValue = (v) => {
    setError("");
    setAnswers((prev) => ({ ...prev, [q.id]: v }));
  };

  const next = () => {
    if (!value) {
      setError("Please choose an option.");
      return;
    }
    if (step === 0) track(EV.QUIZ_STARTED, { quiz: "knowledge" });
    if (step < knowledgeQuestions.length - 1) {
      setStep((s) => s + 1);
    } else {
      track(EV.QUIZ_COMPLETED, { quiz: "knowledge" });
      setDone(true);
    }
  };

  const back = () => {
    setError("");
    if (step > 0) setStep((s) => s - 1);
  };

  if (done) {
    const graded = gradeKnowledge(answers);
    return (
      <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-2xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5 text-center">
            Your Knowledge Check
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-center mb-4">
            You scored <span className="text-accent">{graded.correct}/{graded.total}</span>
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed text-center max-w-xl mx-auto mb-12">
            Most homeowners miss more than half. That's not a knock — it's exactly why the
            course exists. Here's what each answer should have been.
          </p>

          <div className="space-y-3 mb-12">
            {knowledgeQuestions.map((kq, i) => {
              const r = graded.results[i];
              const correctOpt = kq.options.find((o) => o.value === kq.correct);
              return (
                <div
                  key={kq.id}
                  className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                        r.isCorrect
                          ? "bg-accent/20 text-accent"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {r.isCorrect ? <FiCheck /> : <FiX />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-paper text-sm sm:text-base font-medium leading-snug mb-2">
                        {kq.label}
                      </p>
                      <p className="text-paper-dim text-sm leading-relaxed">
                        <span className="text-accent font-medium">Answer:</span>{" "}
                        {correctOpt?.label}
                      </p>
                      <p className="text-paper-dim/80 text-sm leading-relaxed mt-1.5 italic">
                        {kq.explanation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-accent text-accent-fg rounded-3xl p-8 sm:p-10 text-center">
            <h2 className="font-display font-medium text-2xl sm:text-3xl leading-tight mb-3">
              Close the gaps before you spend a dollar.
            </h2>
            <p className="text-accent-fg/80 text-sm sm:text-base mb-7 max-w-xl mx-auto">
              The ADU Course walks you through every one of these — process, costs, regulations,
              and builder readiness — and ends with your Property Feasibility Report.
            </p>
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
            >
              Start the ADU Course <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <p className="text-center text-xs text-paper-dim mt-7">
            <button onClick={() => navigate("/dashboard")} className="hover:text-paper transition">
              Skip to your dashboard
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-20">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-paper-dim mb-3">
            <span>Q {step + 1} / {knowledgeQuestions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-px bg-stroke overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12">
          <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-4">
            Knowledge Check
          </p>
          <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl leading-snug tracking-tight mb-7">
            {q.label}
          </h2>

          <div className="grid gap-2.5">
            {q.options.map((opt) => {
              const selected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setValue(opt.value)}
                  className={`text-left px-5 py-4 rounded-xl border transition-all ${
                    selected
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-stroke bg-canvas text-paper hover:border-paper-dim"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="flex items-center justify-between mt-10">
            <button
              onClick={back}
              disabled={step === 0}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition ${
                step === 0 ? "text-stroke cursor-not-allowed" : "text-paper-dim hover:text-paper"
              }`}
            >
              <FiArrowLeft /> Back
            </button>

            <button
              onClick={next}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              {step === knowledgeQuestions.length - 1 ? "See My Score" : "Next"} <FiArrowRight />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-paper-dim mt-7">
          ~3 minutes · This sets up your personalized course
        </p>
      </div>
    </div>
  );
};

export default KnowledgeCheck;
