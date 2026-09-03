// Editable content for Home.jsx + its components (QuizHero, RiskCallouts,
// FunnelSteps). Icons and layout stay code-owned — only wording/CTAs are
// registered here. See src/lib/contentRegistry/index.js for the pattern this
// follows across every page.
const PAGE = "Home";

// ── QuizHero ──────────────────────────────────────────────────────────────
export const homeQuizHero = {
  "home.quizhero.eyebrow": { page: PAGE, label: "Hero eyebrow", type: "text", default: "ADUAtlas Pre-Construction Preparation for Homeowners" },
  "home.quizhero.heading_pre": { page: PAGE, label: "Hero heading (before emphasis)", type: "text", default: "Find Out What You Can" },
  "home.quizhero.heading_emphasis": { page: PAGE, label: "Hero heading (emphasized)", type: "text", default: "Legally Build" },
  "home.quizhero.heading_post": { page: PAGE, label: "Hero heading (after emphasis)", type: "text", default: "on Your Property" },
  "home.quizhero.body": {
    page: PAGE, label: "Hero paragraph", type: "text",
    default: "Most homeowners underestimate the complexity of building an ADU and end up making mistakes that cost time and money. ADUAtlas gives homeowners the opportunity to learn the process and obtain property-specific information before making important decisions. Before investing in surveys, site plans, permits, or builder consultations, you need to understand your local ADU zoning regulations, pre-site costs, project timelines, and available ADU options.",
  },
  "home.quizhero.gauge_result_title": { page: PAGE, label: "Sample-score card result title", type: "text", default: "Foundational gaps" },
  "home.quizhero.gauge_result_desc": { page: PAGE, label: "Sample-score card result description", type: "text", default: "Three things to fix before talking to a builder." },
};

// ── RiskCallouts ──────────────────────────────────────────────────────────
// Icons stay in the component, keyed by the same index as these titles/descs.
export const RISK_ITEMS_COUNT = 6;

export const homeRiskCallouts = {
  "home.riskcallouts.eyebrow": { page: PAGE, label: "Section eyebrow", type: "text", default: "Where projects derail" },
  "home.riskcallouts.heading_pre": { page: PAGE, label: "Heading (first sentence)", type: "text", default: "Most homeowners are unprepared." },
  "home.riskcallouts.heading_emphasis": { page: PAGE, label: "Heading (emphasized sentence)", type: "text", default: "This is how projects go off track." },
  "home.riskcallouts.intro": {
    page: PAGE, label: "Intro line (single \\n = line break)", type: "text",
    default: "Learn about the process and products before you waste any time or money.\nADUAtlas provides specific information on both.",
  },
  "home.riskcallouts.item.0.title": { page: PAGE, label: "Item 1 title", type: "text", default: "Understand local ADU regulations" },
  "home.riskcallouts.item.0.desc": { page: PAGE, label: "Item 1 description", type: "text", default: "and how they pertain to your property." },
  "home.riskcallouts.item.1.title": { page: PAGE, label: "Item 2 title", type: "text", default: "Explore 30+ ADU types" },
  "home.riskcallouts.item.1.desc": { page: PAGE, label: "Item 2 description", type: "text", default: "compare construction, design methods, and costs." },
  "home.riskcallouts.item.2.title": { page: PAGE, label: "Item 3 title", type: "text", default: "Build a realistic total budget" },
  "home.riskcallouts.item.2.desc": { page: PAGE, label: "Item 3 description", type: "text", default: "understand both pre-site and ADU structure cost." },
  "home.riskcallouts.item.3.title": { page: PAGE, label: "Item 4 title", type: "text", default: "Follow the ADUAtlas 10-Step Guide" },
  "home.riskcallouts.item.3.desc": { page: PAGE, label: "Item 4 description", type: "text", default: "the process to your property feasibility." },
  "home.riskcallouts.item.4.title": { page: PAGE, label: "Item 5 title", type: "text", default: "Obtain a realistic feasibility study" },
  "home.riskcallouts.item.4.desc": { page: PAGE, label: "Item 5 description", type: "text", default: "for your property before you make any decisions." },
  "home.riskcallouts.item.5.title": { page: PAGE, label: "Item 6 title", type: "text", default: "Be prepared to speak with builders" },
  "home.riskcallouts.item.5.desc": { page: PAGE, label: "Item 6 description", type: "text", default: "about the specifics of your property, with a feasibility study that lets you get reasonable quotes that are easy to compare." },
  "home.riskcallouts.closing": { page: PAGE, label: "Closing line", type: "text", default: "Be prepared before speaking with builders, suppliers, or your city." },
};

