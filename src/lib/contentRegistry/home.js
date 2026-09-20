// Editable content for the Phase 1 homepage (src/pages/Home.jsx and
// src/components/home/*). Layout, icons and section order are code-owned;
// only wording, CTAs and photos are registered here. Defaults are the copy
// from the approved homepage mock (2026-09-20). See contentRegistry/index.js
// for the pattern.
import heroImg from "../../assets/home/hero_adu.jpg";
import missionImg from "../../assets/home/hero_image.png";
import familyImg from "../../assets/home/possible_family.jpg";
import incomeImg from "../../assets/home/choose_img2.png";
import communityImg from "../../assets/home/possible_community.jpg";

const PAGE = "Home";
const t = (label, def) => ({ page: PAGE, label, type: "text", default: def });
const img = (label, src, alt) => ({ page: PAGE, label, type: "image", default: { src, alt } });

// ── Hero ──────────────────────────────────────────────────────────────────
const homeHero = {
  "home.hero.heading": t("Hero heading (\\n = line break)", "Your ADU\nStarts Here."),
  "home.hero.body": t("Hero paragraph", "Find out what you can build, what it may cost, and what to do next."),
  "home.hero.cta": t("Hero button", "Check My Property"),
  "home.hero.placeholder": t("Address field placeholder", "Enter your property address"),
  "home.hero.reassurance": t("Line under the address box", "No credit card required"),
  "home.hero.image": img("Hero photo", heroImg, "A modern wood-clad backyard ADU with sliding glass doors and a deck at golden hour"),
};

// ── What's possible (text + three photo cards) ────────────────────────────
export const POSSIBLE_CARDS_COUNT = 3;
const homePossible = {
  "home.possible.heading": t("Section heading (\\n = line break)", "See What's Possible\non Your Property."),
  "home.possible.body": t("Section paragraph", "Every property is unique. ADUAtlas gives you the knowledge, tools, and connections to make the most of yours, whether you're building for family, for income, or for the future."),
  "home.possible.cta": t("Section button", "Check My Property"),
  "home.possible.card.0.title": t("Card 1 title", "More Space\nfor What Matters"),
  "home.possible.card.0.desc": t("Card 1 description", "Create flexible living for family, friends, or caregivers."),
  "home.possible.card.0.image": img("Card 1 photo", familyImg, "A warmly lit ADU living room seen through open glass doors"),
  "home.possible.card.1.title": t("Card 2 title", "Generate\nRental Revenue"),
  "home.possible.card.1.desc": t("Card 2 description", "Turn your property into a long-term asset."),
  "home.possible.card.1.image": img("Card 2 photo", incomeImg, "A finished detached ADU with its own entrance"),
  "home.possible.card.2.title": t("Card 3 title", "Stronger\nNeighborhoods"),
  "home.possible.card.2.desc": t("Card 3 description", "Thoughtful ADUs create more housing and stronger communities."),
  "home.possible.card.2.image": img("Card 3 photo", communityImg, "A backyard ADU beside the neighboring homes"),
};

