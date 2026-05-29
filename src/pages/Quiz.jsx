import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import { loadAnswers, saveAnswers } from "../stores/quizStore";
import { EV, track } from "../lib/analytics";

// The Reality Check is a 7-question knowledge test. Each question has one
// correct answer (`correct` key matches the option `value`). Results scores
// against these and surfaces gap-explanations for any wrong answers.
export const questions = [
  {
    id: "q1",
    label: "Can you legally build an ADU on your property?",
    helper: "Which of these determines whether an ADU can be built on a property?",
    correct: "b",
    explanation:
      "ADU eligibility depends on a combination of zoning, setbacks, lot size, and local regulations. No single factor decides it.",
    options: [
      { value: "a", label: "Lot sq ft, ZIP code zoning regulations" },
      { value: "b", label: "Zoning, setbacks, lot size, and local regulations" },
      { value: "c", label: "City zoning regulations and primary home sq ft" },
      { value: "d", label: "HOA and city regulations alone" },
    ],
  },
  {
    id: "q2",
    label: "What makes ADU projects more expensive than most homeowners expect?",
    helper: "Pick the line item that catches most homeowners off guard.",
    correct: "c",
    explanation:
      "Pre-site costs (utilities, excavation, foundation, permits) are the #1 surprise expense, typically adding $10,000 to $100,000 beyond the builder's structure price.",
    options: [
      { value: "a", label: "ADU price, delivery, construction, site prep" },
      { value: "b", label: "Inaccurate estimates and ADU construction" },
      { value: "c", label: "Pre-site costs like utilities, excavation, and permits" },
      { value: "d", label: "City inspection delays and pre-site prep" },
    ],
  },
  {
    id: "q3",
    label: "What determines the maximum size of an ADU?",
    helper: "What sets the actual cap on how big your ADU can be?",
    correct: "b",
    explanation:
      "Max ADU size is set by local zoning rules (a percent-of-primary rule, a hard sq ft cap), the setback envelope, and the buildable area left on your specific lot.",
    options: [
      { value: "a", label: "Sq ft of lot, budget, primary structure sq ft" },
      { value: "b", label: "Local zoning regulations, setbacks, and lot conditions" },
      { value: "c", label: "Lot size, ADU type, budget" },
      { value: "d", label: "City zoning regulations alone" },
    ],
  },
  {
    id: "q4",
    label: "Which ADU construction type is usually the cheapest?",
    helper: "By per-sq-ft cost, before site prep.",
    correct: "a",
    explanation:
      "Modular ADUs are usually the cheapest construction type. They are factory-built to a shared spec, which reduces labor cost and shortens the on-site timeline.",
    options: [
      { value: "a", label: "Modular" },
      { value: "b", label: "Prefab" },
      { value: "c", label: "Shipping container" },
      { value: "d", label: "There is no single \"cheapest\" option for every property" },
    ],
  },
  {
    id: "q5",
    label: "Before speaking with builders, what information is most important?",
    helper: "Which one piece of prep makes builder quotes comparable?",
    correct: "c",
    explanation:
      "A Property Feasibility Study with zoning and property details is the highest-leverage prep. Without it, builder quotes can't be compared apples-to-apples.",
    options: [
      { value: "a", label: "A plat survey of your property" },
      { value: "b", label: "Type and size of the ADU" },
      { value: "c", label: "A Property Feasibility Study with zoning and property details" },
      { value: "d", label: "City and ZIP code zoning regulations and ADU type" },
    ],
  },
  {
    id: "q6",
    label: "Why can't builders give you an accurate quote over the phone?",
    helper: "What's missing from a phone quote?",
    correct: "b",
    explanation:
      "An ADU structure is only part of the total price. Pre-site work, permits, utility tie-ins, and finish levels all vary per property and can't be quoted without seeing your specific lot and scope.",
    options: [
      { value: "a", label: "They can, by just giving you the price of the ADU" },
      { value: "b", label: "An ADU structure is not the only expense" },
      { value: "c", label: "They have to see if it will fit in the space" },
      { value: "d", label: "Builders want to upsell and know your budget first" },
    ],
  },
  {
    id: "q7",
    label: "What is one of the biggest mistakes homeowners make?",
    helper: "What goes wrong earliest in the process?",
    correct: "a",
    explanation:
      "The most common mistake is starting too early — calling builders or paying for surveys before understanding the process and what's actually possible on your property.",
    options: [
      { value: "a", label: "Starting too early without understanding the process and property limitations" },
      { value: "b", label: "Not looking at all the ADU options available" },
      { value: "c", label: "Researching permits, zoning, and pre-site estimates" },
      { value: "d", label: "Looking at multiple builders" },
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
    if (!value) {
      setError("Please choose an option.");
      return;
    }
    if (step === 0) track(EV.QUIZ_STARTED);
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
    } else {
      track(EV.QUIZ_COMPLETED);
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
          <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl leading-snug tracking-tight mb-3">
            {q.label}
          </h2>
          {q.helper && <p className="text-paper-dim text-sm sm:text-base mb-7">{q.helper}</p>}

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
