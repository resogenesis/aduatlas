// Feasibility-study intake fields (Phase 1 scope §4). Shared by the homeowner
// form (pages/app/Study.jsx) and the admin queue (pages/admin/AdminStudies.jsx).
export const INTAKE_FIELDS = [
  { key: "address", label: "Property address", placeholder: "123 Main St, Pasadena, CA 91103", type: "text" },
  { key: "propertyType", label: "Existing property type", placeholder: "Single-family, duplex, ...", type: "text", short: true },
  { key: "stories", label: "Home stories", placeholder: "1 or 2", type: "text", short: true },
  { key: "lotInfo", label: "Lot information", placeholder: "Approximate size, shape, corner lot, dimensions if known", type: "textarea" },
  { key: "intendedUse", label: "Intended ADU use", placeholder: "Rental income, family member, home office, ...", type: "text" },
  { key: "sizeBedrooms", label: "Desired size and bedrooms", placeholder: "About 600 sq ft, 1 bedroom", type: "text" },
  { key: "budget", label: "Budget range", placeholder: "$150K to $250K", type: "text", short: true },
  { key: "timeline", label: "Timeline", placeholder: "Within a year, exploring, ...", type: "text", short: true },
  { key: "utilities", label: "Utility information", placeholder: "Where the sewer, water meter and electric panel are; panel size if known", type: "textarea" },
  { key: "topography", label: "Slopes, structures and obstacles", placeholder: "Slopes, trees, sheds, pools, patios, easements you know of", type: "textarea" },
  { key: "keep", label: "Backyard features you want to keep", placeholder: "Garden beds, play area, parking, ...", type: "textarea" },
];
