// Reality Check knowledge-test answers, backed by sessionStorage.
// INTEGRATION POINT (Supabase): when a user submits email on /unlock,
// persist these answers to a `quiz_answers` row keyed by user id.

const KEY = "aduatlas.quiz.v2";

const empty = {
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  q5: "",
  q6: "",
  q7: "",
};

export const loadAnswers = () => {
  if (typeof window === "undefined") return { ...empty };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
  } catch {
    return { ...empty };
  }
};

export const saveAnswers = (answers) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(answers));
};

export const clearAnswers = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
};

export const isComplete = (a) =>
  Boolean(a.q1 && a.q2 && a.q3 && a.q4 && a.q5 && a.q6 && a.q7);
