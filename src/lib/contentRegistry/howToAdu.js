// Editable copy for the public How It Works page (src/pages/HowToAdu.jsx).
// Field names are new on purpose: the earlier copy published under
// howtoadu.hero.* was long and out of step with Phase 1; this page stays
// short. Structure (five steps, three pillars, one closer) is code-owned.
import checkImg from "../../assets/home/how_step1.jpg";
import learnImg from "../../assets/home/how_step2.jpg";
import buildersImg from "../../assets/home/how_step5.jpg";

const PAGE = "How It Works";
const t = (label, def) => ({ page: PAGE, label, type: "text", default: def });
const img = (label, src, alt) => ({ page: PAGE, label, type: "image", default: { src, alt } });

export const HOW_STEPS_COUNT = 5;
export const HOW_PILLARS_COUNT = 3;

export const HOW_TO_ADU_CONTENT = {
  "howtoadu.header.title": t("Heading", "How it works."),
  "howtoadu.header.body": t("One-line description", "Five steps from an address to a plan you can act on."),

  "howtoadu.step.0.title": t("Step 1 title", "Check your property"),
  "howtoadu.step.0.desc": t("Step 1 description", "Enter your address. We pull what public records say about your lot and home, flag what needs confirming, and show you where you stand. Free, no account needed."),
  "howtoadu.step.0.image": img("Step 1 photo", checkImg, "An empty suburban backyard seen from the porch, lawn, fence, and detached garage"),
  "howtoadu.step.1.title": t("Step 2 title", "Learn the process"),
  "howtoadu.step.1.desc": t("Step 2 description", "Nine short modules on what your city allows, what it really costs, and how to talk to builders. Included with every plan, yours for a year."),
  "howtoadu.step.1.image": img("Step 2 photo", learnImg, "A homeowner at a kitchen table reviewing the ADUAtlas course on a laptop beside a printed lot plan"),
  "howtoadu.step.2.title": t("Step 3 title", "Get your feasibility study and site plan"),
  "howtoadu.step.2.desc": t("Step 3 description", "Tell us about your property. We prepare a study of what may fit, the rules that apply, and a visual site plan drawn to scale, delivered in your portal."),
  "howtoadu.step.3.title": t("Step 4 title", "Know your costs before the structure"),
  "howtoadu.step.3.desc": t("Step 4 description", "Survey, utilities, permits, grading. The worksheets add up the pre-site costs most homeowners never hear about until the bill arrives."),
  "howtoadu.step.4.title": t("Step 5 title", "Meet builders who serve your area"),
  "howtoadu.step.4.desc": t("Step 5 description", "Browse builder profiles by state and city, save the ones you like, and request an introduction when your plan is ready."),
  "howtoadu.step.4.image": img("Step 5 photo", buildersImg, "A builder and a homeowner reviewing a site plan in a backyard with an ADU under construction"),

  "howtoadu.pillars.heading": t("Pillars heading", "What you get."),
  "howtoadu.pillar.0.title": t("Pillar 1 title", "The course"),
  "howtoadu.pillar.0.desc": t("Pillar 1 description", "Learn the process and the products before you spend."),
  "howtoadu.pillar.1.title": t("Pillar 2 title", "A study of your property"),
  "howtoadu.pillar.1.desc": t("Pillar 2 description", "Your lot, your zoning, your likely ADU placement, drawn as a site plan."),
  "howtoadu.pillar.2.title": t("Pillar 3 title", "Builder introductions"),
  "howtoadu.pillar.2.desc": t("Pillar 3 description", "Profiles by state and service area, with introductions when you are ready."),

  "howtoadu.closer.heading": t("Closer heading", "Learn before you build."),
  "howtoadu.closer.body": t("Closer paragraph", "The more you know before construction begins, the fewer surprises later."),
  "howtoadu.closer.cta_primary": t("Primary button", "Check my property"),
  "howtoadu.closer.cta_secondary": t("Secondary button", "See plans"),
};
