// Client-side entitlement mirror. Returns whether the current user has access
// to gated content (the course, worksheets, feasibility study, builders).
//
// SECURITY NOTE: the localStorage flags below are a CLIENT-SIDE UX HINT only.
// They exist so the SPA can render the right state without a round-trip. The
// real entitlement gate is server-side `users.paid_at` (non-null AND not
// refunded) + `users.paid_tier`; any deliverable that costs money to produce
// must re-verify server-side before it is generated or served.
//
// Dev: localStorage.setItem('aduatlas.mock.paid','1') grants access. The mock
// checkout flow (/welcome?tier=<tier>&mock=1) sets both flags.
import { PLAN_IDS, planRank } from "../lib/plans";

const KEY = "aduatlas.mock.paid";
const TIER_KEY = "aduatlas.mock.tier";

// Tier ids, lowest -> highest entitlement. Ids are the users.paid_tier values.
//   roadmap   -> Golden ($79): course, resources, worksheets, builder profiles
//   report    -> Platinum ($279): Golden + feasibility study + site plan
//   concierge -> Concierge ($500): Platinum + portal support + consultation
export const TIERS = { ROADMAP: PLAN_IDS.GOLDEN, REPORT: PLAN_IDS.PLATINUM, CONCIERGE: PLAN_IDS.CONCIERGE };

export const isPaid = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
};

// Synchronous tier read for render-time gating. Returns the persisted tier id
// or null when there's no recorded purchase. A paid-but-tierless flag (legacy
// purchases made before tiers were recorded) falls back to the highest tier; every real purchase writes an
// explicit tier, so a Golden buyer reads back "roadmap" and stays gated.
export const getPaidTier = () => {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(KEY) !== "1") return null;
  return window.localStorage.getItem(TIER_KEY) || TIERS.CONCIERGE;
};

// True iff the buyer's tier is at least `minTier` (Concierge includes
// Platinum, Platinum includes Golden).
export const hasTier = (minTier) => planRank(getPaidTier()) >= planRank(minTier);

// Platinum-or-higher: the property-specific deliverables.
export const hasReportTier = () => hasTier(TIERS.REPORT);

// setPaid(true)                 -> mark paid, leave tier untouched (legacy callers)
// setPaid(true, "report")       -> mark paid AND record the tier
// setPaid(false)                -> clear paid flag + tier
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
