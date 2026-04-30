// Lightweight quiz state store backed by sessionStorage.
// INTEGRATION POINT (Supabase): when a user submits email on /unlock,
// persist these answers to a `quiz_answers` row keyed by user id.

const KEY = "aduatlas.quiz.v1";

const empty = {
  zip: "",
  purpose: "",
  lotSize: "",
  primarySqft: "",
  budget: "",
  timeline: "",
  topConcern: "",
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
  Boolean(a.zip && a.purpose && a.lotSize && a.primarySqft && a.budget && a.timeline && a.topConcern);
