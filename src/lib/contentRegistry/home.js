// Editable content for the Phase 1 homepage (src/pages/Home.jsx and
// src/components/home/*). Layout, icons and section order are code-owned;
// only wording, CTAs and photos are registered here. Defaults are the copy
// from the approved homepage mock (2026-09-20). See contentRegistry/index.js
// for the pattern.
import heroImg from "../../assets/home/hero_image.png";
import familyImg from "../../assets/home/choose_img2.png";
import incomeImg from "../../assets/home/choose_img3.png";
import communityImg from "../../assets/home/container_img.png";

const PAGE = "Home";
const t = (label, def) => ({ page: PAGE, label, type: "text", default: def });
const img = (label, src, alt) => ({ page: PAGE, label, type: "image", default: { src, alt } });

// ── Hero ──────────────────────────────────────────────────────────────────
export const HERO_CHECKS_COUNT = 4;
export const HERO_CARD_ITEMS_COUNT = 4;
export const homeHero = {
  "home.hero.eyebrow": t("Hero eyebrow", "Plan smarter. Build brighter."),
  "home.hero.heading": t("Hero heading (\\n = line break)", "Your ADU\nStarts Here."),
  "home.hero.body": t("Hero paragraph", "Get the data, guidance, and builder connections you need to turn your property's potential into reality."),
  "home.hero.cta": t("Hero button", "Explore My Property"),
  "home.hero.placeholder": t("Address field placeholder", "Enter your property address"),
  "home.hero.check.0": t("Hero checkmark 1", "Zoning & lot analysis"),
  "home.hero.check.1": t("Hero checkmark 2", "Estimated costs"),
  "home.hero.check.2": t("Hero checkmark 3", "Design options"),
  "home.hero.check.3": t("Hero checkmark 4", "Matched builders"),
  "home.hero.script": t("Handwritten line over the photo", "More Homes\nA Brighter Tomorrow."),
  "home.hero.card.title": t("Floating card title", "Turn your property into opportunity."),
  "home.hero.card.item.0": t("Floating card item 1", "Generate income"),
  "home.hero.card.item.1": t("Floating card item 2", "Add flexible living space"),
  "home.hero.card.item.2": t("Floating card item 3", "Increase property value"),
  "home.hero.card.item.3": t("Floating card item 4", "Support stronger communities"),
  "home.hero.image": img("Hero photo", heroImg, "A finished backyard ADU at dusk with its lights on"),
};

// ── Pillars (four-up strip under the hero) ────────────────────────────────
export const PILLARS_COUNT = 4;
export const homePillars = {
  "home.pillars.item.0.title": t("Pillar 1 title", "Learn\nthe basics"),
  "home.pillars.item.0.desc": t("Pillar 1 description", "Understand ADUs and what's possible on your property."),
  "home.pillars.item.1.title": t("Pillar 2 title", "Explore\nyour options"),
  "home.pillars.item.1.desc": t("Pillar 2 description", "See designs, costs, and zoning insights."),
  "home.pillars.item.2.title": t("Pillar 3 title", "Get matched\nwith builders"),
  "home.pillars.item.2.desc": t("Pillar 3 description", "Connect with vetted builders in your area."),
  "home.pillars.item.3.title": t("Pillar 4 title", "Build with\nconfidence"),
  "home.pillars.item.3.desc": t("Pillar 4 description", "Bring your ADU to life with the right plan and partners."),
};

// ── What's possible (text + three photo cards) ────────────────────────────
export const POSSIBLE_CARDS_COUNT = 3;
export const homePossible = {
  "home.possible.eyebrow": t("Section eyebrow", "Real data. Real possibilities."),
  "home.possible.heading": t("Section heading (\\n = line break)", "See What's Possible\non Your Property."),
  "home.possible.body": t("Section paragraph", "Every property is unique. ADUAtlas gives you the knowledge, tools, and connections to make the most of yours, whether you're building for family, for income, or for the future."),
  "home.possible.cta": t("Section button", "Check My Property"),
  "home.possible.card.0.eyebrow": t("Card 1 eyebrow", "For family"),
  "home.possible.card.0.title": t("Card 1 title", "More Space\nfor What Matters"),
  "home.possible.card.0.desc": t("Card 1 description", "Create flexible living for family, friends, or caregivers."),
  "home.possible.card.0.image": img("Card 1 photo", familyImg, "A compact green ADU with sliding glass doors"),
  "home.possible.card.1.eyebrow": t("Card 2 eyebrow", "For income"),
  "home.possible.card.1.title": t("Card 2 title", "Generate\nRental Revenue"),
  "home.possible.card.1.desc": t("Card 2 description", "Turn your property into a long-term asset."),
  "home.possible.card.1.image": img("Card 2 photo", incomeImg, "A prefab ADU module being lowered into place by crane"),
  "home.possible.card.2.eyebrow": t("Card 3 eyebrow", "For community"),
  "home.possible.card.2.title": t("Card 3 title", "Stronger\nNeighborhoods"),
  "home.possible.card.2.desc": t("Card 3 description", "Thoughtful ADUs create more housing and stronger communities."),
  "home.possible.card.2.image": img("Card 3 photo", communityImg, "A modular unit arriving on site"),
};

