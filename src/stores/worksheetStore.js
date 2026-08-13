// Worksheet state for the $399 Property Feasibility Report packet.
//
// Data model: worksheets live INSIDE the builder packet (users.builder_packet
// jsonb) under a single `worksheets` key, so they ride the existing
// localStorage mirror + Supabase persistence + login hydration without any
// schema change. packetProgress() only counts PACKET_FIELDS, so this key
// never skews the packet-completion math.

import { loadPacket, savePacket } from "./courseStore";
import { saveBuilderPacket } from "../lib/supabase";

export const loadWorksheets = () => loadPacket().worksheets || {};

export const loadWorksheet = (key) => loadWorksheets()[key] || null;

export const saveWorksheet = (key, data) => {
  const packet = loadPacket();
  const next = {
    ...packet,
    worksheets: { ...(packet.worksheets || {}), [key]: data },
  };
  savePacket(next);
  // Best-effort server mirror; the local save above is the source of truth.
  saveBuilderPacket(next);
  return data;
};


// ── National ADU Property Evaluation (NAPE) ──────────────────────────────────
// The official NAPE scoring system from Module 7: five weighted categories,
// 100 possible points, answered Yes/No. Phrased so "Yes" is always favorable.
// Grade F ("False Start") overrides the point score whenever an automatic
// no-go condition (Module 7, Chapter 4) is answered No. An early planning
// tool, not a permit approval — outcomes vary by property and municipality.

export const NAPE_CATEGORIES = [
  {
    id: "zoning",
    title: "Zoning & legal feasibility",
    points: 30,
    items: [
      { id: "z-permitted", q: "Is an ADU permitted by your local zoning?", noGo: true },
      { id: "z-lot-size", q: "Does your lot meet the minimum lot size requirement?", noGo: true },
      { id: "z-lot-dims", q: "Does your lot meet minimum width and depth requirements?", noGo: true },
      { id: "z-max-size", q: "Can a worthwhile ADU comply with the maximum-size regulations?" },
      { id: "z-height", q: "Can the ADU meet local height limits?" },
      { id: "z-setbacks", q: "Do required setbacks leave a usable buildable area?", noGo: true },
      { id: "z-percentage", q: "Does the ADU stay within any percentage-of-primary-home size limit?" },
      { id: "z-hoa", q: "Have you reviewed HOA or deed restrictions — and none prohibit an ADU?", noGo: true },
      { id: "z-historic", q: "Have you reviewed historic-district requirements — and none prohibit an ADU?", noGo: true },
      { id: "z-separation", q: "Can the ADU meet the minimum separation distance from the primary residence?" },
    ],
  },
  {
    id: "site",
    title: "Lot & physical site conditions",
    points: 25,
    items: [
      { id: "s-slope", q: "Is the site free of significant slope or challenging topography?" },
      { id: "s-overlay", q: "Is the property outside floodplains and environmental overlays?" },
      { id: "s-trees", q: "Is the site free of protected trees or habitat conflicts?" },
      { id: "s-easements", q: "Is the buildable area free of utility or drainage easements?", noGo: true },
      { id: "s-area", q: "Is there adequate buildable backyard area?" },
    ],
  },
  {
    id: "utilities",
    title: "Utilities & infrastructure",
    points: 15,
    items: [
      { id: "u-access", q: "Is utility access available to the proposed site?" },
      { id: "u-septic", q: "If on septic, is the system suitable for an additional dwelling? (Yes if not applicable)" },
      { id: "u-connections", q: "Are water, sewer, and electrical connections feasible?" },
    ],
  },
  {
    id: "access",
    title: "Site access & construction logistics",
    points: 15,
    items: [
      { id: "a-emergency", q: "Is emergency access to the ADU achievable?" },
      { id: "a-construction", q: "Is there backyard access for construction?" },
      { id: "a-crane", q: "Is crane or delivery access available if needed?" },
      { id: "a-overhead", q: "Is the site free of overhead utility conflicts?" },
    ],
  },
  {
    id: "financial",
    title: "Market & financial practicality",
    points: 15,
    items: [
      { id: "f-site-costs", q: "Are site preparation costs reasonable for your budget?" },
      { id: "f-size", q: "Does the ADU size justify the investment?" },
      { id: "f-financing", q: "Is financing available?" },
      { id: "f-market", q: "Is there rental or resale potential?" },
      { id: "f-practical", q: "Is the project financially practical overall?" },
    ],
  },
];

export const NAPE_TOTAL_ITEMS = NAPE_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

// Points, grade, no-go flags, and per-category earned points from an
// { itemId: true|false } answer map. Grade is null until every item is
// answered; F overrides points whenever a no-go item is No.
export const scoreNape = (answers) => {
  let points = 0;
  const perCategory = {};
  const noGoFlags = [];
  let answered = 0;
  for (const cat of NAPE_CATEGORIES) {
    const yes = cat.items.filter((it) => answers[it.id] === true).length;
    const earned = (yes / cat.items.length) * cat.points;
    perCategory[cat.id] = Math.round(earned * 10) / 10;
    points += earned;
    for (const it of cat.items) {
      if (answers[it.id] !== undefined) answered++;
      if (it.noGo && answers[it.id] === false) noGoFlags.push(it);
    }
  }
  points = Math.round(points);
  const complete = answered === NAPE_TOTAL_ITEMS;
  let grade = null;
  if (complete) {
    if (noGoFlags.length) grade = "F";
    else if (points >= 90) grade = "A";
    else if (points >= 80) grade = "B";
    else if (points >= 70) grade = "C";
    else grade = "D";
  }
  return { points, perCategory, noGoFlags, answered, complete, grade };
};

// Module 7, Chapter 8 — what each grade means.
export const NAPE_GRADES = {
  A: { label: "Excellent candidate", note: "No significant legal, physical, or financial obstacles have been identified. Proceed with confidence and begin preparing your detailed feasibility review." },
  B: { label: "Good candidate", note: "The property appears suitable for an ADU, but several items require additional investigation before moving forward." },
  C: { label: "Proceed with caution", note: "Several factors require additional research. Complete a detailed feasibility study before making major financial commitments." },
  D: { label: "High-risk project", note: "Significant legal, physical, or financial obstacles have been identified. Carefully evaluate whether the project still makes financial sense." },
  F: { label: "False start", note: "One or more major project killers have been identified. Sometimes the smartest financial decision is recognizing when a project should not move forward." },
};

// ── Lot / envelope state ─────────────────────────────────────────────────────
// The feasibility model's inputs + parcel-lookup snapshot, persisted under
// builder_packet.lot so the Property Report renders the same geometry the
// homeowner tuned in the Feasibility tool.
export const loadLot = () => loadPacket().lot || null;

export const saveLot = (lot) => {
  const packet = loadPacket();
  const next = { ...packet, lot };
  savePacket(next);
  saveBuilderPacket(next);
  return lot;
};
