import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import { loadAnswers, saveAnswers } from "../funnel/quizStore";

const questions = [
  {
    id: "zip",
    label: "What's your ZIP code?",
    helper: "We use this to pull local zoning rules.",
    type: "text",
    placeholder: "90210",
    validate: (v) => /^\d{5}$/.test(v.trim()),
    errorMsg: "Enter a valid 5-digit ZIP.",
  },
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
      { value: "unsure", label: "Unsure — that's part of why I'm here" },
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
    label: "Have you accounted for site-prep and utility hookup costs?",
    helper: "Sewer tie-ins, trenching, stormwater drainage — these often add $10K–$100K on top of the ADU price.",
    type: "choice",
    options: [
      { value: "quoted", label: "Yes — I have written quotes for site prep + utilities" },
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
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
    } else {
      // INTEGRATION POINT (analytics): fire "quiz_completed" event here.
      navigate("/results");
    }
  };

  const back = () => {
    setError("");
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div className="min-h-[80vh] bg-[#F4F7F6] py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-2xl">
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-secondary mb-2">
            <span>Question {step + 1} of {questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#2F5D50] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-semibold text-primary mb-2">{q.label}</h2>
          {q.helper && <p className="text-secondary text-sm mb-6">{q.helper}</p>}

          {q.type === "text" && (
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
              placeholder={q.placeholder}
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:border-[#2F5D50] focus:ring-2 focus:ring-[#2F5D50]/20"
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
                    className={`text-left px-4 py-3 rounded-lg border transition ${
                      selected
                        ? "border-[#2F5D50] bg-[#2F5D50] text-white"
                        : "border-gray-200 bg-white text-gray-800 hover:border-[#2F5D50]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={back}
              disabled={step === 0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition ${
                step === 0 ? "text-gray-300 cursor-not-allowed" : "text-secondary hover:text-primary"
              }`}
            >
              <FiArrowLeft /> Back
            </button>

            <button
              onClick={next}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#2F5D50] text-white font-semibold hover:bg-[#244A40] transition"
            >
              {step === questions.length - 1 ? "See My Results" : "Next"} <FiArrowRight />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-secondary mt-6">
          Takes ~2 minutes. No signup required to see your score.
        </p>
      </div>
    </div>
  );
};

export default Quiz;
