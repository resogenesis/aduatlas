// Account-creation knowledge check. A 10-question, graded quiz shown right
// after a homeowner signs up. Unlike the public 7-question Reality Check
// (see Quiz.jsx), this one is scored hard and meant to expose how much the
// homeowner doesn't yet know — the funnel into the paid ADU Course.
//
// Each question: one correct answer (`correct` matches an option `value`).
//
// ⚠️ ANSWER KEY — Richard to confirm the FLAGGED ones. Items without a flag
// are high-confidence; flagged items are my best guess and easy to flip
// (just change the `correct` letter).
//
// Persisted to localStorage so a refresh mid-quiz doesn't lose progress.

const KEY = "aduatlas.knowledge.v1";

export const knowledgeQuestions = [
  {
    id: "k1",
    label:
      "A local code has no minimum lot-size rule for ADUs. The owner assumes that means every lot is automatically feasible. What's the correct response?",
    correct: "d",
    explanation:
      "Minimum lot size is only one variable. Setbacks, lot coverage, height limits, overlay zones, and the physical buildable area all still control whether — and how big — an ADU can be built.",
    options: [
      { value: "a", label: "The owner is correct." },
      { value: "b", label: "The owner is wrong — but only because they haven't read the setback rules yet; it depends on the zoning regulations." },
      { value: "c", label: "All new construction has a 3' setback from each of the 4 sides and must not be taller than the existing structure." },
      { value: "d", label: "Minimum lot size is only one variable; setbacks, coverage, height, overlays, and physical build area still control feasibility." },
    ],
  },
  {
    id: "k2",
    // FLAG: confirm correct answer (c vs a).
    label: "What kind of survey is necessary to build an ADU?",
    correct: "c",
    explanation:
      "A cadastral or boundary survey establishes the legal property lines the city needs to verify setbacks and placement. Requirements vary by jurisdiction — always confirm locally.",
    options: [
      { value: "a", label: "Depends upon local zoning regulations and city guidelines." },
      { value: "b", label: "A feasibility plot plan can be used to get a permit." },
      { value: "c", label: "Either a cadastral or boundary survey." },
      { value: "d", label: "Existing-condition surveys." },
    ],
  },
  {
    id: "k3",
    label: "What costs are typically included in an advertised ADU price?",
    correct: "c",
    explanation:
      "Advertised ADU prices almost always cover the structure only — and exclude set-up, delivery, and taxes. Those add-ons, plus pre-site work, are where budgets blow up.",
    options: [
      { value: "a", label: "Foundation, permits, and the structure." },
      { value: "b", label: "Pre-site, prep, utility hook-ups, and the structure." },
      { value: "c", label: "The price of the structure, excluding set-up, delivery, and taxes." },
      { value: "d", label: "The price of the structure, including set-up, delivery, and taxes." },
    ],
  },
  {
    id: "k4",
    // FLAG: confirm correct answer (d vs b).
    label:
      "A homeowner's lot is next to a utility company and needs an additional foot for the legally required setbacks. What are their options?",
    correct: "d",
    explanation:
      "How a utility easement interacts with a required setback is governed by city regulations. The path forward — variance, easement adjustment, or redesign — depends on those local rules.",
    options: [
      { value: "a", label: "They have no options; they need to build a smaller ADU." },
      { value: "b", label: "They can request a variance/easement from the utility company to be compliant." },
      { value: "c", label: "They can build because there's an existing 10' easement the utility created 25 years ago." },
      { value: "d", label: "It depends on the city regulations for how to handle utility easements." },
    ],
  },
  {
    id: "k5",
    // FLAG: confirm correct answer (a vs d).
    label: "What are the biggest mistakes homeowners make?",
    correct: "a",
    explanation:
      "Pre-site costs and utility hook-ups are the most commonly underestimated expenses — frequently adding tens of thousands of dollars beyond the advertised structure price.",
    options: [
      { value: "a", label: "Underestimating pre-site costs and utility hook-ups." },
      { value: "b", label: "Underestimating permits and inspections." },
      { value: "c", label: "Underestimating ADU set-up and delivery." },
      { value: "d", label: "Underestimating total project cost." },
    ],
  },
  {
    id: "k6",
    label: "What information will builders want from you to give an accurate price?",
    correct: "a",
    explanation:
      "A complete picture — pre-site conditions, ADU size and type, lot dimensions, ZIP code, total budget, timeline, and intended use — is what lets a builder quote accurately instead of guessing.",
    options: [
      { value: "a", label: "Pre-site, ADU size and type, lot dimensions, ZIP code, total budget, timeline, and intended use." },
      { value: "b", label: "ADU regulations, type of utilities and foundation, lot dimensions, survey, address." },
      { value: "c", label: "Property Feasibility Report, plot plan, budget, address." },
      { value: "d", label: "Lot size, setbacks, overlay zones, utility access, ZIP code." },
    ],
  },
  {
    id: "k7",
    label: "How many ADU structure types are available in today's market?",
    correct: "d",
    explanation:
      "There are 25+ ADU structure types on the market — detached, attached, garage conversions, modular, panelized, prefab, container, and more. Most homeowners only know a couple.",
    options: [
      { value: "a", label: "1–8" },
      { value: "b", label: "9–10" },
      { value: "c", label: "11–20" },
      { value: "d", label: "25+" },
    ],
  },
  {
    id: "k8",
    // FLAG: confirm correct answer (b modular vs d container).
    label: "Which ADU type is typically the least expensive?",
    correct: "b",
    explanation:
      "Modular/panelized ADUs are usually the lowest cost per square foot — factory production to a shared spec cuts labor and shortens the on-site timeline.",
    options: [
      { value: "a", label: "Stick-built" },
      { value: "b", label: "Modular / panelized" },
      { value: "c", label: "Prefab manufactured" },
      { value: "d", label: "Container" },
    ],
  },
  {
    id: "k9",
    label: "Can I buy an inexpensive ADU from Amazon and place it in my yard?",
    correct: "d",
    explanation:
      "Some online sellers are reliable, but you must verify the structural elements, confirm what's actually included (not just a frame), and vet the seller's location and references. Delivery and code compliance are where these go wrong.",
    options: [
      { value: "a", label: "Yes, but delivery cost could be very expensive — check references." },
      { value: "b", label: "Yes, but be sure the structure includes everything the photo shows and isn't just a frame." },
      { value: "c", label: "No — it won't meet the state IRC code and can't be built for under $10k." },
      { value: "d", label: "Yes — some online sellers are reliable, but verify the structural elements and the seller's website and location." },
    ],
  },
  {
    id: "k10",
    label: "How much does an ADU cost to build? Which range is most realistic?",
    correct: "b",
    explanation:
      "Realistic all-in costs split into pre-site work ($10k–$100k) plus the structure ($25k–$250k). Single 'all-in' numbers like $75k or $50k almost always omit pre-site and soft costs.",
    options: [
      { value: "a", label: "$50k, with additional set-up and delivery." },
      { value: "b", label: "Pre-site $10k–$100k, structure $25k–$250k." },
      { value: "c", label: "$75k–$100k all in." },
      { value: "d", label: "$125k–$175k all in." },
    ],
  },
];

export const loadKnowledge = () => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const saveKnowledge = (answers) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(answers || {}));
  } catch {
    /* ignore */
  }
};

// Grade a full answer map → { score, total, correct, results[] }.
export const gradeKnowledge = (answers = {}) => {
  const results = knowledgeQuestions.map((q) => {
    const chosen = answers[q.id] || null;
    const isCorrect = chosen === q.correct;
    return { id: q.id, chosen, isCorrect, correct: q.correct };
  });
  const correct = results.filter((r) => r.isCorrect).length;
  return {
    correct,
    total: knowledgeQuestions.length,
    score: Math.round((correct / knowledgeQuestions.length) * 100),
    results,
  };
};
