// Editable content for src/pages/ChooseState.jsx.
const PAGE = "ChooseState";

// Verbatim from the current stateNames const — list count/order stays fixed;
// only each name's text is admin-editable.
const STATE_NAMES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

export const STATE_NAMES_COUNT = STATE_NAMES.length;

export const CHOOSE_STATE_CONTENT = {
  "choosestate.hero.title": { page: PAGE, label: "Header title", type: "text", default: "ADU Regulations Where You Live" },
  "choosestate.hero.subtitle": {
    page: PAGE, label: "Header subtitle", type: "text",
    default: "Only a handful of states have written ADU rules into state law. For most homeowners, what you can build is decided by your city, county, ZIP, and HOA.",
  },
  "choosestate.intro": {
    page: PAGE, label: "Intro paragraph", type: "text",
    default: "ADU rules in the U.S. mostly live at the local level. A small number of states have a statewide ADU baseline; the rest leave it to your city, county, and HOA. Two homes ten miles apart can have completely different setbacks, size caps, and impact fees. Don't trust generic answers.",
  },
  "choosestate.list_heading": { page: PAGE, label: "List heading", type: "text", default: "Browse by state" },
  "choosestate.list_subheading": {
    page: PAGE, label: "List subheading", type: "text",
    default: "Inside each state, the real rules live at the city, county, and ZIP level.",
  },
  "choosestate.closing": {
    page: PAGE, label: "Closing paragraph", type: "text",
    default: "The detailed breakdown (which states have a baseline, where city rules diverge, and which authority controls what) is inside the ADU Course, with your specific ZIP code's rules pulled into your Property Feasibility Report.",
  },
  ...Object.fromEntries(
    STATE_NAMES.map((name, i) => [
      `choosestate.state.${i}`,
      { page: PAGE, label: `State ${i + 1}`, type: "text", default: name },
    ])
  ),
};
