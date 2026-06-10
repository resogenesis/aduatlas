// Mock payment store. Returns whether the current user has access to gated
// content (the course, builders, feasibility tool).
//
// INTEGRATION POINT (Supabase + Stripe webhook): replace with a check
// against `users.paid_at` in Supabase. The webhook on
// `checkout.session.completed` sets that timestamp; this function should
// return true iff paid_at is non-null AND not refunded.
//
// SECURITY NOTE: the localStorage flag below is a CLIENT-SIDE UX HINT only.
// It exists so the SPA can render the right state without a round-trip. The
// real entitlement gate is server-side `users.paid_at` (non-null AND not
// refunded) + `users.paid_tier`; any deliverable that costs money to produce
// (GIS packet, builder match, etc.) must re-verify server-side before it is
// generated or served. Do not treat this flag as proof of payment.
//
// For now: localStorage.getItem('aduatlas.mock.paid') === '1' grants access.
// Use the dev-only bookmarklet:
//   javascript:localStorage.setItem('aduatlas.mock.paid','1');location.reload();
// The mock checkout flow (/welcome?tier=<tier>&mock=1) sets both flags.

const KEY = "aduatlas.mock.paid";
const TIER_KEY = "aduatlas.mock.tier";

// Tiers, lowest → highest entitlement.
//   roadmap → $99 "ADU Build Prepared" course (course + dashboard + my-property)
//   report  → $399 "Property Feasibility Report" (course PLUS the feasibility
//             packet deliverables: feasibility tool, utility estimator, builder
//             match, GIS packet)
export const TIERS = { ROADMAP: "roadmap", REPORT: "report" };

export const isPaid = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
};

// Synchronous tier read for render-time gating. Returns the persisted tier
// string ("roadmap" | "report") or null when there's no recorded purchase.
// Kept synchronous on purpose so PaidGate can branch during render; the
// authoritative tier lives in Supabase `users.paid_tier`.
//
// Backward-compat: legacy callers flip the paid flag with no tier (e.g. the
// mock login demo accounts in authStore via `setPaid(true)`). Those represent
// full-access demo users, so a paid-but-tierless flag falls back to the highest
// tier. This does NOT over-grant a real $99 buyer: every real/mock PURCHASE
// goes through /welcome (or the server), which always writes an explicit tier
// ("roadmap" for $99), so a $99 buyer reads back "roadmap" and stays locked out
// of the $399 deliverables.
export const getPaidTier = () => {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(KEY) !== "1") return null;
  return window.localStorage.getItem(TIER_KEY) || TIERS.REPORT;
};

// True iff the buyer is entitled to the $399 report-tier deliverables.
export const hasReportTier = () => getPaidTier() === TIERS.REPORT;

// setPaid(true)                 → mark paid, leave tier untouched (legacy callers)
// setPaid(true, "report")       → mark paid AND record the tier
// setPaid(false)                → clear paid flag + tier
export const setPaid = (v, tier) => {
  if (typeof window === "undefined") return;
  if (v) {
    window.localStorage.setItem(KEY, "1");
    if (tier) window.localStorage.setItem(TIER_KEY, tier);
  } else {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(TIER_KEY);
  }
};
