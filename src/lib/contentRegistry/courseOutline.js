// Editable content for CourseOutline.jsx (the public marketing outline page —
// distinct from the actual in-course chapter prose in courseContent.js, which
// is wired separately in course.js). Icons and item ordering stay code-owned
// in COURSE_OUTLINE_MODULES_META / COURSE_OUTLINE_INCLUDES_META below; only
// text leaves are registered as editable content.
const PAGE = "Course Outline";

// modules[i]: which optional fields exist (tag, note) and how many topics —
// structure only, never admin-editable.
export const COURSE_OUTLINE_MODULES_META = [
  { n: "01", hasTag: false, topicCount: 2, hasNote: false },
  { n: "02", hasTag: false, topicCount: 3, hasNote: false },
  { n: "03", hasTag: false, topicCount: 1, hasNote: false },
  { n: "04", hasTag: true, topicCount: 3, hasNote: false },
  { n: "05", hasTag: true, topicCount: 2, hasNote: false },
  { n: "06", hasTag: false, topicCount: 1, hasNote: false },
  { n: "07", hasTag: true, topicCount: 2, hasNote: false },
  { n: "08", hasTag: false, topicCount: 2, hasNote: true },
  { n: "09", hasTag: false, topicCount: 3, hasNote: false },
  { n: "10", hasTag: false, topicCount: 2, hasNote: false },
];

