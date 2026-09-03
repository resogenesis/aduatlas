// Editable content for src/pages/HowToAdu.jsx. No images on this page —
// icons in the "pillars" list stay code-owned, only their title/desc text is
// admin-editable.
const PAGE = "How to ADU";

export const HOW_TO_ADU_PILLARS_COUNT = 3;
export const HOW_TO_ADU_STEPS_COUNT = 5;

const PILLAR_DEFAULTS = [
  { title: "An ADU Course", desc: "Learn the process and the products before you spend." },
  { title: "A Personalized Property Feasibility Report", desc: "Your lot, your zoning, your buildable area." },
  { title: "Professional Profiles", desc: "National and local builders and suppliers, for less than the cost of a typical survey." },
];

const STEP_DEFAULTS = [
  { title: "Understand Your Property", desc: "Access your property's zoning regulations, setbacks, buildable area, and site considerations." },
  { title: "Explore Your ADU Options", desc: "Compare 25+ ADU types, construction methods, costs, and benefits." },
  { title: "Estimate Costs and Timelines", desc: "Understand pre-site costs, permits, inspections, utility connections, and realistic project timelines." },
  { title: "Obtain a Property Feasibility Report", desc: "Use GIS property data and zoning overlays to understand what may realistically fit on your property." },
  { title: "Compare Builders With Confidence", desc: "Use property-specific information to evaluate builder proposals and make informed decisions." },
];

export const HOW_TO_ADU_CONTENT = {
  "howtoadu.hero.eyebrow": { page: PAGE, label: "Hero eyebrow", type: "text", default: "The ADU process" },
  "howtoadu.hero.heading_pre": { page: PAGE, label: "Hero heading (before emphasis)", type: "text", default: "How do you" },
  "howtoadu.hero.heading_emphasis": { page: PAGE, label: "Hero heading (emphasized)", type: "text", default: "ADU?" },
  "howtoadu.hero.body_pre": { page: PAGE, label: "Hero paragraph (before emphasis)", type: "text", default: "Building an ADU is more than choosing a structure and" },
  "howtoadu.hero.body_emphasis": { page: PAGE, label: "Hero paragraph (emphasized)", type: "text", default: "hiring a builder." },
  "howtoadu.hero.link_pillars": { page: PAGE, label: "Hero link: jump to pillars", type: "text", default: "What ADUAtlas gives you" },
  "howtoadu.hero.link_steps": { page: PAGE, label: "Hero link: jump to steps", type: "text", default: "The 5 steps" },

  "howtoadu.pillars.eyebrow": { page: PAGE, label: "Pillars section eyebrow", type: "text", default: "What ADUAtlas gives you" },
  "howtoadu.pillars.heading": { page: PAGE, label: "Pillars section heading", type: "text", default: "How ADUAtlas prepares homeowners before they build." },
  "howtoadu.pillars.body": {
    page: PAGE, label: "Pillars section paragraph", type: "text",
    default: "An ADU Course, a personalized Property Feasibility Report, and access to professional profiles, including national and local builders and suppliers, for less than the cost of a typical survey.",
  },
  ...Object.fromEntries(
    PILLAR_DEFAULTS.flatMap((p, i) => [
      [`howtoadu.pillar.${i}.title`, { page: PAGE, label: `Pillar ${i + 1} title`, type: "text", default: p.title }],
      [`howtoadu.pillar.${i}.desc`, { page: PAGE, label: `Pillar ${i + 1} description`, type: "text", default: p.desc }],
    ])
  ),

  "howtoadu.steps.eyebrow": { page: PAGE, label: "Steps section eyebrow", type: "text", default: "The 5 steps" },
  "howtoadu.steps.heading": { page: PAGE, label: "Steps section heading", type: "text", default: "From property unknown to project ready." },
  ...Object.fromEntries(
    STEP_DEFAULTS.flatMap((s, i) => [
      [`howtoadu.step.${i}.title`, { page: PAGE, label: `Step ${i + 1} title`, type: "text", default: s.title }],
      [`howtoadu.step.${i}.desc`, { page: PAGE, label: `Step ${i + 1} description`, type: "text", default: s.desc }],
    ])
  ),

  "howtoadu.closer.heading": { page: PAGE, label: "Closer heading", type: "text", default: "Learn before you build." },
  "howtoadu.closer.body": {
    page: PAGE, label: "Closer paragraph", type: "text",
    default: "A builder can manage the construction process, but homeowners still need to understand the project, costs, and options. The more prepared you are before construction begins, the fewer surprises you will face later.",
  },
  "howtoadu.closer.cta_primary": { page: PAGE, label: "Primary CTA button", type: "text", default: "Start the ADU Course — $99" },
  "howtoadu.closer.cta_secondary": { page: PAGE, label: "Secondary CTA button", type: "text", default: "See the course outline" },
};
