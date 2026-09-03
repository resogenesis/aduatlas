// Editable content for Methodology.jsx. Icons and pill colors stay code-owned
// (METHODOLOGY_LEVELS_META below) — only text leaves are registered.
const PAGE = "Methodology";

// icon/pillClass are code-owned structure, index-matched to the level.{i}.*
// text entries below. Every level currently has exactly 3 examples.
export const METHODOLOGY_LEVELS_META = [
  { iconName: "FiCheck", pillClass: "bg-accent/15 text-accent border-accent/30" },
  { iconName: "FiHelpCircle", pillClass: "bg-yellow-400/10 text-yellow-300 border-yellow-400/30" },
  { iconName: "FiAlertTriangle", pillClass: "bg-red-400/10 text-red-300 border-red-400/30" },
];

export const METHODOLOGY_CONTENT = {
  // ── Hero ──
  "methodology.hero.badge": { page: PAGE, label: "Hero badge", type: "text", default: "Methodology" },
  "methodology.hero.heading_pre": { page: PAGE, label: "Hero heading (before emphasis)", type: "text", default: "Honest about what's" },
  "methodology.hero.heading_emphasis": { page: PAGE, label: "Hero heading (emphasized)", type: "text", default: "verified, estimated, and unknown." },
  "methodology.hero.body": { page: PAGE, label: "Hero paragraph", type: "text", default: "Every datapoint we show carries a confidence label. This page explains what each label means, where the data comes from, and exactly what we will and won't claim to know." },

  // ── Confidence levels ──
  "methodology.levels.eyebrow": { page: PAGE, label: "Confidence levels eyebrow", type: "text", default: "The three labels" },
  "methodology.levels.heading": { page: PAGE, label: "Confidence levels heading", type: "text", default: "What each chip means on your snapshot." },

  "methodology.level.0.label": { page: PAGE, label: "Level 1 label", type: "text", default: "Verified" },
  "methodology.level.0.when": { page: PAGE, label: "Level 1 description", type: "text", default: "Pulled directly from an authoritative public source." },
  "methodology.level.0.example.0": { page: PAGE, label: "Level 1 example 1", type: "text", default: "County parcel records (lot size, owner, dimensions)" },
  "methodology.level.0.example.1": { page: PAGE, label: "Level 1 example 2", type: "text", default: "City zoning maps and ADU code text" },
  "methodology.level.0.example.2": { page: PAGE, label: "Level 1 example 3", type: "text", default: "Official permit fee schedules" },

  "methodology.level.1.label": { page: PAGE, label: "Level 2 label", type: "text", default: "Estimated" },
  "methodology.level.1.when": { page: PAGE, label: "Level 2 description", type: "text", default: "Modeled from public data and standard assumptions." },
  "methodology.level.1.example.0": { page: PAGE, label: "Level 2 example 1", type: "text", default: "Max ADU size from the city's percent-of-primary rule applied to your lot" },
  "methodology.level.1.example.1": { page: PAGE, label: "Level 2 example 2", type: "text", default: "Cost ranges from regional builder bids and prefab market data" },
  "methodology.level.1.example.2": { page: PAGE, label: "Level 2 example 3", type: "text", default: "Setbacks from the local minimum, before easements are checked" },

  "methodology.level.2.label": { page: PAGE, label: "Level 3 label", type: "text", default: "Unknown" },
  "methodology.level.2.when": { page: PAGE, label: "Level 3 description", type: "text", default: "Requires on-site verification or a closer look at title or city records." },
  "methodology.level.2.example.0": { page: PAGE, label: "Level 3 example 1", type: "text", default: "Sewer line distance to your specific pad" },
  "methodology.level.2.example.1": { page: PAGE, label: "Level 3 example 2", type: "text", default: "HOA or deed restrictions recorded against the parcel" },
  "methodology.level.2.example.2": { page: PAGE, label: "Level 3 example 3", type: "text", default: "Soil bearing or slope-related foundation needs" },

  // ── Path to verified ──
  "methodology.path.eyebrow": { page: PAGE, label: "Path-to-verified eyebrow", type: "text", default: "The path to verified" },
  "methodology.path.heading": { page: PAGE, label: "Path-to-verified heading", type: "text", default: "Every Estimated or Unknown row has a path to Verified." },
  "methodology.path.body": { page: PAGE, label: "Path-to-verified paragraph", type: "text", default: "Click \"What raises this?\" on any row in your snapshot. We show you exactly what we'd do to verify it, and which paid tier delivers that verification. No hidden steps. No buying twice." },
  "methodology.path.example_label": { page: PAGE, label: "Example card label", type: "text", default: "Example" },
  "methodology.path.example_row": { page: PAGE, label: "Example card row text", type: "text", default: "Sewer access: Unknown" },
  "methodology.path.example_confidence": { page: PAGE, label: "Example card confidence badge", type: "text", default: "Low" },
  "methodology.path.example_quote": {
    page: PAGE, label: "Example card quote", type: "text",
    default: "We pull your city's sewer line map, measure the distance from the closest tie-in to the proposed ADU pad, and flag whether a gravity tie-in works or a grinder pump is required (a $4K to $8K cost difference).",
  },

  // ── Data sources ──
  "methodology.sources.eyebrow": { page: PAGE, label: "Sources eyebrow", type: "text", default: "Sources and cadence" },
  "methodology.sources.heading": { page: PAGE, label: "Sources heading", type: "text", default: "Where the data comes from. When it's refreshed." },

  "methodology.source.0.name": { page: PAGE, label: "Source 1 name", type: "text", default: "County parcel data" },
  "methodology.source.0.cadence": { page: PAGE, label: "Source 1 cadence", type: "text", default: "Refreshed nightly where available" },
  "methodology.source.0.coverage": { page: PAGE, label: "Source 1 coverage", type: "text", default: "Lot size, owner, dimensions" },

  "methodology.source.1.name": { page: PAGE, label: "Source 2 name", type: "text", default: "City zoning maps and ADU code" },
  "methodology.source.1.cadence": { page: PAGE, label: "Source 2 cadence", type: "text", default: "Reviewed per jurisdiction we cover" },
  "methodology.source.1.coverage": { page: PAGE, label: "Source 2 coverage", type: "text", default: "Districts, overlays, base ADU rules" },

  "methodology.source.2.name": { page: PAGE, label: "Source 3 name", type: "text", default: "Permit fee schedules" },
  "methodology.source.2.cadence": { page: PAGE, label: "Source 3 cadence", type: "text", default: "Reviewed quarterly per city" },
  "methodology.source.2.coverage": { page: PAGE, label: "Source 3 coverage", type: "text", default: "Posted by the city's permit office" },

  "methodology.source.3.name": { page: PAGE, label: "Source 4 name", type: "text", default: "Regional cost models" },
  "methodology.source.3.cadence": { page: PAGE, label: "Source 4 cadence", type: "text", default: "Refreshed quarterly" },
  "methodology.source.3.coverage": { page: PAGE, label: "Source 4 coverage", type: "text", default: "Site prep + structure ranges by metro" },

  "methodology.source.4.name": { page: PAGE, label: "Source 5 name", type: "text", default: "ADU code amendments" },
  "methodology.source.4.cadence": { page: PAGE, label: "Source 5 cadence", type: "text", default: "Tracked as states and cities publish" },
  "methodology.source.4.coverage": { page: PAGE, label: "Source 5 coverage", type: "text", default: "City and county ordinance changes (state baseline where one exists)" },

  "methodology.sources.footnote_1": {
    page: PAGE, label: "Sources footnote 1", type: "text",
    default: "Every datapoint in your output shows a \"last updated\" date. If it looks stale, we haven't refreshed that source recently. We'd rather show you the date than pretend it's fresh.",
  },
  "methodology.sources.footnote_2": {
    page: PAGE, label: "Sources footnote 2", type: "text",
    default: "Coverage expands jurisdiction by jurisdiction. Most ADU rules live at the city, county, and ZIP level. If your city's ADU code isn't yet in our verified set, we will surface any state baseline where one exists and flag what we don't yet know.",
  },

  // ── What we don't do ──
  "methodology.notdoing.badge": { page: PAGE, label: "\"What we don't do\" badge", type: "text", default: "What we don't do" },
  "methodology.notdoing.heading_pre": { page: PAGE, label: "\"What we don't do\" heading (before emphasis)", type: "text", default: "Pre-construction guidance." },
  "methodology.notdoing.heading_emphasis": { page: PAGE, label: "\"What we don't do\" heading (emphasized)", type: "text", default: "Not legal, engineering, or appraisal." },
  "methodology.notdoing.body": { page: PAGE, label: "\"What we don't do\" paragraph", type: "text", default: "ADUAtlas is a planning and decision-support tool. We help you understand what's possible and what to verify next. We do not replace any of the following:" },

  "methodology.notdoing.item.0": { page: PAGE, label: "Not-doing item 1", type: "text", default: "Legal advice. We are not lawyers." },
  "methodology.notdoing.item.1": { page: PAGE, label: "Not-doing item 2", type: "text", default: "Engineering, structural, or geotechnical analysis." },
  "methodology.notdoing.item.2": { page: PAGE, label: "Not-doing item 3", type: "text", default: "Appraisal or estimated future market value of your home." },
  "methodology.notdoing.item.3": { page: PAGE, label: "Not-doing item 4", type: "text", default: "Permit determination. Only your city's permit office can issue or deny." },
  "methodology.notdoing.item.4": { page: PAGE, label: "Not-doing item 5", type: "text", default: "Contractor licensing verification. We don't replace your due diligence." },
  "methodology.notdoing.item.5": { page: PAGE, label: "Not-doing item 6", type: "text", default: "Lender prequalification or financing approval." },

  "methodology.notdoing.footnote": {
    page: PAGE, label: "\"What we don't do\" footnote", type: "text",
    default: "Always confirm with your city, a licensed architect or engineer, your lender, and a qualified contractor before committing to a design or breaking ground. Our reports are built to make those conversations sharper, not to replace them.",
  },

  // ── CTA ──
  "methodology.cta.heading": { page: PAGE, label: "CTA heading", type: "text", default: "Now go check your property." },
  "methodology.cta.body": { page: PAGE, label: "CTA paragraph", type: "text", default: "Honest output. Source dated. Confidence labeled. Free to start." },
  "methodology.cta.button": { page: PAGE, label: "CTA button", type: "text", default: "Property Snapshot" },
};
