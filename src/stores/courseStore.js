// Mock course-progress + builder-packet state.
//
// INTEGRATION POINT (Supabase): replace localStorage with reads/writes
// against `users.completed_chapters` (jsonb) and `users.builder_packet` (jsonb).

import { loadAnswers } from "./quizStore";

const COMPLETED_KEY = "aduatlas.course.completed";
const PACKET_KEY = "aduatlas.packet";

export const chapters = [
  { id: "c1", n: 1, title: "How to ADU", blurb: "The full process, in the order it actually happens.", minutes: 12 },
  { id: "c2", n: 2, title: "ADU Types", blurb: "30+ types side-by-side: cost, timeline, value impact.", minutes: 14 },
  { id: "c3", n: 3, title: "Budget & Site Prep", blurb: "Why builder quotes always look low, and what to add.", minutes: 16 },
  { id: "c4", n: 4, title: "Rules & Regulations", blurb: "City, county, ZIP, HOA — who decides what, and how to check.", minutes: 18 },
  { id: "c5", n: 5, title: "Builder Readiness", blurb: "What builders ask, what to bring, what to demand.", minutes: 11 },
  { id: "c6", n: 6, title: "Feasibility & RFP", blurb: "Generate your site plan and builder packet.", minutes: 9 },
];

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
  window.localStorage.setItem(key, JSON.stringify([...set]));
};

export const getCompletedChapters = () => readSet(COMPLETED_KEY);

export const markChapterComplete = (id) => {
  const s = getCompletedChapters();
  s.add(id);
  writeSet(COMPLETED_KEY, s);
};

export const unmarkChapter = (id) => {
  const s = getCompletedChapters();
  s.delete(id);
  writeSet(COMPLETED_KEY, s);
};

export const courseProgress = () => {
  const done = getCompletedChapters();
  return Math.round((done.size / chapters.length) * 100);
};

export const nextChapter = () => {
  const done = getCompletedChapters();
  return chapters.find((c) => !done.has(c.id)) || null;
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
  window.localStorage.setItem(PACKET_KEY, JSON.stringify(p));
};

export const loadPacket = () => {
  // Merge quiz answers in as defaults so the packet picks up what's already
  // known from the funnel.
  const quiz = loadAnswers();
  const own = readPacket();
  return {
    zip: quiz.zip || "",
    lotSize: quiz.lotSize || "",
    budget: quiz.budget || "",
    purpose: quiz.purpose || "",
    timeline: quiz.timeline || "",
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
export const mergeServerProgress = ({ completedChapters, builderPacket } = {}) => {
  if (Array.isArray(completedChapters) && completedChapters.length) {
    const s = getCompletedChapters();
    completedChapters.forEach((id) => s.add(id));
    writeSet(COMPLETED_KEY, s);
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

// Gates
export const FEASIBILITY_UNLOCK_AT = 80; // % course progress
export const isFeasibilityUnlocked = () => courseProgress() >= FEASIBILITY_UNLOCK_AT;
export const isBuildersUnlocked = () => isFeasibilityUnlocked() && packetProgress().percent >= 75;
