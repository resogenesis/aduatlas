// Course structure + progress + builder-packet state.
//
// STRUCTURE: the course is organized as MODULES, each containing CHAPTERS (and
// a short quiz). Progress is still tracked per-chapter — completing every
// chapter + quiz in a module completes the module. A flat `chapters` list is
// derived from the modules for navigation and progress math, so the gates and
// dashboard keep working unchanged.
//
// PERSISTENCE: localStorage is the synchronous copy every render reads, and the
// signed-in user's row is the durable one. Chapter completions and quiz results
// are mirrored to `users.completed_chapters` (jsonb) and the builder packet to
// `users.builder_packet` (jsonb), both already covered by the column-level
// UPDATE grant in 0001_init.sql. Chapter ids are stable strings ("m1c1",
// "m1quiz") so stored progress survives. See "Progress persistence" below for
// the column shape and the merge rules.
//
// THE COURSE TEXT IS NOT HERE (DEF-07). This file ships in the anonymously
// served bundle, so it holds only the outline the public /course-outline page
// already shows: ids, titles, module names and blurbs, and minutes. Chapter
// bodies, quizzes (with their answer keys) and the course introduction live in
// api/_course/content.js and are fetched one at a time from /api/course with
// the session token, which answers only for a live course purchase or an admin.
// See fetchCourseItem() and useCourseItem() below.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { onAccountScopeReset } from "./accountScope";

const COMPLETED_KEY = "aduatlas.course.completed";
const QUIZ_KEY = "aduatlas.course.quizzes";
const PACKET_KEY = "aduatlas.packet";

