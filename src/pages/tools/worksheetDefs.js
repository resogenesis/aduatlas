// Shared row definitions + total formulas for the workbook worksheets.
// Single source of truth: the worksheet pages render/edit these rows, and the
// Property Report recomputes the same totals from the stored values.
import { num } from "../../components/tools/worksheetKit";

// ── Worksheet 1: Pre-site Estimate ───────────────────────────────────────────
export const PRESITE_UTILITIES = ["Water", "Sewer", "Electric", "Gas"];
export const PRESITE_ITEMS = ["Retaining Wall", "Obstacle", "Foundation", "Survey"];

export const presiteUtilCost = (d, u) =>
  num(d[`${u}-dist`]) * num(d[`${u}-lf`]) + num(d[`${u}-permit`]) + num(d[`${u}-conn`]);
export const presiteItemCost = (d, it) =>
  num(d[`${it}-qty`]) * num(d[`${it}-unit-cost`]) + num(d[`${it}-permit`]) + num(d[`${it}-conn`]) + num(d[`${it}-other`]);
export const presiteTotal = (d) =>
  PRESITE_UTILITIES.reduce((s, u) => s + presiteUtilCost(d, u), 0) +
  PRESITE_ITEMS.reduce((s, it) => s + presiteItemCost(d, it), 0);

// ── Worksheet 2: Pre-Site Verification summary ───────────────────────────────
export const VERIFICATION_SUMMARY = [
  { key: "water-sewer", label: "Water / sewer connection estimate" },
  { key: "electric", label: "Electric connection estimate" },
  { key: "gas", label: "Gas connection estimate" },
  { key: "city-fees", label: "City / permit fees" },
  { key: "other", label: "Other known pre-site costs" },
];
export const verificationTotal = (d) =>
  VERIFICATION_SUMMARY.reduce((s, r) => s + num(d[`sum-${r.key}`]), 0);

// ── Worksheet 5: Total ADU Project Cost ──────────────────────────────────────
export const TPC_GROUPS = [
  { label: "ADU / construction", rows: ["Selected ADU / Base Unit OR Builder Construction Quote", "Options / Upgrades", "Assembly", "Delivery / Transportation", "Crane / Set, if applicable"] },
  { label: "Pre-site", rows: ["Obstacle Removal", "Excavation / Grading", "Foundation", "Water Connection", "Sewer Connection", "Electric Connection", "Gas, if applicable", "Retaining Wall", "Access / Site Restoration / Landscape"] },
  { label: "City / professional fees", rows: ["Permits / City Fees", "Design / Plans", "Survey / Plans", "Engineering", "Other Professional Fees"] },
  { label: "Other known costs", rows: ["Taxes", "Contingency or Change Orders"] },
];
export const TPC_ROWS = TPC_GROUPS.flatMap((g) => g.rows);
export const tpcTotals = (d) => ({
  est: TPC_ROWS.reduce((s, r) => s + num(d[`${r}-est`]), 0),
  final: TPC_ROWS.reduce((s, r) => s + num(d[`${r}-final`]), 0),
});
