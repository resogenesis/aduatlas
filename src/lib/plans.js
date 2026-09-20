// Single source of truth for the three Phase 1 plans. Plan ids are the values
// stored in users.paid_tier and sent to Stripe metadata; they predate the
// plan names, so "roadmap" = Golden and "report" = Platinum. Do not rename
// the ids without a data migration.
//
// Prices here drive the pricing page copy and the upgrade-credit math in
// api/create-checkout.js. The Stripe Price objects (STRIPE_PRICE_*) must be
// kept in step with these amounts.

export const PLAN_IDS = { GOLDEN: "roadmap", PLATINUM: "report", CONCIERGE: "concierge" };

export const PLANS = [
  {
    id: PLAN_IDS.GOLDEN,
    rank: 1,
    name: "Golden",
    priceCents: 7900,
    tagline: "Education + builder access",
    summary: "Learn the ADU process before spending significant time and money, and see who builds ADUs near you.",
    bullets: [
      "The complete ADUAtlas course",
      "State and city learning resources",
      "Homeowner preparation tools and worksheets",
      "Builder profile access for one year",
    ],
  },
  {
    id: PLAN_IDS.PLATINUM,
    rank: 2,
    name: "Platinum",
    priceCents: 27900,
    tagline: "Property analysis",
    summary: "Everything in Golden, plus a feasibility study and visual site plan prepared for your property.",
    bullets: [
      "Everything in Golden",
      "Property-specific feasibility study",
      "ADUAtlas visual site plan",
      "Zoning and property constraints",
      "ADU size and type guidance",
      "Pre-site and utility cost guidance",
      "Recommended next steps",
    ],
    featured: true,
  },
  {
    id: PLAN_IDS.CONCIERGE,
    rank: 3,
    name: "Concierge",
    priceCents: 50000,
    tagline: "Guidance + support",
    summary: "Everything in Platinum, plus a person to help you interpret your materials and take the next steps.",
    bullets: [
      "Everything in Platinum",
      "Online support through the ADUAtlas portal",
      "Personalized next-step guidance",
      "Builder-match assistance",
      "60 minutes of private ADU consultation, as one call or two 30-minute calls",
    ],
  },
];

export const planById = (id) => PLANS.find((p) => p.id === id) || null;
export const planRank = (id) => planById(id)?.rank ?? 0;
export const formatPrice = (cents) => `$${Math.round(cents / 100).toLocaleString()}`;

// Upgrade credit: what a buyer already paid comes off the next plan up.
// Golden -> Platinum credits $79 (pays $200); Platinum -> Concierge credits
// $279 (pays $221); Golden -> Concierge credits $79. Same or lower rank: 0.
export const upgradeCreditCents = (ownedId, targetId) => {
  const owned = planById(ownedId);
  const target = planById(targetId);
  if (!owned || !target || owned.rank >= target.rank) return 0;
  return Math.min(owned.priceCents, target.priceCents);
};

// Concierge scope, in the words agreed for the site.
export const CONCIERGE_BOUNDARY =
  "Concierge is guidance, not construction project management. Portal support helps you interpret your ADUAtlas materials and navigate early decisions. Consultation time is capped at 60 minutes total, used as one 60-minute session or two 30-minute sessions.";
