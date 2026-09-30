// Editable content for src/pages/FAQ.jsx. No images on this page.
const PAGE = "FAQ";

export const FAQ_ITEMS_COUNT = 6;

const FAQ_DEFAULTS = [
  {
    q: "Do you know what you can build, including size, style, and cost?",
    a: "Many homeowners assume \"ADUs are legal here\" means their plan will work. Not always. Cities cap ADU size as a percentage of the primary home, set specific setbacks, restrict height, and update the rules. Many discover the conflict only after they've already decided on a particular ADU. You need a feasibility study completed before you know what size ADU to build.",
  },
  {
    q: "What is your all-in budget?",
    a: "Builder ADU prices typically cover the price of the structure only. Do you have any idea what the survey or site plan, site prep, utility hookups, foundation, city permits, and inspections can cost? Are you prepared to spend an additional $10,000 to $100,000 for site prep? Do you have any idea how to estimate those? Will those expenses affect the amount you had planned to spend on an ADU?",
  },
  {
    q: "Will your HOA allow an ADU on your property, or is there a deed restriction?",
    a: "Even if local zoning allows an ADU, your HOA's CC&Rs can override city and state regulations. Some HOAs require architectural review; others have blanket prohibitions. This is a common late stage surprise. Most homeowners know how flexible their own HOA can be. If you don't, the ADU course shows you how to determine whether an HOA or a city prohibits ADUs on a particular street. Always verify local ADU zoning with your city. The carpenter's rule: measure twice, cut once.",
  },
  {
    q: "Are you prepared to speak with a builder?",
    a: "You need a defined scope of work, knowledge of ADUs and the one you want, the build process, and a realistic budget, including ADU legal placement, size and style, pre-site estimates, surveys, cost of permits, inspections, and a site plan / feasibility study. Without all this information, getting an accurate estimate is not possible. An average survey can run $500 to $2,500, and that will not include your city zoning regulations like placement with setbacks, or utility connections, among other pre-site costs. Save yourself a lot of time and money by being prepared with the ADUAtlas feasibility study tailored to your property and your city's ADU regulations.",
  },
  {
    q: "Do you know the difference between state and city ADU rules?",
    a: "States generally mandate the structural code (the IRC). Cities set the zoning: what, where, and how big. Both apply, and while they rarely conflict, it's better to know before you begin. Knowing which authority decides what saves weeks of back and forth. Ask your builder how they meet or exceed your state's IRC code. The course identifies which elements matter most.",
  },
  {
    q: "Will your total ADU budget (pre-site, permits, structure) match your actual budget?",
    a: "Do you have a realistic all in budget that includes an official survey, a pre-site plan for utilities, foundations, permits, excavating, plus the total ADU cost with setup, delivery, and timelines? Some builders can provide everything, and some do it well. Either way, it makes sense to know what to expect before collecting 3 quotes. Start with Golden at $79 to understand the process, learn about ADU types, and prep the right way. Platinum at $279 adds a feasibility study for your property and the site plan in two versions: what could fit, and the arrangement you want. Your $79 is credited toward Platinum whenever you decide to upgrade. Concierge at $500 adds 60 minutes of consultation and written support through the ADUAtlas portal. After the course and feasibility study you may change your mind, or find the ADU tiny home of your dreams.",
  },
];

export const FAQ_CONTENT = {
  "faq.hero.eyebrow": { page: PAGE, label: "Hero eyebrow", type: "text", default: "FAQ" },
  "faq.hero.heading": {
    page: PAGE, label: "Hero heading", type: "text",
    default: "Six questions every ADU homeowner should know before contacting a builder or your city.",
  },
  "faq.hero.body": {
    page: PAGE, label: "Hero paragraph", type: "text",
    default: "Many ADU projects fail because of the questions homeowners never knew to ask. Answer these honestly. If even one gives you pause, you have a real risk in your project, and you're not alone. The ADUAtlas course, included in every package starting with Golden at $79, covers these and 20+ other common questions you need answered before contacting a builder or your city.",
  },
  "faq.footer_note": {
    page: PAGE, label: "Disclaimer footer", type: "text",
    default: "ADUAtlas strives to provide accurate information; verify everything before you act. Zoning and regulations change often. Refer to qualified professionals for taxes, building code, and variances.",
  },
  ...Object.fromEntries(
    FAQ_DEFAULTS.flatMap((f, i) => [
      [`faq.item.${i}.question`, { page: PAGE, label: `Item ${i + 1} question`, type: "text", default: f.q }],
      [`faq.item.${i}.answer`, { page: PAGE, label: `Item ${i + 1} answer`, type: "text", default: f.a }],
    ])
  ),
};
