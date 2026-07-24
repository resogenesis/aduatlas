// Course structure + progress + builder-packet state.
//
// STRUCTURE: the course is organized as MODULES, each containing CHAPTERS (and
// a short quiz). Progress is still tracked per-chapter — completing every
// chapter + quiz in a module completes the module. A flat `chapters` list is
// derived from the modules for navigation and progress math, so the gates and
// dashboard keep working unchanged.
//
// INTEGRATION POINT (Supabase): replace localStorage with reads/writes against
// `users.completed_chapters` (jsonb) and `users.builder_packet` (jsonb). Chapter
// ids are stable strings ("m1c1", "m1quiz") so stored progress survives.

import { loadAnswers } from "./quizStore";

const COMPLETED_KEY = "aduatlas.course.completed";
const PACKET_KEY = "aduatlas.packet";

// ── Modules → chapters ───────────────────────────────────────────────────────
// Module 1 is fully authored (content in courseContent.js). Modules 2–10 are
// scaffolded from the course outline; their chapters arrive as each module's
// script is finalized, so they render as "content coming" and don't count
// toward progress until populated.
export const modules = [
  {
    id: "m1",
    n: 1,
    title: "ADU Basics",
    blurb: "What an ADU is, the main types, and why homeowners build them.",
    intro:
      "Before comparing builders, selecting a design, or requesting estimates, it's important to understand what an ADU is, why it has become so popular, and how the industry has evolved. This module builds the foundation for the rest of the course.",
    framework: "Learn → Verify → Review → Plan → Verify → Build → Occupy",
    chapters: [
      { id: "m1c1", n: 1, title: "What Is an ADU?", blurb: "The legal definition and what every ADU must include.", minutes: 4 },
      { id: "m1c2", n: 2, title: "Common Names for an ADU", blurb: "Granny flat, casita, backyard cottage — one concept, many names.", minutes: 3 },
      { id: "m1c3", n: 3, title: "Where Can an ADU Be Built?", blurb: "The property factors that decide what's possible.", minutes: 4 },
      { id: "m1c4", n: 4, title: "Introduction to ADU Construction Options", blurb: "25+ construction methods and product types, introduced.", minutes: 5 },
      { id: "m1c5", n: 5, title: "Tiny Home vs. ADU", blurb: "Why the words matter when you talk to your city.", minutes: 3 },
      { id: "m1c6", n: 6, title: "Why Are ADUs So Popular?", blurb: "The forces driving the fastest-growing housing trend in America.", minutes: 5 },
      { id: "m1c7", n: 7, title: "Seven Common ADU Misconceptions", blurb: "The myths that cost homeowners time and money.", minutes: 6 },
      { id: "m1quiz", n: 8, kind: "quiz", title: "Module 1 Quiz", blurb: "Test your knowledge before moving on.", minutes: 5 },
    ],
  },
  {
    "id": "m2",
    "n": 2,
    "title": "Understanding City & State ADU Regulations",
    "blurb": "How state law, local zoning, and HOA rules shape what you can build — and the key regulations to check before you plan.",
    "intro": "Before you fall in love with a floor plan, you need to understand the rules that govern your specific property. This module explains how state law, local zoning, and homeowner associations interact, then walks through the key regulations — setbacks, height, size, lot coverage, parking, and utilities — that determine what may realistically fit on your lot.",
    "chapters": [
      {
        "id": "m2c1",
        "n": 1,
        "title": "Why Location Determines What You Can Build",
        "blurb": "State law sets the floor, local zoning fills in the details, and an HOA can add its own layer.",
        "minutes": 5
      },
      {
        "id": "m2c2",
        "n": 2,
        "title": "Setbacks, Height Limits, and Lot Coverage",
        "blurb": "The rules that govern where a structure can sit on your lot and how much of it can be built on.",
        "minutes": 5
      },
      {
        "id": "m2c3",
        "n": 3,
        "title": "Size Limits and Parking Requirements",
        "blurb": "How big your ADU can be, and whether you'll need to provide parking.",
        "minutes": 4
      },
      {
        "id": "m2c4",
        "n": 4,
        "title": "Utility Requirements",
        "blurb": "How your ADU will connect to water, sewer, and power — and why it can affect cost and feasibility.",
        "minutes": 4
      },
      {
        "id": "m2quiz",
        "n": 5,
        "kind": "quiz",
        "title": "Module 2 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m3",
    "n": 3,
    "title": "The 10-Step ADU Process",
    "blurb": "A homeowner's roadmap for building an ADU the right way — as a process, not a single purchase.",
    "intro": "Building an ADU is not a single purchase — it is a process. This module walks you through the ten steps homeowners follow to get the best results, moving from Learn to Verify to Review to Plan to Build to Occupy so you reach builders prepared and avoid costly surprises.",
    "chapters": [
      {
        "id": "m3c1",
        "n": 1,
        "title": "An ADU Is a Process, Not a Purchase",
        "blurb": "Why the best outcomes come from following a sequence, not buying a product.",
        "minutes": 3
      },
      {
        "id": "m3c2",
        "n": 2,
        "title": "Steps 01-03: Learn and Verify",
        "blurb": "Educate yourself, run your feasibility study, and verify local rules before spending real money.",
        "minutes": 5
      },
      {
        "id": "m3c3",
        "n": 3,
        "title": "Steps 04-06: Review Your Options",
        "blurb": "Explore ADU types, estimate your total budget, and match options to your property.",
        "minutes": 5
      },
      {
        "id": "m3c4",
        "n": 4,
        "title": "Steps 07-08: Plan Financing and Compare Builders",
        "blurb": "Line up your financing and timeline, then request proposals from several builders.",
        "minutes": 4
      },
      {
        "id": "m3c5",
        "n": 5,
        "title": "Steps 09-10: Build and Occupy",
        "blurb": "Select the right builder, begin construction, and protect yourself at final inspection.",
        "minutes": 4
      },
      {
        "id": "m3quiz",
        "n": 6,
        "kind": "quiz",
        "title": "Module 3 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m4",
    "n": 4,
    "title": "The ADU Universe — 25+ Types & Construction Methods",
    "blurb": "Organize the crowded ADU marketplace into a simple three-layer framework so you can compare your options with confidence.",
    "intro": "Today's homeowners have more ADU choices than ever — hundreds of possible combinations of construction methods, styles, floor plans, and finishes. This module organizes what ADUAtlas calls the ADU Universe into a simple framework so you can understand your options and narrow them based on your property, budget, goals, and vision. Remember: building an ADU is a process, not a purchase.",
    "tag": "Photos & videos",
    "chapters": [
      {
        "id": "m4c1",
        "n": 1,
        "title": "Welcome to the ADU Universe",
        "blurb": "Why there are so many ADU choices — and the framework that makes them manageable.",
        "minutes": 4
      },
      {
        "id": "m4c2",
        "n": 2,
        "title": "Understanding the ADU Universe",
        "blurb": "Every ADU is a combination of three decisions — build method, style, and use.",
        "minutes": 4
      },
      {
        "id": "m4c3",
        "n": 3,
        "title": "Site-Built & Custom ADUs",
        "blurb": "The traditional method that offers the greatest design flexibility.",
        "minutes": 4
      },
      {
        "id": "m4c4",
        "n": 4,
        "title": "Factory-Built ADUs",
        "blurb": "A fast-growing category — and why the quoted price rarely tells the whole story.",
        "minutes": 4
      },
      {
        "id": "m4c5",
        "n": 5,
        "title": "Engineered Building Systems",
        "blurb": "How panelized construction and SIPs differ — and when each makes sense.",
        "minutes": 5
      },
      {
        "id": "m4c6",
        "n": 6,
        "title": "Kit Homes & Cabin Packages",
        "blurb": "A century-old option, reinvented — but read the fine print on what's included.",
        "minutes": 4
      },
      {
        "id": "m4c7",
        "n": 7,
        "title": "Tiny Living Options",
        "blurb": "Tiny homes, park models, pods, and bunkies — and whether they legally qualify as ADUs.",
        "minutes": 4
      },
      {
        "id": "m4c8",
        "n": 8,
        "title": "Alternative Construction",
        "blurb": "Container, dome, Quonset, and 3D-printed homes — innovative but require careful evaluation.",
        "minutes": 5
      },
      {
        "id": "m4c9",
        "n": 9,
        "title": "Architectural Styles & Exterior Design",
        "blurb": "The personality of your ADU — a decision separate from how it's built.",
        "minutes": 4
      },
      {
        "id": "m4c10",
        "n": 10,
        "title": "Size, Floor Plans & Layouts",
        "blurb": "A thoughtful floor plan built around intended use often beats extra square footage.",
        "minutes": 4
      },
      {
        "id": "m4c11",
        "n": 11,
        "title": "Comparing ADU Options",
        "blurb": "Compare the complete project, not one feature — and ask 'best for my property?'",
        "minutes": 5
      },
      {
        "id": "m4c12",
        "n": 12,
        "title": "Understanding Pricing",
        "blurb": "Why two similar ADUs can be priced $70K apart — and the terms behind the numbers.",
        "minutes": 5
      },
      {
        "id": "m4c13",
        "n": 13,
        "title": "How to Narrow Your ADU Options",
        "blurb": "Start with your property, think long-term, and separate wants from needs.",
        "minutes": 5
      },
      {
        "id": "m4c14",
        "n": 14,
        "title": "Before You Contact a Builder",
        "blurb": "Review what you've learned so your builder conversations are productive.",
        "minutes": 4
      },
      {
        "id": "m4quiz",
        "n": 15,
        "kind": "quiz",
        "title": "Module 4 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m5",
    "n": 5,
    "title": "Pre-Site Preparation & Budgets",
    "blurb": "The pre-site costs, foundations, timelines, and budget planning that turn an ADU price tag into a realistic total project cost.",
    "intro": "Before you build an ADU, you need more than a floor plan and a builder—you need a plan. This module shows you how to evaluate your property, understand the factors that drive cost, and build a realistic preliminary budget before hiring anyone. The goal isn't to become a contractor; it's to become a well-prepared homeowner. Remember: building an ADU is a process, not a purchase.",
    "tag": "Major value driver",
    "chapters": [
      {
        "id": "m5c1",
        "n": 1,
        "title": "Why Pre-Site Planning Matters",
        "blurb": "The structure is only one part of your total project cost.",
        "minutes": 4
      },
      {
        "id": "m5c2",
        "n": 2,
        "title": "Choosing the Best ADU Location",
        "blurb": "The city determines where you can build; your property determines the cost.",
        "minutes": 4
      },
      {
        "id": "m5c3",
        "n": 3,
        "title": "Utility Planning",
        "blurb": "Distance from existing utilities has a direct impact on cost.",
        "minutes": 3
      },
      {
        "id": "m5c4",
        "n": 4,
        "title": "Potential Site Preparation",
        "blurb": "Some properties need extra work before construction can begin.",
        "minutes": 4
      },
      {
        "id": "m5c5",
        "n": 5,
        "title": "Foundations",
        "blurb": "The stable base beneath your ADU and one of the first major costs.",
        "minutes": 3
      },
      {
        "id": "m5c6",
        "n": 6,
        "title": "Surveys, Permits & Inspections",
        "blurb": "Meeting your city's requirements before construction begins.",
        "minutes": 4
      },
      {
        "id": "m5c7",
        "n": 7,
        "title": "Understanding Project Timelines",
        "blurb": "Why every project timeline is different—and usually longer than expected.",
        "minutes": 4
      },
      {
        "id": "m5c8",
        "n": 8,
        "title": "Creating Your Preliminary Budget",
        "blurb": "A complete budget covers far more than the ADU itself.",
        "minutes": 3
      },
      {
        "id": "m5c9",
        "n": 9,
        "title": "The ADUAtlas Property Feasibility Study",
        "blurb": "Applying what you've learned to your specific property.",
        "minutes": 3
      },
      {
        "id": "m5quiz",
        "n": 10,
        "kind": "quiz",
        "title": "Module 5 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m6",
    "n": 6,
    "title": "ADU FAQ",
    "blurb": "40 answers to the questions homeowners ask most throughout the ADU journey.",
    "intro": "Think of this module as your ADU field guide: a reference collection of the questions homeowners ask throughout the process. Some answers are general, while others depend entirely on your property, local regulations, and goals. Return to it often as you move from research to planning, permitting, and construction.",
    "chapters": [
      {
        "id": "m6c1",
        "n": 1,
        "title": "General: How ADUs Work",
        "blurb": "The foundation questions every homeowner should start with.",
        "minutes": 3
      },
      {
        "id": "m6c2",
        "n": 2,
        "title": "Regulations & Zoning",
        "blurb": "What's allowed, where it can go, and who decides.",
        "minutes": 4
      },
      {
        "id": "m6c3",
        "n": 3,
        "title": "Planning & Feasibility",
        "blurb": "Understand your property before you commit money.",
        "minutes": 4
      },
      {
        "id": "m6c4",
        "n": 4,
        "title": "Budgets, Costs & Financing",
        "blurb": "The full cost of an ADU is more than the sticker price.",
        "minutes": 5
      },
      {
        "id": "m6c5",
        "n": 5,
        "title": "Choosing, Builders & Construction",
        "blurb": "Buying smart, comparing quotes, and what to expect on site.",
        "minutes": 6
      },
      {
        "id": "m6c6",
        "n": 6,
        "title": "About ADUAtlas & Living in an ADU",
        "blurb": "What ADUAtlas does, and life once your ADU is built.",
        "minutes": 5
      },
      {
        "id": "m6quiz",
        "n": 7,
        "kind": "quiz",
        "title": "Module 6 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m7",
    "n": 7,
    "title": "False Starts",
    "blurb": "Spot the project killers and budget killers that can stop an ADU before you spend money on surveys, engineering, permits, or builders.",
    "intro": "Sometimes the smartest decision is knowing when to stop. This module introduces the National ADU Property Evaluation (NAPE), a simple Yes/No self-check designed to surface potential deal-breakers early — before you spend money on surveys, engineering, permits, or builder consultations. The goal is not to discourage you, but to help you build smart and avoid a costly false start.",
    "tag": "NAPE",
    "chapters": [
      {
        "id": "m7c1",
        "n": 1,
        "title": "What NAPE Is — and Why Stopping Can Be Smart",
        "blurb": "The mindset behind knowing when to stop, and what NAPE is designed to do.",
        "minutes": 4
      },
      {
        "id": "m7c2",
        "n": 2,
        "title": "Common Property Killers",
        "blurb": "Physical and regulatory conditions that can make a property unbuildable — or much harder than expected.",
        "minutes": 5
      },
      {
        "id": "m7c3",
        "n": 3,
        "title": "Common Budget Killers",
        "blurb": "The costs that don't stop a build on paper but can stop it in your bank account.",
        "minutes": 4
      },
      {
        "id": "m7c4",
        "n": 4,
        "title": "How to Use the Yes/No Self-Evaluation",
        "blurb": "Turning NAPE into a practical early-stage decision tool.",
        "minutes": 4
      },
      {
        "id": "m7quiz",
        "n": 5,
        "kind": "quiz",
        "title": "Module 7 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m8",
    "n": 8,
    "title": "Builder Preparation",
    "blurb": "Get organized before you talk to builders so proposals are accurate and easy to compare.",
    "intro": "Speaking with builders is one of the most important steps in the ADU process — and one homeowners often rush into unprepared. This module helps you organize your project, understand the questions builders will ask, know the questions you should ask them, and compare proposals with confidence.",
    "chapters": [
      {
        "id": "m8c1",
        "n": 1,
        "title": "Preparing to Meet with a Builder",
        "blurb": "Why preparation comes before the first builder conversation.",
        "minutes": 4
      },
      {
        "id": "m8c2",
        "n": 2,
        "title": "Questions Your Builder Is Likely to Ask",
        "blurb": "Have these answers ready so your project moves forward efficiently.",
        "minutes": 4
      },
      {
        "id": "m8c3",
        "n": 3,
        "title": "Questions Every Homeowner Should Ask a Builder",
        "blurb": "Don't assume two proposals include the same services.",
        "minutes": 5
      },
      {
        "id": "m8c4",
        "n": 4,
        "title": "Questions for a Prefab, Modular, or Kit ADU Supplier",
        "blurb": "Know exactly what's included before you buy a factory-built ADU.",
        "minutes": 6
      },
      {
        "id": "m8c5",
        "n": 5,
        "title": "Compare Bids Carefully",
        "blurb": "The lowest price isn't always the best value.",
        "minutes": 3
      },
      {
        "id": "m8c6",
        "n": 6,
        "title": "ADUAtlas Guidance & Module Summary",
        "blurb": "What these tools do, what they don't, and where you go next.",
        "minutes": 4
      },
      {
        "id": "m8quiz",
        "n": 7,
        "kind": "quiz",
        "title": "Module 8 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m9",
    "n": 9,
    "title": "Property Feasibility Report Packet",
    "blurb": "Verify what you can build, and where, before spending money — inside the ADUAtlas Property Feasibility Study.",
    "intro": "You've learned how detached ADUs work, how regulations shape your project, how to prepare your site, and how to build a preliminary budget. Now it's time to apply that knowledge to your specific property. This module walks through the ADUAtlas Property Feasibility Study — the packet that turns everything you've learned into a plan for your lot.",
    "chapters": [
      {
        "id": "m9c1",
        "n": 1,
        "title": "Why Verify Before You Build",
        "blurb": "Every property is different — guessing costs you money.",
        "minutes": 4
      },
      {
        "id": "m9c2",
        "n": 2,
        "title": "What the Study Includes",
        "blurb": "One planning packet instead of a dozen scattered sources.",
        "minutes": 3
      },
      {
        "id": "m9c3",
        "n": 3,
        "title": "Your GIS Property Diagram",
        "blurb": "See your lot, your rules, and your options in one picture.",
        "minutes": 3
      },
      {
        "id": "m9c4",
        "n": 4,
        "title": "Interactive Planning Worksheets",
        "blurb": "Four tools that turn information into a practical plan.",
        "minutes": 3
      },
      {
        "id": "m9c5",
        "n": 5,
        "title": "NAPE — National ADU Property Evaluation",
        "blurb": "Score your property's detached ADU potential.",
        "minutes": 3
      },
      {
        "id": "m9c6",
        "n": 6,
        "title": "Budget, Timelines, Permits & Inspections",
        "blurb": "Planning tools that reveal your total project, not just the structure.",
        "minutes": 3
      },
      {
        "id": "m9c7",
        "n": 7,
        "title": "How the Study Saves Time and Money",
        "blurb": "Start the builder conversation informed, not empty-handed.",
        "minutes": 5
      },
      {
        "id": "m9quiz",
        "n": 8,
        "kind": "quiz",
        "title": "Module 9 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
  {
    "id": "m10",
    "n": 10,
    "title": "Moving Forward Prepared",
    "blurb": "Organize everything you've learned to confidently meet builders, compare proposals, and move your ADU project forward.",
    "intro": "Building an ADU is one of the largest investments many homeowners will ever make, and successful projects begin long before construction starts. This final module helps you organize your information, prepare for builder conversations, and move forward with confidence.",
    "chapters": [
      {
        "id": "m10c1",
        "n": 1,
        "title": "Where Do I Start?",
        "blurb": "Gather everything into one organized project folder before contacting builders.",
        "minutes": 4
      },
      {
        "id": "m10c2",
        "n": 2,
        "title": "Preparing to Meet with Builders",
        "blurb": "Know your goals, style, budget, constraints, and timeline before the conversation.",
        "minutes": 3
      },
      {
        "id": "m10c3",
        "n": 3,
        "title": "Questions Builders Will Ask You",
        "blurb": "Anticipate the common questions so you can answer with confidence.",
        "minutes": 3
      },
      {
        "id": "m10c4",
        "n": 4,
        "title": "Questions You Should Ask Every Builder",
        "blurb": "Ask each builder the same questions so you can compare answers fairly.",
        "minutes": 4
      },
      {
        "id": "m10c5",
        "n": 5,
        "title": "Understanding Your City's Building Department",
        "blurb": "Learn how your city's permitting process works before construction begins.",
        "minutes": 4
      },
      {
        "id": "m10c6",
        "n": 6,
        "title": "Hiring a Builder or Becoming Your Own General Contractor",
        "blurb": "Weigh the responsibilities of managing your own project against hiring a pro.",
        "minutes": 4
      },
      {
        "id": "m10c7",
        "n": 7,
        "title": "Your ADUAtlas Roadmap",
        "blurb": "Everything you now understand, and the framework to carry forward.",
        "minutes": 4
      },
      {
        "id": "m10quiz",
        "n": 8,
        "kind": "quiz",
        "title": "Module 10 Quiz",
        "blurb": "Test your knowledge before moving on.",
        "minutes": 5
      }
    ]
  },
];

// Flat, ordered list of every authored chapter (+ quiz), each tagged with its
// module. Used for navigation, progress math, and backward compatibility.
export const chapters = modules.flatMap((m) =>
  m.chapters.map((c) => ({
    ...c,
    moduleId: m.id,
    moduleN: m.n,
    moduleTitle: m.title,
  }))
);

export const chapterById = (id) => chapters.find((c) => c.id === id) || null;
export const moduleById = (id) => modules.find((m) => m.id === id) || null;

const readSet = (key) => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const writeSet = (key, set) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...set]));
};

export const getCompletedChapters = () => readSet(COMPLETED_KEY);

export const markChapterComplete = (id) => {
  const s = getCompletedChapters();
  s.add(id);
  writeSet(COMPLETED_KEY, s);
};

export const unmarkChapter = (id) => {
  const s = getCompletedChapters();
  s.delete(id);
  writeSet(COMPLETED_KEY, s);
};

export const courseProgress = () => {
  if (!chapters.length) return 0;
  const done = getCompletedChapters();
  const doneCount = chapters.filter((c) => done.has(c.id)).length;
  return Math.round((doneCount / chapters.length) * 100);
};

export const nextChapter = () => {
  const done = getCompletedChapters();
  return chapters.find((c) => !done.has(c.id)) || null;
};

// Per-module completion, for the module list + progress rings.
export const getModuleProgress = (moduleId) => {
  const m = moduleById(moduleId);
  const total = m?.chapters.length || 0;
  if (!total) return { done: 0, total: 0, percent: 0, started: false, complete: false };
  const completed = getCompletedChapters();
  const done = m.chapters.filter((c) => completed.has(c.id)).length;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
    started: done > 0,
    complete: done === total,
  };
};

// ── Builder Packet ──────────────────────────────────────────────────────────
// Each field is "filled" when the user has provided it, either via the quiz
// or via /my-property. Order matches what builders actually ask.

export const PACKET_FIELDS = [
  { key: "zip", label: "ZIP code" },
  { key: "lotSize", label: "Lot size" },
  { key: "budget", label: "Budget" },
  { key: "purpose", label: "Purpose" },
  { key: "timeline", label: "Timeline" },
  { key: "address", label: "Property address" },
  { key: "aduType", label: "Desired ADU type" },
  { key: "desiredSqft", label: "Desired ADU sq ft" },
  { key: "stories", label: "Stories (1 or 2)" },
  { key: "siteAccess", label: "Site access notes" },
  { key: "utilityNotes", label: "Utility notes" },
  { key: "hoaNotes", label: "HOA / restrictions" },
];

const readPacket = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PACKET_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writePacket = (p) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PACKET_KEY, JSON.stringify(p));
};

export const loadPacket = () => {
  // Merge quiz answers in as defaults so the packet picks up what's already
  // known from the funnel.
  const quiz = loadAnswers();
  const own = readPacket();
  return {
    zip: quiz.zip || "",
    lotSize: quiz.lotSize || "",
    budget: quiz.budget || "",
    purpose: quiz.purpose || "",
    timeline: quiz.timeline || "",
    address: "",
    aduType: "",
    desiredSqft: "",
    stories: "",
    siteAccess: "",
    utilityNotes: "",
    hoaNotes: "",
    ...own,
  };
};

export const savePacket = (next) => writePacket(next);

// Merge server-side progress (from the signed-in user's row) into local state.
// Union for chapters and blank-fill for the packet, so a login/refresh NEVER
// wipes progress made locally — it only ever adds what the server also knows.
// Safe to call on every auth hydration.
export const mergeServerProgress = ({ completedChapters, builderPacket } = {}) => {
  if (Array.isArray(completedChapters) && completedChapters.length) {
    const s = getCompletedChapters();
    completedChapters.forEach((id) => s.add(id));
    writeSet(COMPLETED_KEY, s);
  }
  if (builderPacket && typeof builderPacket === "object") {
    const own = readPacket();
    const merged = { ...own };
    for (const [k, v] of Object.entries(builderPacket)) {
      if (v != null && v !== "" && (merged[k] == null || merged[k] === "")) merged[k] = v;
    }
    writePacket(merged);
  }
};

export const packetProgress = () => {
  const p = loadPacket();
  const filled = PACKET_FIELDS.filter((f) => Boolean(String(p[f.key] || "").trim())).length;
  return {
    filled,
    total: PACKET_FIELDS.length,
    percent: Math.round((filled / PACKET_FIELDS.length) * 100),
    fields: PACKET_FIELDS.map((f) => ({ ...f, done: Boolean(String(p[f.key] || "").trim()) })),
  };
};

// Gates
export const FEASIBILITY_UNLOCK_AT = 80; // % course progress
export const isFeasibilityUnlocked = () => courseProgress() >= FEASIBILITY_UNLOCK_AT;
export const isBuildersUnlocked = () => isFeasibilityUnlocked() && packetProgress().percent >= 75;
