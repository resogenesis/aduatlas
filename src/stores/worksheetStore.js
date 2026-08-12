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

// ── ADU Ready Score (NAPE-aligned) ──────────────────────────────────────────
// 20 Yes/No questions in three groups. Preparedness questions auto-answer from
// the project brief; property and budget flags come from Module 7 (NAPE):
// property killers + budget killers. Phrased so "Yes" is always the favorable
// answer. Every flag is a "verify with your local planning department" prompt,
// never a verdict — outcomes vary by property and municipality.

export const READY_SCORE_GROUPS = [
  {
    id: "prep",
    title: "Preparedness",
    blurb: "Auto-checked from your project brief — fill My Property to improve these.",
    items: [
      { id: "prep-address", q: "Property address on file", fromPacket: "address" },
      { id: "prep-lot", q: "Approximate lot size known", fromPacket: "lotSize" },
      { id: "prep-purpose", q: "Intended use defined", fromPacket: "purpose" },
      { id: "prep-type", q: "Target ADU type selected", fromPacket: "aduType" },
      { id: "prep-size", q: "Target ADU size chosen", fromPacket: "desiredSqft" },
      { id: "prep-budget", q: "Budget range set", fromPacket: "budget" },
      { id: "prep-timeline", q: "Timeline goal set", fromPacket: "timeline" },
    ],
  },
  {
    id: "property",
    title: "Property flags",
    blurb: "The conditions that can stop or shrink a build (Module 7). Answer as far as you know today.",
    items: [
      { id: "prop-space", q: "Is there enough usable yard area for an ADU after setbacks and lot-coverage rules?" },
      { id: "prop-access", q: "Can the property and build area be reached in a way your city would consider acceptable?" },
      { id: "prop-easements", q: "Is the likely build area free of utility, drainage, or access easements?" },
      { id: "prop-slope", q: "Is the site relatively flat, without steep slopes or difficult terrain?" },
      { id: "prop-overlay", q: "Is the property outside flood zones, wetlands, or other environmental overlays?" },
      { id: "prop-coverage", q: "Do existing structures leave room within what your city allows on the lot?" },
      { id: "prop-utilities", q: "Are utility connections within reasonable reach, with capacity for a second dwelling?" },
    ],
  },
  {
    id: "budget",
    title: "Budget flags",
    blurb: "Costs that don't stop a build on paper but can stop it in your bank account (Module 7).",
    items: [
      { id: "bud-utilities", q: "Can you rule out long utility extensions or a service-capacity upgrade?" },
      { id: "bud-earthwork", q: "Can you rule out significant excavation, grading, or earthwork?" },
      { id: "bud-retaining", q: "Can you rule out retaining walls or drainage systems required by the terrain?" },
      { id: "bud-subsurface", q: "Can you rule out tree removal, rock, or subsurface surprises?" },
      { id: "bud-engineering", q: "Can you rule out engineering or geotechnical studies triggered by slope or soils?" },
      { id: "bud-fees", q: "Are local fees, connection charges, and permit costs accounted for in your budget?" },
    ],
  },
];

export const READY_SCORE_TOTAL = READY_SCORE_GROUPS.reduce((n, g) => n + g.items.length, 0);

// A–F on the count of favorable answers out of 20.
export const gradeReadyScore = (yesCount) => {
  if (yesCount >= 18) return "A";
  if (yesCount >= 16) return "B";
  if (yesCount >= 14) return "C";
  if (yesCount >= 12) return "D";
  return "F";
};

// Module 7's three honest outcomes: each is a success when reached before
// money is spent.
export const readyScoreOutcome = (grade) => {
  if (grade === "A" || grade === "B") {
    return {
      label: "Proceed",
      note: "No major killers surfaced. Move ahead to the detailed (and more costly) verification steps — and confirm each remaining flag with your local planning department.",
    };
  }
  if (grade === "C" || grade === "D") {
    return {
      label: "Adjust",
      note: "Issues exist but may be workable — changing the ADU type, size, placement, or budget can resolve many flags. Verify each one with your local planning department before spending.",
    };
  }
  return {
    label: "Pause",
    note: "Several flags together may be telling you this isn't the right project right now. That's a win when you learn it before a builder deposit — confirm the hard flags with your city before going further.",
  };
};
