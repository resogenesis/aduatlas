// Mock builder-side store. Generates qualified Builder Packets (homeowners
// who completed the system) and tracks status per builder.
//
// INTEGRATION POINT (Supabase): replace with reads against the `leads` table.
// Each homeowner who runs Feasibility + completes ≥75% of their packet
// produces one row with: ZIP, ADU type, lot dims, budget, timeline, score,
// builder packet snapshot. Builder sees leads filtered to their service area.

const STATUS_KEY = "aduatlas.builder.leadStatus";
const PROFILE_KEY = "aduatlas.builder.profile";

// ── Mock leads ──────────────────────────────────────────────────────────────
// Realistic-looking but fully fake. Each represents a homeowner who paid,
// completed the course, ran feasibility, and submitted their packet.

export const mockLeads = [
  {
    id: "L-1042",
    homeowner: "S. Martinez",
    city: "Pasadena",
    state: "CA",
    zip: "91103",
    score: 84,
    band: "Build-ready",
    aduType: "Detached prefab",
    desiredSqft: 720,
    lotSize: "5,000–10,000 sq ft",
    budget: "$200K–$400K",
    timeline: "Within 6 months",
    purpose: "Aging parent",
    submittedAt: "2026-04-26",
    courseProgress: 100,
    packetPercent: 92,
    notes: "Detached single story. Side-yard access ~9 ft. Sewer ~30 ft from proposed pad.",
  },
  {
    id: "L-1041",
    homeowner: "J. Patel",
    city: "Long Beach",
    state: "CA",
    zip: "90803",
    score: 78,
    band: "Almost there",
    aduType: "Garage conversion",
    desiredSqft: 480,
    lotSize: "3,000–5,000 sq ft",
    budget: "$100K–$200K",
    timeline: "6–12 months",
    purpose: "Rental income",
    submittedAt: "2026-04-24",
    courseProgress: 100,
    packetPercent: 83,
    notes: "Existing 2-car garage. Wants to keep one bay parking-only.",
  },
  {
    id: "L-1039",
    homeowner: "K. Nguyen",
    city: "San Diego",
    state: "CA",
    zip: "92104",
    score: 71,
    band: "Almost there",
    aduType: "Detached stick-built",
    desiredSqft: 850,
    lotSize: "5,000–10,000 sq ft",
    budget: "$200K–$400K",
    timeline: "1–2 years",
    purpose: "Adult child",
    submittedAt: "2026-04-23",
    courseProgress: 100,
    packetPercent: 75,
    notes: "Two-story preferred. Mature trees on lot, may need easement adjustment.",
  },
  {
    id: "L-1037",
    homeowner: "R. Cohen",
    city: "Berkeley",
    state: "CA",
    zip: "94703",
    score: 88,
    band: "Build-ready",
    aduType: "SIP panel",
    desiredSqft: 600,
    lotSize: "3,000–5,000 sq ft",
    budget: "$200K–$400K",
    timeline: "Within 6 months",
    purpose: "Office / studio",
    submittedAt: "2026-04-21",
    courseProgress: 100,
    packetPercent: 100,
    notes: "Already has architect. Looking specifically for SIP-experienced builder.",
  },
  {
    id: "L-1035",
    homeowner: "M. Tanaka",
    city: "Sacramento",
    state: "CA",
    zip: "95818",
    score: 66,
    band: "Almost there",
    aduType: "Container hybrid",
    desiredSqft: 540,
    lotSize: "5,000–10,000 sq ft",
    budget: "$100K–$200K",
    timeline: "6–12 months",
    purpose: "Rental income",
    submittedAt: "2026-04-19",
    courseProgress: 100,
    packetPercent: 78,
    notes: "Open to alternatives if container isn't permitted in their zone.",
  },
  {
    id: "L-1033",
    homeowner: "P. Singh",
    city: "Oakland",
    state: "CA",
    zip: "94610",
    score: 81,
    band: "Build-ready",
    aduType: "Detached prefab",
    desiredSqft: 800,
    lotSize: "10,000+ sq ft",
    budget: "$400K+",
    timeline: "Within 6 months",
    purpose: "Increase property value",
    submittedAt: "2026-04-17",
    courseProgress: 100,
    packetPercent: 92,
    notes: "Has clear access. Wants high-end finishes. Budget flexible.",
  },
  {
    id: "L-1029",
    homeowner: "L. Foster",
    city: "Seattle",
    state: "WA",
    zip: "98115",
    score: 73,
    band: "Almost there",
    aduType: "Detached stick-built",
    desiredSqft: 650,
    lotSize: "5,000–10,000 sq ft",
    budget: "$200K–$400K",
    timeline: "1–2 years",
    purpose: "Aging parent",
    submittedAt: "2026-04-14",
    courseProgress: 100,
    packetPercent: 83,
    notes: "Lot has 12% slope on north side. Open to single story.",
  },
];

// ── Status persistence ──────────────────────────────────────────────────────
// Statuses: "new" (default), "viewed", "claimed", "won", "lost"

const readStatuses = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeStatuses = (s) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATUS_KEY, JSON.stringify(s));
};

export const getLeadStatus = (id) => readStatuses()[id] || "new";

export const setLeadStatus = (id, status) => {
  const all = readStatuses();
  all[id] = status;
  writeStatuses(all);
};

export const allLeads = () => mockLeads.map((l) => ({ ...l, status: getLeadStatus(l.id) }));

export const getLead = (id) => {
  const lead = mockLeads.find((l) => l.id === id);
  if (!lead) return null;
  return { ...lead, status: getLeadStatus(id) };
};

export const builderStats = () => {
  const leads = allLeads();
  return {
    total: leads.length,
    newCount: leads.filter((l) => l.status === "new").length,
    viewed: leads.filter((l) => l.status === "viewed").length,
    claimed: leads.filter((l) => l.status === "claimed").length,
    won: leads.filter((l) => l.status === "won").length,
    avgScore: Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length),
  };
};

// ── Builder profile ─────────────────────────────────────────────────────────

const DEFAULT_PROFILE = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  serviceAreas: "", // comma-separated ZIPs or city names
  aduTypes: [],     // ["prefab", "stick-built", ...]
  yearsExperience: "",
  about: "",
};

export const loadBuilderProfile = () => {
  if (typeof window === "undefined") return { ...DEFAULT_PROFILE };
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
};

export const saveBuilderProfile = (p) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
};
