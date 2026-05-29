import { useMemo, useState } from "react";
import { FiRefreshCcw } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";

const questions = [
  "Is an ADU allowed by zoning on your property?",
  "Does your lot meet minimum size requirements?",
  "Does your property comply with the maximum ADU size allowed?",
  "Does your property meet front/right setback requirements?",
  "Does your property meet side/rear setback requirements?",
  "Are there any HOA or deed covenants limiting ADU construction?",
  "Usable building area",
  "Slope and topography",
  "Trees or environmental conservation",
  "Floodplain or coastal zone status",
  "Drive or road access to site",
  "Access for construction equipment",
  "Assignable access",
  "Designated access in deed",
  "An Easement or right-of-way conflicts",
  "No risk of shared parking",
  "Special ADU size or lot work",
  "Possible or Shared storage/carport",
  "Comparable ADU density in area",
  "Neighborhood compatibility",
  "Added income per sq ft of ADU worth",
];

const colors = {
  yes: "bg-green-100 border-green-300 text-green-700",
  no: "bg-red-100 border-red-300 text-red-700",
  unsure: "bg-gray-100 border-gray-300 text-gray-600",
};

const interpret = (score) => {
  if (score >= 80) return { label: "HIGH READY", tone: "bg-green-100 text-green-700", note: "Most indicators favorable for an ADU." };
  if (score >= 55) return { label: "MID READY", tone: "bg-yellow-100 text-yellow-700", note: "Several items need clarification." };
  if (score >= 30) return { label: "LOW READY", tone: "bg-orange-100 text-orange-700", note: "Real obstacles. Consult your city." };
  return { label: "NEEDS REVIEW", tone: "bg-red-100 text-red-700", note: "Unlikely without variance or redesign." };
};

const Feasibility = () => {
  const [answers, setAnswers] = useState({});

  const score = useMemo(() => {
    const vals = Object.values(answers);
    if (!vals.length) return 0;
    const weight = vals.reduce((acc, v) => acc + (v === "yes" ? 1 : v === "unsure" ? 0.3 : 0), 0);
    return Math.round((weight / questions.length) * 100);
  }, [answers]);

  const reset = () => setAnswers({});
  const readiness = interpret(score);

  return (
    <div>
      <PageHeader title="Zoning & Legal Feasibility" subtitle="Answer each question to generate your Property Feasibility Report." />

      <section className="container mx-auto px-4 sm:px-6 py-10 max-w-3xl">
        <div className="flex flex-col gap-3 mb-8">
          {questions.map((q, i) => {
            const current = answers[i];
            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center p-3 bg-white rounded-lg border border-gray-200">
                <p className="text-sm text-primary">{q}</p>
                <div className="flex gap-2">
                  {["yes", "no"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: opt }))}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md border capitalize ${current === opt ? colors[opt] : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-[#F4F7F6] rounded-2xl p-6 sm:p-8 text-center">
          <h3 className="text-lg font-semibold text-primary mb-1">Your Property Feasibility Report Score</h3>
          <div className="text-5xl font-bold text-[#2F5D50] my-3">{score}<span className="text-xl text-gray-400">/100</span></div>
          <button onClick={reset} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold">
            <FiRefreshCcw /> Retake Quiz
          </button>
        </div>

        <h4 className="mt-8 mb-3 font-semibold text-primary">Score Interpretation Guide</h4>
        <div className="grid sm:grid-cols-4 gap-2 text-xs">
          {[
            { lbl: "HIGH READY", range: "80–100", tone: "bg-green-100 text-green-700" },
            { lbl: "MID READY", range: "55–79", tone: "bg-yellow-100 text-yellow-700" },
            { lbl: "LOW READY", range: "30–54", tone: "bg-orange-100 text-orange-700" },
            { lbl: "NEEDS REVIEW", range: "0–29", tone: "bg-red-100 text-red-700" },
          ].map((r) => (
            <div key={r.lbl} className={`rounded-lg px-3 py-2 font-semibold text-center ${r.tone}`}>{r.lbl}<br /><span className="font-normal text-[10px]">{r.range}</span></div>
          ))}
        </div>

        <div className={`mt-6 rounded-lg p-4 ${readiness.tone}`}>
          <strong>{readiness.label}:</strong> {readiness.note}
        </div>
      </section>
    </div>
  );
};

export default Feasibility;