// ── Plans (Golden / Platinum / Concierge, from the Phase 1 scope) ─────────
// Prices and bullets here are marketing copy. The checkout still resolves
// prices server-side from Stripe; keep both in step when repricing.
export const PLANS_COUNT = 3;
export const PLAN_BULLETS_COUNT = 4;
const homePlans = {
  "home.plans.heading": t("Plans heading (\\n = line break)", "Teach me. Analyze my property.\nHelp me move forward."),
  "home.plans.body": t("Plans paragraph", "Start with the course, add a property-specific feasibility study, or bring in a concierge for the next steps."),
  "home.plans.cta": t("Plans link", "Compare all plans"),
  "home.plans.item.0.name": t("Plan 1 name", "Golden"),
  "home.plans.item.0.price": t("Plan 1 price", "$79"),
  "home.plans.item.0.tagline": t("Plan 1 tagline", "Education + builder access"),
  "home.plans.item.0.bullet.0": t("Plan 1 bullet 1", "The full ADU course"),
  "home.plans.item.0.bullet.1": t("Plan 1 bullet 2", "State and city learning resources"),
  "home.plans.item.0.bullet.2": t("Plan 1 bullet 3", "Homeowner preparation tools"),
  "home.plans.item.0.bullet.3": t("Plan 1 bullet 4", "Builder profile access for one year"),
  "home.plans.item.1.name": t("Plan 2 name", "Platinum"),
  "home.plans.item.1.price": t("Plan 2 price", "$279"),
  "home.plans.item.1.tagline": t("Plan 2 tagline", "Property analysis"),
  "home.plans.item.1.bullet.0": t("Plan 2 bullet 1", "Everything in Golden"),
  "home.plans.item.1.bullet.1": t("Plan 2 bullet 2", "Property-specific feasibility study"),
  "home.plans.item.1.bullet.2": t("Plan 2 bullet 3", "ADUAtlas visual site plan"),
  "home.plans.item.1.bullet.3": t("Plan 2 bullet 4", "Pre-site and utility cost guidance"),
  "home.plans.item.2.name": t("Plan 3 name", "Concierge"),
  "home.plans.item.2.price": t("Plan 3 price", "$500"),
  "home.plans.item.2.tagline": t("Plan 3 tagline", "Guidance + support"),
  "home.plans.item.2.bullet.0": t("Plan 3 bullet 1", "Everything in Platinum"),
  "home.plans.item.2.bullet.1": t("Plan 3 bullet 2", "Personalized next-step guidance"),
  "home.plans.item.2.bullet.2": t("Plan 3 bullet 3", "Builder-match assistance"),
  "home.plans.item.2.bullet.3": t("Plan 3 bullet 4", "60 minutes of private ADU consultation"),
  "home.plans.featured_label": t("Featured plan label", "Most popular"),
  "home.plans.footnote": t("Plans footnote", "Golden applies as a credit toward Platinum. All plans include one year of access."),
};

// ── Builder teaser ────────────────────────────────────────────────────────
export const BUILDER_POINTS_COUNT = 3;
const homeBuilders = {
  "home.builders.heading": t("Builder heading (\\n = line break)", "Builders who work with\nprepared homeowners."),
  "home.builders.body": t("Builder paragraph", "Browse ADU builders by state and service area, see what they specialize in, and request an introduction when you are ready."),
  "home.builders.cta": t("Builder button", "Find a Builder"),
  "home.builders.point.0.title": t("Builder point 1 title", "Organized by area"),
  "home.builders.point.0.desc": t("Builder point 1 description", "Search by state, city, or ZIP to see who serves your property."),
  "home.builders.point.1.title": t("Builder point 2 title", "Clear specialties"),
  "home.builders.point.1.desc": t("Builder point 2 description", "Detached, attached, conversion, prefab, or factory-built."),
  "home.builders.point.2.title": t("Builder point 3 title", "Introductions on your terms"),
  "home.builders.point.2.desc": t("Builder point 3 description", "Save builders and request contact when your plan is ready."),
};

// ── Mission band ──────────────────────────────────────────────────────────
const homeMission = {
  "home.mission.heading": t("Mission heading", "More Homes. Stronger Communities."),
  "home.mission.body": t("Mission paragraph", "ADUs create housing, support families, and increase opportunity. We're here to make it easier for homeowners, builders, and communities to bring them to life."),
  "home.mission.cta": t("Mission button", "About Our Mission"),
  "home.mission.image": img("Mission background photo", missionImg, "Aerial view of a residential neighborhood"),
};

// ── Closing CTA band ──────────────────────────────────────────────────────
const homeCta = {
  "home.cta.heading": t("Closing heading", "Your property has potential."),
  "home.cta.body": t("Closing line", "Discover what's possible with ADUAtlas."),
  "home.cta.button": t("Closing button", "Get Started"),
};

export const HOME_CONTENT = {
  ...homeHero,
  ...homePossible,
  ...homePlans,
  ...homeBuilders,
  ...homeMission,
  ...homeCta,
};
