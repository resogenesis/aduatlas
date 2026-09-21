// Editable copy for the public Course page (src/pages/CourseOutline.jsx).
// The module list itself comes from src/stores/courseStore.js so the page can
// never disagree with the course a buyer receives; only the one-line
// description under each module title is editable here, keyed by module id.
const PAGE = "Course Outline";
const t = (label, def) => ({ page: PAGE, label, type: "text", default: def });

export const INCLUDES_COUNT = 4;

export const COURSE_OUTLINE_CONTENT = {
  // New field names on purpose: the earlier header copy published under
  // courseoutline.hero.* was several paragraphs long; this page stays short.
  "courseoutline.header.title": t("Heading", "Learn before you build."),
  "courseoutline.header.body": t("One-line description", "Nine short modules: what an ADU is, what your city allows, what it costs, how to talk to builders."),

  "courseoutline.includes.heading": t("Includes heading", "Short and yours to keep."),
  "courseoutline.include.0.label": t("Includes item 1", "Short written lessons, most under six minutes"),
  "courseoutline.include.1.label": t("Includes item 2", "A knowledge check at the end of every module"),
  "courseoutline.include.2.label": t("Includes item 3", "Progress saved to your account, on any device"),
  "courseoutline.include.3.label": t("Includes item 4", "Companion worksheets in your portal"),

  "courseoutline.modules.heading": t("Module list heading", "What you'll learn."),
  "courseoutline.module.m1.desc": t("Module 1 description", "What an ADU is, the main types, why homeowners build them, and the misconceptions that cost time and money."),
  "courseoutline.module.m2.desc": t("Module 2 description", "State law, local zoning, and HOA rules, and why the same ADU is allowed on one street and not the next."),
  "courseoutline.module.m3.desc": t("Module 3 description", "The order of operations from first idea to move-in, and where projects go wrong when steps are skipped."),
  "courseoutline.module.m4.desc": t("Module 4 description", "Detached, attached, conversions, prefab, modular, and more, compared on cost, timeline, and fit."),
  "courseoutline.module.m5.desc": t("Module 5 description", "Survey, site plan, utilities, permits, and the other costs that arrive before the structure does."),
  "courseoutline.module.m6.desc": t("Module 6 description", "Straight answers to the questions homeowners ask most."),
  "courseoutline.module.m7.desc": t("Module 7 description", "The National ADU Property Evaluation: how to score your property and know when to stop before you spend."),
  "courseoutline.module.m9.desc": t("Module 8 description", "What a feasibility study and site plan tell you, and how to use them with your city and your builder."),
  "courseoutline.module.m10.desc": t("Module 9 description", "Choosing an ADU, comparing builders, and moving forward with a plan instead of a guess."),

  "courseoutline.cta.heading": t("Closing heading", "Included with every plan."),
  "courseoutline.cta.body": t("Closing paragraph", "Golden starts at $79 and includes the full course, the planning worksheets, and builder profiles. Platinum adds a feasibility study and site plan for your property."),
  "courseoutline.cta.button": t("Closing button", "See plans"),
};
