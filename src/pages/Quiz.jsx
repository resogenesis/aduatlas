import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import { loadAnswers, saveAnswers } from "../stores/quizStore";
import { EV, track } from "../lib/analytics";

const questions = [
  {
    id: "purpose",
    label: "Why are you considering an ADU?",
    type: "choice",
    options: [
      { value: "rental", label: "Rental income" },
      { value: "aging-parent", label: "Housing an aging parent" },
      { value: "adult-child", label: "Housing an adult child" },
      { value: "office", label: "Home office / studio" },
      { value: "value", label: "Increase property value" },
      { value: "other", label: "Other / exploring" },
    ],
  },
  {
    id: "lotSize",
    label: "Approximately how big is your lot?",
    type: "choice",
    options: [
      { value: "under-3000", label: "Under 3,000 sq ft" },
      { value: "3000-5000", label: "3,000 – 5,000 sq ft" },
      { value: "5000-10000", label: "5,000 – 10,000 sq ft" },
      { value: "10000+", label: "Over 10,000 sq ft" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    id: "budget",
    label: "What's your rough budget range?",
    helper: "Site prep + structure combined.",
    type: "choice",
    options: [
      { value: "under-100k", label: "Under $100K" },
      { value: "100-200k", label: "$100K – $200K" },
      { value: "200-400k", label: "$200K – $400K" },
      { value: "400k+", label: "$400K+" },
      { value: "unsure", label: "Unsure. That's part of why I'm here" },
    ],
  },
  {
    id: "timeline",
    label: "When do you want to break ground?",
    type: "choice",
    options: [
      { value: "6mo", label: "Within 6 months" },
      { value: "6-12mo", label: "6 – 12 months" },
      { value: "1-2yr", label: "1 – 2 years" },
      { value: "exploring", label: "Just exploring for now" },
    ],
  },
  {
    id: "zoningKnowledge",
    label: "How well do you know your local ADU zoning?",
    helper: "Things like maximum ADU size as a % of your primary home, setbacks, height limits, and parking requirements.",
    type: "choice",
    options: [
      { value: "deep", label: "I've read my city's specific ADU code" },
      { value: "general", label: "I know ADUs are allowed but haven't checked details" },
      { value: "heard", label: "I've heard ADUs are legal in my area" },
      { value: "none", label: "I haven't checked yet" },
    ],
  },
  {
    id: "siteCostKnowledge",
    label: "Have you accounted for site prep and utility hookup costs?",
    helper: "Sewer tie ins, trenching, stormwater drainage. These often add $10K to $100K on top of the ADU price.",
    type: "choice",
    options: [
      { value: "quoted", label: "Yes, I have written quotes for site prep + utilities" },
      { value: "estimated", label: "I have a rough estimate" },
      { value: "assumed", label: "I assumed they're included in the ADU price" },
      { value: "unaware", label: "I hadn't really thought about it" },
    ],
  },
];

const Quiz = () => {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState(loadAnswers);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    saveAnswers(answers);
  }, [answers]);

  const q = questions[step];
  const progress = ((step + 1) / questions.length) * 100;
  const value = answers[q.id] || "";

  const setValue = (v) => {
    setError("");
    setAnswers((prev) => ({ ...prev, [q.id]: v }));
  };

  const next = () => {
    if (q.validate && !q.validate(value)) {
      setError(q.errorMsg || "Please complete this question.");
      return;
    }
    if (!value) {
      setError("Please choose an option.");
      return;
    }
    if (step === 0) track(EV.QUIZ_STARTED);
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
    } else {
      track(EV.QUIZ_COMPLETED, { zip: answers.zip });
      navigate("/results");
    }
  };

  const back = () => {
    setError("");
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-20">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-paper-dim mb-3">
            <span>Q {step + 1} / {questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-px bg-stroke overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12">
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-3">
            {q.label}
          </h2>
          {q.helper && <p className="text-paper-dim text-sm sm:text-base mb-7">{q.helper}</p>}

          {q.type === "text" && (
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder={q.placeholder}
              className="w-full px-5 py-4 text-lg bg-canvas border border-stroke rounded-xl text-paper placeholder:text-paper-dim/60 focus:outline-none focus:border-accent transition"
            />
          )}

          {q.type === "choice" && (
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
          )}

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
              {step === questions.length - 1 ? "See My Results" : "Next"} <FiArrowRight />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-paper-dim mt-7">
          ~2 minutes · No signup required to see your score
        </p>
      </div>
    </div>
  );
};

export default Quiz;
