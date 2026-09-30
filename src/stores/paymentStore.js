// Client-side entitlement mirror. Returns whether the current user has access
// to gated content (the course, worksheets, feasibility study, builders).
//
// SECURITY NOTE: the localStorage flags below are a CLIENT-SIDE UX HINT only.
// They exist so the SPA can render the right state without a round-trip. The
// real entitlement gate is server-side `users.paid_at` (non-null AND not
// refunded) + `users.paid_tier`; any deliverable that costs money to produce
// must re-verify server-side before it is generated or served.
//
// Dev: localStorage.setItem('aduatlas.mock.paid','1') grants the base paid
// flag. It records no tier, so it unlocks only what every package includes;
// add localStorage.setItem('aduatlas.mock.tier','report') for the Platinum
// deliverables. The dev-only mock checkout (/welcome?tier=<tier>&mock=1, which
// a production build does not contain) sets both flags.
import { PLAN_IDS, planRank } from "../lib/plans";

const KEY = "aduatlas.mock.paid";
const TIER_KEY = "aduatlas.mock.tier";

// Tier ids, lowest -> highest entitlement. Ids are the users.paid_tier values.
//   roadmap   -> Golden ($79): course, resources, builder directory
//   report    -> Platinum ($279): Golden + worksheets + Ready Score + feasibility study + site plan
//   concierge -> Concierge ($500): Platinum + written portal support + 60 minutes of consultation
export const TIERS = { ROADMAP: PLAN_IDS.GOLDEN, REPORT: PLAN_IDS.PLATINUM, CONCIERGE: PLAN_IDS.CONCIERGE };

export const isPaid = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
};

// Synchronous tier read for render-time gating. Returns the persisted tier id,
// or null both when there is no purchase and when a paid flag carries no tier.
//
// A paid flag with no recorded tier used to read back as Concierge, so a
// tierless flag unlocked the worksheets, the ADU Ready Score and Concierge
// support, which are the $279 and $500 entitlements. An unknown tier is now
// unknown: it fails closed, and the caller gets only what the bare paid flag
// carries. Every consumer already handles null (planRank(null) is 0, so
// hasTier() is false for every tier, and planById(null) is null, which the
// dashboard, help and settings pages render as no plan yet).
export const getPaidTier = () => {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(KEY) !== "1") return null;
  return window.localStorage.getItem(TIER_KEY) || null;
};

// True iff the buyer's tier is at least `minTier` (Concierge includes
// Platinum, Platinum includes Golden). An unknown tier is never enough.
export const hasTier = (minTier) => planRank(getPaidTier()) >= planRank(minTier);

// Platinum-or-higher: the property-specific deliverables.
export const hasReportTier = () => hasTier(TIERS.REPORT);

// setPaid(true, "report")  -> mark paid AND record that tier
// setPaid(true)            -> mark paid and record NO tier; the flag alone
//                             unlocks only what every package includes
// setPaid(false)           -> clear the paid flag and the tier
//
// The tier argument is authoritative. An omitted tier used to leave whatever
// tier was already in localStorage in place, so a tier could outlive the
// purchase it came from: a Concierge tier from an earlier session survived a
// login to an account whose server row records no tier. The tier is now always
// rewritten from the argument, so the last writer of record, which is the
// server hydration in authStore, always wins.
export const setPaid = (v, tier) => {
  if (typeof window === "undefined") return;
  if (v) {
    window.localStorage.setItem(KEY, "1");
    if (tier) window.localStorage.setItem(TIER_KEY, tier);
    else window.localStorage.removeItem(TIER_KEY);
  } else {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(TIER_KEY);
  }
};