// ── Modules → chapters ───────────────────────────────────────────────────────
// The outline only. Every chapter listed here has a body (or, for kind "quiz",
// a quiz) on the server under the same id, so progress math can count them.
export const modules = [
  {
    id: "m1",
    n: 1,
    title: "ADU Basics",
    blurb: "What an ADU is, the main types, and why homeowners build them.",
    chapters: [
      { id: "m1c1", n: 1, title: "What Is an ADU?", minutes: 4 },
      { id: "m1c2", n: 2, title: "Common Names for an ADU", minutes: 3 },
      { id: "m1c3", n: 3, title: "Where Can an ADU Be Built?", minutes: 4 },
      { id: "m1c4", n: 4, title: "Introduction to ADU Construction Options", minutes: 5 },
      { id: "m1c5", n: 5, title: "Tiny Home vs. ADU", minutes: 3 },
      { id: "m1c6", n: 6, title: "Why Are ADUs So Popular?", minutes: 5 },
      { id: "m1c7", n: 7, title: "Seven Common ADU Misconceptions", minutes: 6 },
      { id: "m1quiz", n: 8, kind: "quiz", title: "Module 1 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m2",
    n: 2,
    title: "Understanding City & State ADU Regulations",
    blurb: "How state building codes and local zoning work together, and the key regulations to verify before you plan.",
    chapters: [
      { id: "m2c1", n: 1, title: "Why ADU Regulations Matter", minutes: 5 },
      { id: "m2c2", n: 2, title: "State Building Codes vs. Local Zoning", minutes: 4 },
      { id: "m2c3", n: 3, title: "The Most Common ADU Regulations", minutes: 6 },
      { id: "m2c4", n: 4, title: "Common Regulation Examples", minutes: 5 },
      { id: "m2c5", n: 5, title: "Why Homeowners Get Confused", minutes: 5 },
      { id: "m2c6", n: 6, title: "Surveys, Permits, Timelines & Cost Estimates", minutes: 6 },
      { id: "m2c7", n: 7, title: "How Cities Guide Homeowners: A California Example", minutes: 4 },
      { id: "m2c8", n: 8, title: "The ADUAtlas Property Feasibility Study", minutes: 4 },
      { id: "m2c9", n: 9, title: "Module Summary", minutes: 3 },
      { id: "m2quiz", n: 10, kind: "quiz", title: "Module 2 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m3",
    n: 3,
    title: "The ADUAtlas 10-Step Process",
    blurb: "A logical roadmap from education and planning to construction and occupancy. Each step builds on the one before it.",
    chapters: [
      { id: "m3c1", n: 1, title: "Step 1: Complete the ADUAtlas Course", minutes: 3 },
      { id: "m3c2", n: 2, title: "Step 2: Complete the Property Feasibility Study", minutes: 3 },
      { id: "m3c3", n: 3, title: "Step 3: Verify Your Local ADU Regulations", minutes: 3 },
      { id: "m3c4", n: 4, title: "Step 4: Establish a Realistic Budget", minutes: 3 },
      { id: "m3c5", n: 5, title: "Step 5: Select an ADU Type", minutes: 3 },
      { id: "m3c6", n: 6, title: "Step 6: Determine Whether a Survey Is Required", minutes: 3 },
      { id: "m3c7", n: 7, title: "Step 7: Develop a Site Plan", minutes: 4 },
      { id: "m3c8", n: 8, title: "Step 8: Select a Builder", minutes: 4 },
      { id: "m3c9", n: 9, title: "Step 9: Permits, Inspections & Approval", minutes: 3 },
      { id: "m3c10", n: 10, title: "Step 10: Construction, Final Inspection & Occupancy", minutes: 3 },
      { id: "m3quiz", n: 11, kind: "quiz", title: "Module 3 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m4",
    n: 4,
    title: "The ADU Universe: 25+ Types & Construction Methods",
    blurb: "Organize the crowded ADU marketplace into a simple three-layer framework so you can compare your options with confidence.",
    tag: "Photos & videos",
    chapters: [
      { id: "m4c1", n: 1, title: "Welcome to the ADU Universe", minutes: 4 },
      { id: "m4c2", n: 2, title: "Understanding the ADU Universe", minutes: 4 },
      { id: "m4c3", n: 3, title: "Site-Built & Custom ADUs", minutes: 4 },
      { id: "m4c4", n: 4, title: "Factory-Built ADUs", minutes: 4 },
      { id: "m4c5", n: 5, title: "Engineered Building Systems", minutes: 5 },
      { id: "m4c6", n: 6, title: "Kit Homes & Cabin Packages", minutes: 4 },
      { id: "m4c7", n: 7, title: "Tiny Living Options", minutes: 4 },
      { id: "m4c8", n: 8, title: "Alternative Construction", minutes: 5 },
      { id: "m4c9", n: 9, title: "Architectural Styles & Exterior Design", minutes: 4 },
      { id: "m4c10", n: 10, title: "Size, Floor Plans & Layouts", minutes: 4 },
      { id: "m4c11", n: 11, title: "Comparing ADU Options", minutes: 5 },
      { id: "m4c12", n: 12, title: "Understanding Pricing", minutes: 5 },
      { id: "m4c13", n: 13, title: "How to Narrow Your ADU Options", minutes: 5 },
      { id: "m4c14", n: 14, title: "Before You Contact a Builder", minutes: 4 },
      { id: "m4quiz", n: 15, kind: "quiz", title: "Module 4 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m5",
    n: 5,
    title: "Pre-Site Preparation & Budgets",
    blurb: "The pre-site costs, foundations, timelines, and budget planning that turn an ADU price tag into a realistic total project cost.",
    tag: "Major value driver",
    chapters: [
      { id: "m5c1", n: 1, title: "Why Pre-Site Planning Matters", minutes: 4 },
      { id: "m5c2", n: 2, title: "Choosing the Best ADU Location", minutes: 4 },
      { id: "m5c3", n: 3, title: "Utility Planning", minutes: 3 },
      { id: "m5c4", n: 4, title: "Potential Site Preparation", minutes: 4 },
      { id: "m5c5", n: 5, title: "Foundations", minutes: 3 },
      { id: "m5c6", n: 6, title: "Surveys, Permits & Inspections", minutes: 4 },
      { id: "m5c7", n: 7, title: "Understanding Project Timelines", minutes: 4 },
      { id: "m5c8", n: 8, title: "Creating Your Preliminary Budget", minutes: 3 },
      { id: "m5c9", n: 9, title: "The ADUAtlas Property Feasibility Study", minutes: 3 },
      { id: "m5quiz", n: 10, kind: "quiz", title: "Module 5 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m6",
    n: 6,
    title: "ADU FAQ",
    blurb: "40 answers to the questions homeowners ask most throughout the ADU journey.",
    chapters: [
      { id: "m6c1", n: 1, title: "General: How ADUs Work", minutes: 3 },
      { id: "m6c2", n: 2, title: "Regulations & Zoning", minutes: 4 },
      { id: "m6c3", n: 3, title: "Planning & Feasibility", minutes: 4 },
      { id: "m6c4", n: 4, title: "Budgets, Costs & Financing", minutes: 5 },
      { id: "m6c5", n: 5, title: "Choosing, Builders & Construction", minutes: 6 },
      { id: "m6c6", n: 6, title: "About ADUAtlas & Living in an ADU", minutes: 5 },
      { id: "m6quiz", n: 7, kind: "quiz", title: "Module 6 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m7",
    n: 7,
    title: "False Starts & NAPE",
    blurb: "Can I build an ADU? Identify no-go conditions, high-risk false starts, and budget killers, and score your property with NAPE.",
    tag: "NAPE",
    chapters: [
      { id: "m7c1", n: 1, title: "Can I Build an ADU?", minutes: 5 },
      { id: "m7c2", n: 2, title: "Why Projects Fail Before They Begin", minutes: 3 },
      { id: "m7c3", n: 3, title: "What Is NAPE?", minutes: 3 },
      { id: "m7c4", n: 4, title: "Automatic No-Go Conditions", minutes: 5 },
      { id: "m7c5", n: 5, title: "High-Risk False Starts", minutes: 6 },
      { id: "m7c6", n: 6, title: "Financial False Starts", minutes: 4 },
      { id: "m7c7", n: 7, title: "The NAPE Scoring System", minutes: 4 },
      { id: "m7c8", n: 8, title: "Understanding Your NAPE Score", minutes: 4 },
      { id: "m7quiz", n: 9, kind: "quiz", title: "Module 7 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m9",
    n: 8,
    title: "Your Feasibility Study and Site Plan",
    blurb: "Verify what you can build, and where, before spending money, inside the ADUAtlas Property Feasibility Study.",
    chapters: [
      { id: "m9c1", n: 1, title: "Why Verify Before You Build", minutes: 4 },
      { id: "m9c2", n: 2, title: "What the Study Includes", minutes: 3 },
      { id: "m9c3", n: 3, title: "Your Visual Site Plan", minutes: 3 },
      { id: "m9c4", n: 4, title: "Interactive Planning Worksheets", minutes: 3 },
      { id: "m9c5", n: 5, title: "NAPE: National ADU Property Evaluation", minutes: 3 },
      { id: "m9c6", n: 6, title: "Budget, Timelines, Permits & Inspections", minutes: 3 },
      { id: "m9c7", n: 7, title: "How the Study Saves Time and Money", minutes: 5 },
      { id: "m9quiz", n: 8, kind: "quiz", title: "Module 8 Quiz", minutes: 5 },
    ],
  },
  {
    id: "m10",
    n: 9,
    title: "From Vision to Reality",
    blurb: "Cedar Grove's lessons, the verification process, your real budget, and everything that carries your vision into a buildable plan.",
    chapters: [
      { id: "m10c1", n: 1, title: "Lessons I Learned from Cedar Grove", minutes: 5 },
      { id: "m10c2", n: 2, title: "From Feasibility to Verification", minutes: 5 },
      { id: "m10c3", n: 3, title: "Verifying Utilities & Connection Points", minutes: 6 },
      { id: "m10c4", n: 4, title: "Completing Your Pre-Site Estimate", minutes: 6 },
      { id: "m10c5", n: 5, title: "Building Your Realistic Total Budget", minutes: 5 },
      { id: "m10c6", n: 6, title: "Preparing to Meet with Builders", minutes: 6 },
      { id: "m8c4", n: 7, title: "Questions for a Prefab, Modular, or Kit Supplier", minutes: 6 },
      { id: "m10c7", n: 8, title: "Working with Your City & Utility Providers", minutes: 5 },
      { id: "m10c8", n: 9, title: "Hiring a Builder or Being Your Own GC", minutes: 4 },
      { id: "m10c9", n: 10, title: "The ADUAtlas Promise & Your Next Steps", minutes: 5 },
      { id: "m10c10", n: 11, title: "Course Summary & Wrap-Up", minutes: 4 },
      { id: "m10quiz", n: 12, kind: "quiz", title: "Module 9 Quiz", minutes: 5 },
    ],
  },
];

// Flat, ordered list of every authored chapter (+ quiz), each tagged with its
// module. Used for navigation, progress math, and backward compatibility.
export const chapters = modules.flatMap((m) =>
  m.chapters.map((c) => ({
    ...c,
    moduleId: m.id,
    moduleN: m.n,
    moduleTitle: m.title,
  }))
);

export const chapterById = (id) => chapters.find((c) => c.id === id) || null;
export const moduleById = (id) => modules.find((m) => m.id === id) || null;

// ── Course text, from the server ────────────────────────────────────────────
// One chapter body, one module quiz, or the course introduction ("intro"),
// fetched from /api/course with the signed-in session's token. The server
// decides who may read it; PaidGate only decides what the page shows.
//
// Resolves to { ok: true, data } or { ok: false, status, error }. status is
// the HTTP status, or 0 when no request could be made (no Supabase, signed
// out, network failure), so a page can tell "sign in again" from "not in your
// plan" from "try again".
//
// Answers are cached per signed-in user for the life of the page, so going
// back to a lesson does not refetch it. A reload starts clean.
const itemCache = new Map();

export const fetchCourseItem = async (id) => {
  if (!id) return { ok: false, status: 0, error: "no-id" };
  if (!supabase) return { ok: false, status: 0, error: "supabase-disabled" };
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session || null;
  } catch {
    session = null;
  }
  const token = session?.access_token;
  if (!token) return { ok: false, status: 401, error: "signed-out" };

  const cacheKey = `${session.user?.id || ""}:${id}`;
  if (itemCache.has(cacheKey)) return { ok: true, data: itemCache.get(cacheKey) };

  try {
    const r = await fetch(`/api/course?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, status: r.status, error: body?.error || "request-failed" };
    itemCache.set(cacheKey, body);
    return { ok: true, data: body };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
};

// React hook over fetchCourseItem. Returns
//   { state: "loading" }
//   { state: "ready", data }
//   { state: "error", status, error, retry }
// and starts over whenever id changes. Pass null to fetch nothing.
export const useCourseItem = (id) => {
  const [result, setResult] = useState({ id: null, attempt: 0, value: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    fetchCourseItem(id).then((value) => {
      if (live) setResult({ id, attempt, value });
    });
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (!id) return { state: "error", status: 0, error: "no-id", retry };
  // Anything not answered for this exact id and attempt is still loading, so a
  // previous lesson's text is never shown under the next lesson's title.
  if (result.id !== id || result.attempt !== attempt || !result.value) return { state: "loading" };
  if (result.value.ok) return { state: "ready", data: result.value.data };
  return { state: "error", status: result.value.status, error: result.value.error, retry };
};

// ── Progress persistence ────────────────────────────────────────────────────
// localStorage stays the SYNCHRONOUS source of truth, because CourseIndex,
// CourseChapter and Dashboard all read progress during render. The signed-in
// user's row is the DURABLE copy, and 0001_init.sql already granted the user
// UPDATE on exactly the column it needs:
//
//   grant update (completed_chapters, builder_packet, knowledge_result)
//     on public.users to authenticated;
//
// Until now nothing ever used that grant for course progress. The course is
// sold with a year of access and the privacy policy tells the customer their
// account holds their progress, so a cleared browser or a second device threw
// away something they paid for. It is written now.
//
// THE COLUMN SHAPE. 0001 documented completed_chapters as ["c1","c2"]. Quiz
// results ride the SAME column rather than a new one, so the existing grant
// stays the whole permission story and no migration is needed:
//
//   { "v": 1,
//     "chapters": ["m1c1", …],
//     "quizzes": { "m1quiz": { "score": 4, "total": 5, "percent": 80, "at": "…" } } }
//
// A bare array is still read, because that is what the documented older shape
// is, and it is upgraded to the object on the next write.
//
// NOTHING HERE BLOCKS THE LEARNER. Every server call is fire-and-forget inside
// try/catch, debounced, and ignored on failure: marking a chapter complete is a
// local write that returns immediately, and a network or RLS failure leaves the
// local copy intact and retries on the next change.

const readSet = (key) => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const writeSet = (key, set) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Private mode / quota. The in-memory result of this call still stands and
    // the server mirror below is what makes it durable.
  }
};

const readQuizzes = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(QUIZ_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeQuizzes = (q) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUIZ_KEY, JSON.stringify(q));
  } catch {
    // See writeSet.
  }
};

// What gets written to users.completed_chapters.
const progressPayload = () => ({
  v: 1,
  chapters: [...getCompletedChapters()],
  quizzes: readQuizzes(),
});

// Read either shape back. Returns null when the row holds nothing usable.
const parseServerProgress = (value) => {
  if (Array.isArray(value)) return { chapters: value.filter((c) => typeof c === "string"), quizzes: {} };
  if (value && typeof value === "object") {
    const chapters = Array.isArray(value.chapters) ? value.chapters.filter((c) => typeof c === "string") : [];
    const quizzes = value.quizzes && typeof value.quizzes === "object" && !Array.isArray(value.quizzes) ? value.quizzes : {};
    return { chapters, quizzes };
  }
  return null;
};

// Debounced mirror to the signed-in user's row. A burst of marks (finishing a
// module, then its quiz) collapses into one write.
let pushTimer = null;
// True from a mark until a write of it has SUCCEEDED. A write that failed (a
// flaky connection) leaves it set, so log out still sends the local copy, which
// would otherwise be the only copy and be removed with the account's data.
let progressDirty = false;
const sendProgress = async (payload) => {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const authUser = sess?.session?.user;
    if (!authUser) return; // Signed out: the local copy is all there is, by design.
    const { error } = await supabase.from("users").update({ completed_chapters: payload }).eq("auth_user_id", authUser.id);
    if (!error) progressDirty = false;
  } catch {
    // Never surfaced, never blocking. The next change retries.
  }
};
const pushProgress = () => {
  if (typeof window === "undefined" || !supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  const payload = progressPayload();
  progressDirty = true;
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    sendProgress(payload);
  }, 400);
};

// Log out (T4-01): a mark made in the last 400 ms has not been sent yet. The
// write is taken out of the timer so it can be sent under the session that made
// it, before that session ends, and never under the next one.
// Also a mark whose earlier write failed: the whole local copy is taken, before
// accountScope removes it.
export const takeUnsentProgress = () => {
  const waiting = Boolean(pushTimer) || progressDirty;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  return waiting ? progressPayload() : null;
};
export const sendUnsentProgress = (payload) => (payload && supabase ? sendProgress(payload) : Promise.resolve());

// Log out, or another account signing in: the lesson texts fetched for the
// previous account and any write still waiting are dropped with its copy.
onAccountScopeReset(() => {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  progressDirty = false;
  itemCache.clear();
});

export const getCompletedChapters = () => readSet(COMPLETED_KEY);

export const markChapterComplete = (id) => {
  const s = getCompletedChapters();
  s.add(id);
  writeSet(COMPLETED_KEY, s);
  pushProgress();
};

export const unmarkChapter = (id) => {
  const s = getCompletedChapters();
  s.delete(id);
  writeSet(COMPLETED_KEY, s);
  pushProgress();
};

// ── Quiz results ────────────────────────────────────────────────────────────
// ModuleQuiz scored into useState alone, so a score vanished on navigation and
// was never part of the account. Results are keyed by the quiz chapter id
// ("m1quiz"), the same stable id the chapter list uses.

export const getQuizResult = (quizId) => (quizId ? readQuizzes()[quizId] || null : null);

export const saveQuizResult = (quizId, { score, total }) => {
  if (!quizId || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  const result = {
    score,
    total,
    percent: Math.round((score / total) * 100),
    at: new Date().toISOString(),
  };
  writeQuizzes({ ...readQuizzes(), [quizId]: result });
  pushProgress();
  return result;
};

export const courseProgress = () => {
  if (!chapters.length) return 0;
  const done = getCompletedChapters();
  const doneCount = chapters.filter((c) => done.has(c.id)).length;
  return Math.round((doneCount / chapters.length) * 100);
};


// Per-module completion, for the module list + progress rings.
export const getModuleProgress = (moduleId) => {
  const m = moduleById(moduleId);
  const total = m?.chapters.length || 0;
  if (!total) return { done: 0, total: 0, percent: 0, started: false, complete: false };
  const completed = getCompletedChapters();
  const done = m.chapters.filter((c) => completed.has(c.id)).length;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    started: done > 0,
    complete: done === total,
  };
};

// ── Builder Packet ──────────────────────────────────────────────────────────
// Each field is "filled" when the user has provided it, either via the quiz
// or via /my-property. Order matches what builders actually ask.

export const PACKET_FIELDS = [
  { key: "zip", label: "ZIP code" },
  { key: "lotSize", label: "Lot size" },
  { key: "budget", label: "Budget" },
  { key: "purpose", label: "Purpose" },
  { key: "timeline", label: "Timeline" },
  { key: "address", label: "Property address" },
  { key: "aduType", label: "Desired ADU type" },
  { key: "desiredSqft", label: "Desired ADU sq ft" },
  { key: "stories", label: "Stories (1 or 2)" },
  { key: "siteAccess", label: "Site access notes" },
  { key: "utilityNotes", label: "Utility notes" },
  { key: "hoaNotes", label: "HOA / restrictions" },
];

const readPacket = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PACKET_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writePacket = (p) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PACKET_KEY, JSON.stringify(p));
  } catch {
    // See writeSet.
  }
};

export const loadPacket = () => {
  const own = readPacket();
  return {
    zip: "",
    lotSize: "",
    budget: "",
    purpose: "",
    timeline: "",
    address: "",
    aduType: "",
    desiredSqft: "",
    stories: "",
    siteAccess: "",
    utilityNotes: "",
    hoaNotes: "",
    ...own,
  };
};

export const savePacket = (next) => writePacket(next);

// Merge server-side progress (from the signed-in user's row) into local state.
// Union for chapters and blank-fill for the packet, so a login/refresh NEVER
// wipes progress made locally — it only ever adds what the server also knows.
// Safe to call on every auth hydration.
//
// Union is deliberate and it has a known cost: a chapter un-marked on another
// device is re-added on this one if this browser still holds it. The trade is
// on purpose. A buyer can work through chapters before creating their account
// (the /unlock flow), and losing that on first sign-in is a worse failure than
// a checkbox that comes back. Because the merged result is pushed back below,
// the two copies converge instead of drifting.
//
// Quiz results merge per quiz, most recent attempt winning, so neither side
// loses a score it holds.
export const mergeServerProgress = ({ completedChapters, builderPacket } = {}) => {
  const server = parseServerProgress(completedChapters);
  if (server) {
    if (server.chapters.length) {
      const s = getCompletedChapters();
      server.chapters.forEach((id) => s.add(id));
      writeSet(COMPLETED_KEY, s);
    }
    const local = readQuizzes();
    const merged = { ...local };
    let quizzesChanged = false;
    for (const [id, remote] of Object.entries(server.quizzes)) {
      if (!remote || typeof remote !== "object") continue;
      const mine = merged[id];
      if (!mine || String(remote.at || "") > String(mine.at || "")) {
        merged[id] = remote;
        quizzesChanged = true;
      }
    }
    if (quizzesChanged) writeQuizzes(merged);

    // Push the union back only when this browser knows something the row does
    // not. That is what initialises the server copy for a learner who started
    // before signing in, and it keeps a plain hydration from writing.
    const before = JSON.stringify({ chapters: [...server.chapters].sort(), quizzes: server.quizzes });
    const now = progressPayload();
    const after = JSON.stringify({ chapters: [...now.chapters].sort(), quizzes: now.quizzes });
    if (before !== after) pushProgress();
  }

  if (builderPacket && typeof builderPacket === "object") {
    const own = readPacket();
    const merged = { ...own };
    for (const [k, v] of Object.entries(builderPacket)) {
      if (v != null && v !== "" && (merged[k] == null || merged[k] === "")) merged[k] = v;
    }
    writePacket(merged);
  }
};

export const packetProgress = () => {
  const p = loadPacket();
  const filled = PACKET_FIELDS.filter((f) => Boolean(String(p[f.key] || "").trim())).length;
  return {
    filled,
    total: PACKET_FIELDS.length,
    percent: Math.round((filled / PACKET_FIELDS.length) * 100),
    fields: PACKET_FIELDS.map((f) => ({ ...f, done: Boolean(String(p[f.key] || "").trim()) })),
  };
};