// ── FunnelSteps ───────────────────────────────────────────────────────────
// Structure (how many bullets each step has) stays code-owned. A step with
// no "intro" registry entry just resolves to "" and the line is hidden.
export const FUNNEL_STEPS_META = [
  { n: "01", bulletCount: 4 },
  { n: "02", bulletCount: 7 },
  { n: "03", bulletCount: 5 },
];

export const homeFunnelSteps = {
  "home.funnelsteps.heading": { page: PAGE, label: "Section heading", type: "text", default: "How ADUAtlas works." },

  "home.funnelsteps.step.0.title": { page: PAGE, label: "Step 1 title", type: "text", default: "Learn before you build" },
  "home.funnelsteps.step.0.lede": { page: PAGE, label: "Step 1 lede", type: "text", default: "Take the How to ADU Course." },
  "home.funnelsteps.step.0.intro": { page: PAGE, label: "Step 1 intro line", type: "text", default: "You will learn:" },
  "home.funnelsteps.step.0.bullet.0": { page: PAGE, label: "Step 1 bullet 1", type: "text", default: "City, county, and ZIP-level ADU regulations" },
  "home.funnelsteps.step.0.bullet.1": { page: PAGE, label: "Step 1 bullet 2", type: "text", default: "25+ ADU types, construction methods, and a video library" },
  "home.funnelsteps.step.0.bullet.2": { page: PAGE, label: "Step 1 bullet 3", type: "text", default: "Budget planning and timelines, including pre-site and utility costs" },
  "home.funnelsteps.step.0.bullet.3": { page: PAGE, label: "Step 1 bullet 4", type: "text", default: "Common homeowner mistakes in the FAQ chapter" },

  "home.funnelsteps.step.1.title": { page: PAGE, label: "Step 2 title", type: "text", default: "Get a Property Feasibility Report" },
  "home.funnelsteps.step.1.lede": { page: PAGE, label: "Step 2 lede", type: "text", default: "The study provides information builders need to discuss your project. It includes — but is not limited to — the following:" },
  "home.funnelsteps.step.1.bullet.0": { page: PAGE, label: "Step 2 bullet 1", type: "text", default: "Existing structure placement" },
  "home.funnelsteps.step.1.bullet.1": { page: PAGE, label: "Step 2 bullet 2", type: "text", default: "Lot dimensions" },
  "home.funnelsteps.step.1.bullet.2": { page: PAGE, label: "Step 2 bullet 3", type: "text", default: "Local ADU zoning overlays" },
  "home.funnelsteps.step.1.bullet.3": { page: PAGE, label: "Step 2 bullet 4", type: "text", default: "Setback requirements" },
  "home.funnelsteps.step.1.bullet.4": { page: PAGE, label: "Step 2 bullet 5", type: "text", default: "Potential ADU placement" },
  "home.funnelsteps.step.1.bullet.5": { page: PAGE, label: "Step 2 bullet 6", type: "text", default: "Interactive pre-site budget worksheet" },
  "home.funnelsteps.step.1.bullet.6": { page: PAGE, label: "Step 2 bullet 7", type: "text", default: "Pre-site planning considerations" },

  "home.funnelsteps.step.2.title": { page: PAGE, label: "Step 3 title", type: "text", default: "Move forward prepared" },
  "home.funnelsteps.step.2.lede": { page: PAGE, label: "Step 3 lede", type: "text", default: "After completing the course and receiving your Property Feasibility Report, you will be better prepared to discuss your project with builders." },
  "home.funnelsteps.step.2.bullet.0": { page: PAGE, label: "Step 3 bullet 1", type: "text", default: "Compare builder quotes more effectively" },
  "home.funnelsteps.step.2.bullet.1": { page: PAGE, label: "Step 3 bullet 2", type: "text", default: "Understand potential project costs" },
  "home.funnelsteps.step.2.bullet.2": { page: PAGE, label: "Step 3 bullet 3", type: "text", default: "Evaluate ADU options" },
  "home.funnelsteps.step.2.bullet.3": { page: PAGE, label: "Step 3 bullet 4", type: "text", default: "Plan for pre-site requirements" },
  "home.funnelsteps.step.2.bullet.4": { page: PAGE, label: "Step 3 bullet 5", type: "text", default: "Make informed decisions before construction begins" },

  "home.funnelsteps.cta_primary": { page: PAGE, label: "Primary CTA button", type: "text", default: "Start the ADU Course" },
  "home.funnelsteps.cta_secondary": { page: PAGE, label: "Secondary CTA link", type: "text", default: "See full course outline" },
  "home.funnelsteps.pricing_note": { page: PAGE, label: "Pricing note", type: "text", default: "$99 · Lifetime access · $99 credited toward the $399 Report when you upgrade within 90 days" },
};

export const HOME_CONTENT = { ...homeQuizHero, ...homeRiskCallouts, ...homeFunnelSteps };