// ── Stats band ────────────────────────────────────────────────────────────
// PLACEHOLDER FIGURES from the mock. Replace with real numbers before any
// public deploy; publishing unverifiable claims is a trust problem for a
// product whose pitch is honest numbers.
export const STATS_COUNT = 3;
export const homeStats = {
  "home.stats.eyebrow": t("Stats eyebrow", "A growing movement"),
  "home.stats.heading": t("Stats heading (\\n = line break)", "Smaller Footprints.\nBigger Opportunities."),
  "home.stats.item.0.value": t("Stat 1 value", "50K+"),
  "home.stats.item.0.label": t("Stat 1 label", "Properties analyzed"),
  "home.stats.item.1.value": t("Stat 2 value", "8K+"),
  "home.stats.item.1.label": t("Stat 2 label", "Homeowners guided"),
  "home.stats.item.2.value": t("Stat 3 value", "1,200+"),
  "home.stats.item.2.label": t("Stat 3 label", "Builders in our network"),
  "home.stats.map_label": t("Map label", "Communities\nnationwide"),
};

// ── Mission band ──────────────────────────────────────────────────────────
export const homeMission = {
  "home.mission.eyebrow": t("Mission eyebrow", "Built for a brighter tomorrow"),
  "home.mission.heading": t("Mission heading", "More Homes. Stronger Communities."),
  "home.mission.body": t("Mission paragraph", "ADUs create housing, support families, and increase opportunity. We're here to make it easier for homeowners, builders, and communities to bring them to life."),
  "home.mission.cta": t("Mission button", "About Our Mission"),
  "home.mission.image": img("Mission background photo", heroImg, "Aerial view of a residential neighborhood"),
};

// ── Testimonials ──────────────────────────────────────────────────────────
// PLACEHOLDER QUOTES from the mock. Swap for real customer words (with
// permission) before any public deploy.
export const TESTIMONIALS_COUNT = 3;
export const homeTestimonials = {
  "home.testimonials.eyebrow": t("Testimonials eyebrow", "What homeowners are saying"),
  "home.testimonials.heading": t("Testimonials heading", "Real People. Real Progress."),
  "home.testimonials.link": t("Testimonials link", "See More Stories"),
  "home.testimonials.item.0.quote": t("Quote 1", "ADUAtlas made it easy to understand what was possible on my property. The report was super helpful and connected me with an amazing builder."),
  "home.testimonials.item.0.name": t("Quote 1 name", "Sarah M."),
  "home.testimonials.item.0.place": t("Quote 1 place", "Austin, TX"),
  "home.testimonials.item.1.quote": t("Quote 2", "I had no idea where to start. ADUAtlas gave me clarity, options, and a builder I could trust. We're now breaking ground!"),
  "home.testimonials.item.1.name": t("Quote 2 name", "James T."),
  "home.testimonials.item.1.place": t("Quote 2 place", "San Diego, CA"),
  "home.testimonials.item.2.quote": t("Quote 3", "A must-use for any homeowner considering an ADU. The insights and resources saved me months of research."),
  "home.testimonials.item.2.name": t("Quote 3 name", "Priya K."),
  "home.testimonials.item.2.place": t("Quote 3 place", "Denver, CO"),
};

// ── Closing CTA band ──────────────────────────────────────────────────────
export const homeCta = {
  "home.cta.heading": t("Closing heading", "Your property has potential."),
  "home.cta.body": t("Closing line", "Discover what's possible with ADUAtlas."),
  "home.cta.button": t("Closing button", "Get Started"),
};

export const HOME_CONTENT = {
  ...homeHero,
  ...homePillars,
  ...homePossible,
  ...homeStats,
  ...homeMission,
  ...homeTestimonials,
  ...homeCta,
};
