// Editable content for src/pages/About.jsx. No images on this page.
const PAGE = "About";

export const ABOUT_STATS_COUNT = 6;
export const ABOUT_CHAPTERS_COUNT = 5;
export const ABOUT_PULLQUOTES_COUNT = 4;

const STAT_DEFAULTS = [
  { n: "1908", label: "Year Sears sold its first kit home" },
  { n: "30+", label: "ADU and tiny home types in common use today" },
  { n: "$10K to $100K+", label: "Potential hidden site prep and utility costs" },
  { n: "1 in 4", label: "Homeowners 60+ considering an ADU for income or family" },
  { n: "80%+", label: "Homeowners underestimate zoning and pre-construction complexity" },
  { n: "6 to 12 Months", label: "Typical ADU timeline from planning to completion" },
];

const CHAPTER_DEFAULTS = [
  {
    eyebrow: "The Shift",
    title: "You've probably noticed them everywhere lately.",
    body: "ADUs, tiny homes, and backyard cottages. So what's driving the shift?\n\nHousing shortages pushed many cities to relax zoning rules. At the same time, rising homeownership costs and changing family needs created demand for more flexible living options: space for aging parents, adult children, rental income, or the ability to age in place.\n\nAs regulations eased, demand grew, and innovation followed.",
  },
  {
    eyebrow: "What Changed",
    title: "Today's ADUs combine modern design, factory construction, and improved building tech.",
    body: "Options range from simple budget friendly units to high end architectural designs. You may hear them called casitas, cottages, cabins, sheds, or bunkies. They can be stick built, panelized, modular, prefab, shipping containers, domes, or kits.\n\nTiny Homes on Wheels, and the larger versions called Park Models (RVs that don't look like RVs), are manufactured homes built on a steel chassis, subject to federal HUD Standards and delivered onsite complete.\n\nA modular home is often built with SIPs (structural insulated panels) assembled on site, like a traditional home.",
  },
  {
    eyebrow: "Not New, Just Better",
    title: "Sears, Roebuck and Company sold kit homes beginning in 1908.",
    body: "Kit homes are not new. Many of those original homes are still standing today.\n\nWhat has changed is quality, efficiency, and design. Modern prefab and modular homes are more refined, energy efficient, and adaptable than ever before.",
  },
  {
    eyebrow: "Why We Built ADUAtlas",
    title: "We came to this after years in commercial multifamily real estate.",
    body: "As we researched the ADU industry, professionally and personally, we kept hitting the same problem: most homeowners had no clear place to start and struggled to find practical information written for everyday people.\n\nADUAtlas answers the who, what, when, where, and why of building an ADU. Before you spend money on surveys, builders, or plans, take the ADUAtlas course. You may decide an ADU isn't the right fit, or you may discover your perfect tiny dream home.\n\nOur philosophy is simple: learn before you build, and save yourself time, money, and costly mistakes.",
  },
  {
    eyebrow: "Home",
    title: "Our goal is to simplify the process.",
    body: "ADUAtlas helps homeowners explore ADU types, understand local regulations, and connect with local and national builders. We provide educational tools, planning resources, and a growing video library so homeowners can see real world examples, not just read about them.\n\nBuilding an ADU takes planning, budgeting, permits, zoning research, and design decisions. ADUAtlas helps simplify that process with realistic budget tools and feasibility studies that give builders what they need to quote accurately.\n\nWhether you're just starting your research or ready to move forward, ADUAtlas is designed to help you build smarter.",
  },
];

const PULLQUOTE_DEFAULTS = [
  "That's exactly what happened with ADUs.",
  "Faster. Smarter. Cooler. Efficient. Cheaper.",
  "Smaller. Smarter. More refined.",
  "That's why we built ADUAtlas.",
];

export const ABOUT_CONTENT = {
  "about.hero.eyebrow": { page: PAGE, label: "Hero eyebrow", type: "text", default: "About ADUAtlas" },
  "about.hero.heading_pre": { page: PAGE, label: "Hero heading (before emphasis)", type: "text", default: "Pre-Construction Intelligence" },
  "about.hero.heading_emphasis": { page: PAGE, label: "Hero heading (emphasized)", type: "text", default: "for homeowners." },
  "about.hero.body1": { page: PAGE, label: "Hero paragraph 1", type: "text", default: "ADUAtlas helps homeowners understand what they can realistically build before spending money on surveys, plans, or builders." },
  "about.hero.body2": { page: PAGE, label: "Hero paragraph 2", type: "text", default: "We provide parcel specific research, zoning insights, planning tools, and feasibility guidance, so you can make smarter decisions with greater confidence before moving forward." },

  ...Object.fromEntries(
    STAT_DEFAULTS.flatMap((s, i) => [
      [`about.stat.${i}.n`, { page: PAGE, label: `Stat ${i + 1} number`, type: "text", default: s.n }],
      [`about.stat.${i}.label`, { page: PAGE, label: `Stat ${i + 1} label`, type: "text", default: s.label }],
    ])
  ),

  ...Object.fromEntries(
    CHAPTER_DEFAULTS.flatMap((c, i) => [
      [`about.chapter.${i}.eyebrow`, { page: PAGE, label: `Chapter ${i + 1} eyebrow`, type: "text", default: c.eyebrow }],
      [`about.chapter.${i}.title`, { page: PAGE, label: `Chapter ${i + 1} title`, type: "text", default: c.title }],
      [`about.chapter.${i}.body`, { page: PAGE, label: `Chapter ${i + 1} body`, type: "text", default: c.body }],
    ])
  ),

  ...Object.fromEntries(
    PULLQUOTE_DEFAULTS.map((q, i) => [
      `about.pullquote.${i}`,
      { page: PAGE, label: `Pull quote ${i + 1}`, type: "text", default: q },
    ])
  ),

  "about.closing.eyebrow": { page: PAGE, label: "Closing eyebrow", type: "text", default: "One promise" },
  "about.closing.heading": { page: PAGE, label: "Closing heading", type: "text", default: "Save you time. Reduce confusion. Help you make informed decisions." },
  "about.closing.body": { page: PAGE, label: "Closing tagline", type: "text", default: "To build or not to build, that is thy question." },
  "about.closing.cta_primary": { page: PAGE, label: "Primary CTA button", type: "text", default: "Property Snapshot" },
  "about.closing.cta_secondary": { page: PAGE, label: "Secondary CTA button", type: "text", default: "Sign Up" },
};