export const COURSE_OUTLINE_CONTENT = {
  // ── Hero ──
  "courseoutline.hero.eyebrow": { page: PAGE, label: "Hero eyebrow", type: "text", default: "ADUAtlas ADU Course" },
  "courseoutline.hero.heading": { page: PAGE, label: "Hero heading", type: "text", default: "What does a homeowner need to know before spending money on an ADU?" },
  "courseoutline.hero.body": { page: PAGE, label: "Hero paragraph", type: "text", default: "The course won't make you an ADU expert. It will help you understand the process, avoid mistakes, and see why a feasibility study matters — for homeowners in the pre-construction planning phase, nationwide." },

  // ── Price / access strip ──
  "courseoutline.strip.0.label": { page: PAGE, label: "Strip card 1 label", type: "text", default: "Course fee" },
  "courseoutline.strip.0.value": { page: PAGE, label: "Strip card 1 value", type: "text", default: "$99" },
  "courseoutline.strip.0.desc": { page: PAGE, label: "Strip card 1 description", type: "text", default: "Your $99 is credited toward the $399 Property Feasibility Report when you upgrade within 90 days." },
  "courseoutline.strip.1.label": { page: PAGE, label: "Strip card 2 label", type: "text", default: "Access" },
  "courseoutline.strip.1.value": { page: PAGE, label: "Strip card 2 value", type: "text", default: "Forever" },
  "courseoutline.strip.1.desc": { page: PAGE, label: "Strip card 2 description", type: "text", default: "Yours to keep. Renew the latest information any year for $99." },
  "courseoutline.strip.2.label": { page: PAGE, label: "Strip card 3 label", type: "text", default: "Length" },
  "courseoutline.strip.2.value": { page: PAGE, label: "Strip card 3 value", type: "text", default: "9 modules" },
  "courseoutline.strip.2.desc": { page: PAGE, label: "Strip card 3 description", type: "text", default: "2–3 hours total · 25–35 short videos, 3–7 minutes each." },

  // ── "Each module includes" ──
  "courseoutline.includes.eyebrow": { page: PAGE, label: "Includes section eyebrow", type: "text", default: "Each module includes" },
  "courseoutline.includes.heading": { page: PAGE, label: "Includes section heading", type: "text", default: "Short, structured, and built for retention." },
  "courseoutline.include.0.label": { page: PAGE, label: "Includes item 1", type: "text", default: "Short video lessons (3–7 min each)" },
  "courseoutline.include.1.label": { page: PAGE, label: "Includes item 2", type: "text", default: "PDF lesson notes" },
  "courseoutline.include.2.label": { page: PAGE, label: "Includes item 3", type: "text", default: "Short quiz at the end of each module" },
  "courseoutline.include.3.label": { page: PAGE, label: "Includes item 4", type: "text", default: "Selected modules include photos and videos" },
  "courseoutline.includes.note": { page: PAGE, label: "Includes section footnote", type: "text", default: "Module 4 includes extensive ADU photos and videos." },

  // ── Module list ──
  "courseoutline.modules.eyebrow": { page: PAGE, label: "Module list eyebrow", type: "text", default: "The 9 modules" },
  "courseoutline.modules.heading": { page: PAGE, label: "Module list heading", type: "text", default: "What you'll learn." },

  "courseoutline.module.0.title": { page: PAGE, label: "Module 1 title", type: "text", default: "ADU Basics" },
  "courseoutline.module.0.desc": { page: PAGE, label: "Module 1 description", type: "text", default: "What an ADU is, the main types, and why homeowners build them." },
  "courseoutline.module.0.topic.0": { page: PAGE, label: "Module 1 topic 1", type: "text", default: "What is an ADU? — definitions, detached vs. attached, JADUs, tiny homes vs. ADUs, common uses" },
  "courseoutline.module.0.topic.1": { page: PAGE, label: "Module 1 topic 2", type: "text", default: "Why homeowners build — family housing, aging parents, adult children, rental income, office & guest space" },

  "courseoutline.module.1.title": { page: PAGE, label: "Module 2 title", type: "text", default: "Understanding City & State ADU Regulations" },
  "courseoutline.module.1.desc": { page: PAGE, label: "Module 2 description", type: "text", default: "The state, local, and HOA rules that decide what you can build." },
  "courseoutline.module.1.topic.0": { page: PAGE, label: "Module 2 topic 1", type: "text", default: "Why location matters — state rules vs. local zoning, city-specific regulations, HOA considerations" },
  "courseoutline.module.1.topic.1": { page: PAGE, label: "Module 2 topic 2", type: "text", default: "Key regulations — setbacks, height limits, size limits, lot coverage, parking, utility requirements" },
  "courseoutline.module.1.topic.2": { page: PAGE, label: "Module 2 topic 3", type: "text", default: "Why most homeowners get confused" },

  "courseoutline.module.2.title": { page: PAGE, label: "Module 3 title", type: "text", default: "The 10-Step ADU Process" },
  "courseoutline.module.2.desc": { page: PAGE, label: "Module 3 description", type: "text", default: "Learn → Verify → Review → Plan → Verify → Build, mapped end to end." },
  "courseoutline.module.2.topic.0": { page: PAGE, label: "Module 3 topic 1", type: "text", default: "Step-by-step roadmap: education, feasibility, budgeting, ADU selection, survey, site plan, builder selection, permits, construction, final inspection" },

  "courseoutline.module.3.title": { page: PAGE, label: "Module 4 title", type: "text", default: "Explore 25+ ADU Types & Construction Methods" },
  "courseoutline.module.3.tag": { page: PAGE, label: "Module 4 tag", type: "text", default: "Extensive ADU photos & videos" },
  "courseoutline.module.3.desc": { page: PAGE, label: "Module 4 description", type: "text", default: "Every major build method and ADU style, compared on cost and value." },
  "courseoutline.module.3.topic.0": { page: PAGE, label: "Module 4 topic 1", type: "text", default: "Methods — stick-built, modular, prefab, panelized, SIP, manufactured" },
  "courseoutline.module.3.topic.1": { page: PAGE, label: "Module 4 topic 2", type: "text", default: "Specialty ADUs — container homes, cabin kits, bunkies, timber frame, A-frame, dome homes, Quonset huts" },
  "courseoutline.module.3.topic.2": { page: PAGE, label: "Module 4 topic 3", type: "text", default: "Cost comparison, pros and cons" },

  "courseoutline.module.4.title": { page: PAGE, label: "Module 5 title", type: "text", default: "Pre-Site Preparation & Budgets" },
  "courseoutline.module.4.tag": { page: PAGE, label: "Module 5 tag", type: "text", default: "Major value driver" },
  "courseoutline.module.4.desc": { page: PAGE, label: "Module 5 description", type: "text", default: "The pre-site costs most homeowners never hear about — until they do." },
  "courseoutline.module.4.topic.0": { page: PAGE, label: "Module 5 topic 1", type: "text", default: "Costs most homeowners miss or overlook — survey, site plan, utilities, excavation, concrete, retaining walls, tree removal, drainage" },
  "courseoutline.module.4.topic.1": { page: PAGE, label: "Module 5 topic 2", type: "text", default: "Real examples" },

  "courseoutline.module.5.title": { page: PAGE, label: "Module 6 title", type: "text", default: "ADU FAQ" },
  "courseoutline.module.5.desc": { page: PAGE, label: "Module 6 description", type: "text", default: "Straight answers to the questions homeowners ask most." },
  "courseoutline.module.5.topic.0": { page: PAGE, label: "Module 6 topic 1", type: "text", default: "Common ADU questions, answered" },

  "courseoutline.module.6.title": { page: PAGE, label: "Module 7 title", type: "text", default: "False Starts" },
  "courseoutline.module.6.tag": { page: PAGE, label: "Module 7 tag", type: "text", default: "NAPE" },
  "courseoutline.module.6.desc": { page: PAGE, label: "Module 7 description", type: "text", default: "National ADU Property Evaluation — knowing when to stop before you spend." },
  "courseoutline.module.6.topic.0": { page: PAGE, label: "Module 7 topic 1", type: "text", default: "The National ADU Property Evaluation (NAPE)" },
  "courseoutline.module.6.topic.1": { page: PAGE, label: "Module 7 topic 2", type: "text", default: "If the pre-site worksheet shows it could cost $75k, would you still move forward?" },

  "courseoutline.module.7.title": { page: PAGE, label: "Module 8 title", type: "text", default: "Builder Preparation" },
  "courseoutline.module.7.desc": { page: PAGE, label: "Module 8 description", type: "text", default: "Walk into builder conversations ready, not guessing." },
  "courseoutline.module.7.topic.0": { page: PAGE, label: "Module 8 topic 1", type: "text", default: "When to contact builders, questions to ask, red flags" },
  "courseoutline.module.7.topic.1": { page: PAGE, label: "Module 8 topic 2", type: "text", default: "How to compare quotes, and why builders need your property information" },
  "courseoutline.module.7.note": { page: PAGE, label: "Module 8 note", type: "text", default: "Before requesting builder quotes, obtain your ADUAtlas Property Feasibility Study." },

  "courseoutline.module.8.title": { page: PAGE, label: "Module 9 title", type: "text", default: "Property Feasibility Report Packet" },
  "courseoutline.module.8.desc": { page: PAGE, label: "Module 9 description", type: "text", default: "What the packet includes — and why it saves you time and money." },
  "courseoutline.module.8.topic.0": { page: PAGE, label: "Module 9 topic 1", type: "text", default: "GIS property diagram with local zoning applied — dimensions, existing footprint, overlays, setbacks, largest possible ADU placement" },
  "courseoutline.module.8.topic.1": { page: PAGE, label: "Module 9 topic 2", type: "text", default: "4 interactive worksheets — budget tools, timelines, permits, inspections" },
  "courseoutline.module.8.topic.2": { page: PAGE, label: "Module 9 topic 3", type: "text", default: "NAPE score, plus a utility professional contact to mark your utility access" },

  "courseoutline.module.9.title": { page: PAGE, label: "Module 10 title", type: "text", default: "Moving Forward Prepared" },
  "courseoutline.module.9.desc": { page: PAGE, label: "Module 10 description", type: "text", default: "Put it all together and take the next step with confidence." },
  "courseoutline.module.9.topic.0": { page: PAGE, label: "Module 10 topic 1", type: "text", default: "Selecting an ADU, comparing builders from the ADUAtlas Professional Profiles, planning realistically" },
  "courseoutline.module.9.topic.1": { page: PAGE, label: "Module 10 topic 2", type: "text", default: "Next steps → Get your ADUAtlas Property Feasibility Study" },

  "courseoutline.modules.footnote": { page: PAGE, label: "Module list footnote", type: "text", default: "The 9-module ADUAtlas course. Includes one year of access — renew for $99/year to keep your access and refresh with the latest regulations, types, and costs." },

  // ── Core idea + CTA ──
  "courseoutline.idea.eyebrow": { page: PAGE, label: "Core idea eyebrow", type: "text", default: "The one idea this course reinforces" },
  "courseoutline.idea.body_pre": { page: PAGE, label: "Core idea (before emphasis)", type: "text", default: "Education tells you how the ADU process works. The Property Feasibility Study tells you how it applies to" },
  "courseoutline.idea.body_emphasis": { page: PAGE, label: "Core idea (emphasized word)", type: "text", default: "your" },
  "courseoutline.idea.body_post": { page: PAGE, label: "Core idea (after emphasis)", type: "text", default: "property." },
  "courseoutline.cta.button": { page: PAGE, label: "CTA button", type: "text", default: "Start the ADU Course — $99" },
  "courseoutline.cta.note": { page: PAGE, label: "CTA note", type: "text", default: "$99 credited toward your $399 Report when you upgrade within 90 days" },
};
