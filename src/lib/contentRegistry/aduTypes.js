// Editable content for src/pages/AduTypes.jsx. The heroImg passed to
// PageHeader as `bg` is a dead prop (PageHeader.jsx doesn't render `bg`) —
// left as-is, not wired here, per scope (only render-affecting content).
const PAGE = "AduTypes";

// Verbatim from the current typeNames const — list count/order stays fixed;
// only each name's text is admin-editable.
const TYPE_NAMES = [
  "Prefab Modular ADU",
  "Panelized ADU",
  "SIP ADU",
  "Custom Stick-Built",
  "Container Home",
  "Shipping Container Hybrid",
  "Park Model / Tiny Home on Foundation",
  "Mobile Tiny Home (on wheels)",
  "A-Frame",
  "Cabin (Kit or Log)",
  "Bunkie",
  "Modern Shed",
  "Backyard Cottage",
  "Casita",
  "Garage Conversion",
  "Basement Conversion",
  "Attached / Home Addition",
  "Detached New Construction",
  "Duplex / Two-Unit",
  "Barndominium",
  "Quonset Hut",
  "Geodesic Dome",
  "Timber Frame",
  "Steel Frame",
  "Concrete / ICF",
  "3D Printed",
  "Luxury Architectural",
  "Micro Studio",
  "Pod / Capsule",
  "Floating / Barge",
];

export const ADU_TYPES_COUNT = TYPE_NAMES.length;

export const ADU_TYPES_CONTENT = {
  "adutypes.hero.title": { page: PAGE, label: "Header title", type: "text", default: "ADU Types" },
  "adutypes.hero.subtitle": {
    page: PAGE, label: "Header subtitle", type: "text",
    default: "More options than most homeowners realize. The wrong choice for your lot or zoning can quietly add tens of thousands.",
  },
  "adutypes.intro": {
    page: PAGE, label: "Intro paragraph", type: "text",
    default: "There are 30+ ADU and tiny-home types in common use. Each has different cost, timeline, and zoning implications, and not every type is allowed on every lot.",
  },
  "adutypes.list_heading": { page: PAGE, label: "List heading", type: "text", default: "30+ ADU types in common use:" },
  "adutypes.closing": {
    page: PAGE, label: "Closing paragraph", type: "text",
    default: "Side-by-side comparisons (cost ranges, timelines, long-term value impact, and which types match your specific zoning) are inside the ADU system.",
  },
  ...Object.fromEntries(
    TYPE_NAMES.map((name, i) => [
      `adutypes.type.${i}`,
      { page: PAGE, label: `Type ${i + 1}`, type: "text", default: name },
    ])
  ),
};
