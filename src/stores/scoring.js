// Reality Check scoring. Grades the 7-question knowledge test against the
// `correct` value on each question and produces a percent score, a band,
// and findings derived from any wrong answers.

import { questions } from "../pages/Quiz";

export const calculateScore = (answers) => {
  let correctCount = 0;
  const wrong = [];

  for (const q of questions) {
    if (answers[q.id] === q.correct) {
      correctCount += 1;
    } else if (answers[q.id]) {
      wrong.push(q);
    }
  }

  const score = Math.round((correctCount / questions.length) * 100);

  let band = "Major gaps to close";
  if (correctCount === questions.length) band = "Build-ready";
  else if (correctCount >= 5) band = "Almost there";
  else if (correctCount >= 3) band = "Foundational gaps";

  const findings = buildFindings(wrong, correctCount);

  return { score, correctCount, total: questions.length, band, findings };
};

const buildFindings = (wrong, correctCount) => {
  if (correctCount === 7) {
    return [
      "You answered all seven correctly. You already know what most homeowners learn the hard way. The full plan adds the property-specific details (your lot, your zoning, your buildable area) so you can act on what you know.",
    ];
  }
  // Surface up to 3 explanations, prioritized by order (foundational first).
  return wrong.slice(0, 3).map((q) => q.explanation);
};
