// Confidence system. Every output presented to a homeowner — feasibility,
// cost, setback, utility, anything — has a confidence level. The system
// distinguishes what we *know* from what we *estimate* from what we don't
// know yet, and turns uncertainty into a visible upsell.
//
// Levels:
//   high   — verified from authoritative source (county/city records, GIS)
//   medium — modeled from public data + standard assumptions
//   low    — unknown / requires site verification
//
// Anywhere a row is medium or low → upgrade to Feasibility Report removes
// the uncertainty. That's the entire pricing rationale.

export const CONFIDENCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export const CONFIDENCE_META = {
  high: {
    label: "High",
    dot: "#C6F24E",
    chip: "bg-accent/15 text-accent border-accent/30",
    description: "Verified from authoritative public data.",
  },
  medium: {
    label: "Medium",
    dot: "#F1C04E",
    chip: "bg-yellow-400/10 text-yellow-300 border-yellow-400/30",
    description: "Modeled from public data and standard assumptions. Verify before construction.",
    canUpgrade: true,
  },
  low: {
    label: "Low",
    dot: "#F87171",
    chip: "bg-red-400/10 text-red-300 border-red-400/30",
    description: "Requires on-site verification or city confirmation.",
    canUpgrade: true,
  },
};

// Tier levels. Aligned with pricing.
export const TIER = {
  FREE: "free",          // exploration
  ROADMAP: "roadmap",    // $79
  REPORT: "report",      // $399 — verifies medium/low rows
  CONCIERGE: "concierge",
};

// Build a single output row with confidence + source + optional upgrade CTA.
//
// Example:
//   datapoint({
//     label: "Max ADU size",
//     value: "~720 sq ft",
//     confidence: "medium",
//     source: "Zoning model",
//     lastUpdated: "2026-04-12",
//     toGreen: "Cross-check Pasadena §17.50.290 + 2024 lot-coverage amendment.",
//     unlocksAt: TIER.REPORT,
//   })
//
// `toGreen` is what would raise the confidence to high — the engine of the
// upsell. Surfaced inline as a 'What would make this green?' expander.
export const datapoint = ({ label, value, confidence, source, lastUpdated, toGreen, unlocksAt, note }) => ({
  label,
  value,
  confidence,
  source: source || null,
  lastUpdated: lastUpdated || null,
  toGreen: toGreen || null,
  unlocksAt: unlocksAt || null,
  note: note || null,
  canUpgrade: Boolean(CONFIDENCE_META[confidence]?.canUpgrade && unlocksAt),
});
