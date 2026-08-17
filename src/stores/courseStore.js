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
    framework: "Learn → Verify → Review → Plan → Verify → Build",
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
    "blurb": "How state building codes and local zoning work together — and the key regulations to verify before you plan.",
    "intro": "Understanding ADU regulations is one of the biggest challenges homeowners face. Many people begin by comparing ADU designs, builders, and prices before they understand what they are legally allowed to build — which leads to unrealistic expectations, unnecessary expenses, and costly delays. The question isn't simply “Can I build an ADU?” The better question is: “What can I legally build on my property?”",
    "chapters": [
      {
        "id": "m2c1",
        "n": 1,
        "title": "Why ADU Regulations Matter",
        "blurb": "The biggest mistake homeowners make is shopping for an ADU before knowing what they're legally allowed to build.",
        "minutes": 5
      },
      {
        "id": "m2c2",
        "n": 2,
        "title": "State Building Codes vs. Local Zoning",
        "blurb": "The IRC sets minimum construction standards; your city decides what and where you can actually build.",
        "minutes": 4
      },
      {
        "id": "m2c3",
        "n": 3,
        "title": "The Most Common ADU Regulations",
        "blurb": "Fifteen regulations to check — and why a maximum on paper isn't a promise for your lot.",
        "minutes": 6
      },
      {
        "id": "m2c4",
        "n": 4,
        "title": "Common Regulation Examples",
        "blurb": "Typical ranges you may encounter — examples, not guarantees.",
        "minutes": 5
      },
      {
        "id": "m2c5",
        "n": 5,
        "title": "Why Homeowners Get Confused",
        "blurb": "Why “Can I build an ADU?” has no simple yes-or-no answer.",
        "minutes": 5
      },
      {
        "id": "m2c6",
        "n": 6,
        "title": "Surveys, Permits, Timelines & Cost Estimates",
        "blurb": "The planning phases, typical timelines, and what permitting really costs.",
        "minutes": 6
      },
      {
        "id": "m2c7",
        "n": 7,
        "title": "How Cities Guide Homeowners: A California Example",
        "blurb": "What a typical city ADU process looks like — and why the information feels scattered.",
        "minutes": 4
      },
      {
        "id": "m2c8",
        "n": 8,
        "title": "The ADUAtlas Property Feasibility Study",
        "blurb": "Bridging the gap between the regulations and your specific property.",
        "minutes": 4
      },
      {
        "id": "m2c9",
        "n": 9,
        "title": "Module Summary",
        "blurb": "What you should now understand before moving on to the 10-step process.",
        "minutes": 3
      },
      {
        "id": "m2quiz",
        "n": 10,
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
    "title": "The ADUAtlas 10-Step Process",
    "blurb": "A logical roadmap from education and planning to construction and occupancy — each step builds on the one before it.",
    "intro": "One of the best ways to ensure success with any big project is to have all the facts and understand the process before you begin. Many people start by calling builders, ordering surveys, or looking at ADU designs before they understand what their property can support and how much it will cost. Imagine discovering that your pre-site costs are $30,000 higher than expected, or that the largest ADU you can legally build is too small for your intended use. This module provides a simple 10-step roadmap designed to help you avoid costly mistakes — every city and every project is different, but most successful ADU projects follow a similar path. Think of ADUAtlas as your blueprint for a successful build: follow the process, do the right things before you build, and you'll save time, stress, and money.",
    "chapters": [
      {
        "id": "m3c1",
        "n": 1,
        "title": "Step 1 — Complete the ADUAtlas Course",
        "blurb": "Education comes before money — understand the process before surveys, plans, or permits.",
        "minutes": 3
      },
      {
        "id": "m3c2",
        "n": 2,
        "title": "Step 2 — Complete the Property Feasibility Study",
        "blurb": "Determine what you can legally build before deciding what you'd like to build.",
        "minutes": 3
      },
      {
        "id": "m3c3",
        "n": 3,
        "title": "Step 3 — Verify Your Local ADU Regulations",
        "blurb": "Regulations vary by city, ZIP code, sometimes by address — and they change.",
        "minutes": 3
      },
      {
        "id": "m3c4",
        "n": 4,
        "title": "Step 4 — Establish a Realistic Budget",
        "blurb": "Why move forward without a good estimate?",
        "minutes": 3
      },
      {
        "id": "m3c5",
        "n": 5,
        "title": "Step 5 — Select an ADU Type",
        "blurb": "Over 1,000 options — and the cheapest isn't always the best deal, or even legal.",
        "minutes": 3
      },
      {
        "id": "m3c6",
        "n": 6,
        "title": "Step 6 — Determine Whether a Survey Is Required",
        "blurb": "Some cities require one, some don't — and survey types differ widely.",
        "minutes": 3
      },
      {
        "id": "m3c7",
        "n": 7,
        "title": "Step 7 — Develop a Site Plan",
        "blurb": "Design the whole space — patio, garden, parking — around the legal boundaries.",
        "minutes": 4
      },
      {
        "id": "m3c8",
        "n": 8,
        "title": "Step 8 — Select a Builder",
        "blurb": "Compare experience, portfolio, references, warranty, and construction method.",
        "minutes": 4
      },
      {
        "id": "m3c9",
        "n": 9,
        "title": "Step 9 — Permits, Inspections & Approval",
        "blurb": "Your city's permit application, fee schedule, and submittal checklists.",
        "minutes": 3
      },
      {
        "id": "m3c10",
        "n": 10,
        "title": "Step 10 — Construction, Final Inspection & Occupancy",
        "blurb": "From site prep to Certificate of Occupancy.",
        "minutes": 3
      },
      {
        "id": "m3quiz",
        "n": 11,
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
    "title": "False Starts & NAPE",
    "blurb": "Can I build an ADU? Identify no-go conditions, high-risk false starts, and budget killers — and score your property with NAPE.",
    "intro": "Every homeowner wants to know whether an ADU can be built on their property. Unfortunately, many people spend thousands of dollars before discovering that zoning restrictions, utility limitations, easements, access issues, or site conditions make the project far more expensive than expected — or impossible to build. This module introduces the National ADU Property Evaluation (NAPE), an early screening tool designed to identify potential obstacles before significant financial commitments. It does not replace surveys, engineering, city approvals, or builder evaluations. Sometimes the result confirms you're on the right path; sometimes it identifies issues that require research; and sometimes it helps you avoid one of the most expensive mistakes of your life. Knowledge before construction is one of the most valuable investments you can make.",
    "tag": "NAPE",
    "chapters": [
      {
        "id": "m7c1",
        "n": 1,
        "title": "Can I Build an ADU?",
        "blurb": "Yes, not yet, or no — and why obstacles aren't always permanent.",
        "minutes": 5
      },
      {
        "id": "m7c2",
        "n": 2,
        "title": "Why Projects Fail Before They Begin",
        "blurb": "Owning a property doesn't automatically mean you can build on it.",
        "minutes": 3
      },
      {
        "id": "m7c3",
        "n": 3,
        "title": "What Is NAPE?",
        "blurb": "A fast, nationwide Yes/No evaluation of a property's ADU potential.",
        "minutes": 3
      },
      {
        "id": "m7c4",
        "n": 4,
        "title": "Automatic No-Go Conditions",
        "blurb": "The legal obstacles that stop projects — zoning, lot size, setbacks, easements.",
        "minutes": 5
      },
      {
        "id": "m7c5",
        "n": 5,
        "title": "High-Risk False Starts",
        "blurb": "Slope, overlays, access, water service, septic — conditions that inflate costs.",
        "minutes": 6
      },
      {
        "id": "m7c6",
        "n": 6,
        "title": "Financial False Starts",
        "blurb": "Legally buildable isn't the same as financially practical.",
        "minutes": 4
      },
      {
        "id": "m7c7",
        "n": 7,
        "title": "The NAPE Scoring System",
        "blurb": "Five weighted categories, 100 possible points.",
        "minutes": 4
      },
      {
        "id": "m7c8",
        "n": 8,
        "title": "Understanding Your NAPE Score",
        "blurb": "What grades A through F mean — and why No today isn't No forever.",
        "minutes": 4
      },
      {
        "id": "m7quiz",
        "n": 9,
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
    "title": "From Vision to Reality",
    "blurb": "Cedar Grove's lessons, the verification process, your real budget, and everything that carries your vision into a buildable plan.",
    "intro": "Congratulations — you have completed the education. Building a detached ADU is not a simple transaction: there are property conditions, regulations, construction choices, utility requirements, pre-site expenses, and permitting procedures to consider. This final module moves you from education to verification: verify your utilities, refine your pre-site estimate, organize your total project budget, prepare for builder conversations, work with your city — and keep asking one final question: what else? Is there anything I am missing? The goal is not simply to build an ADU. The goal is to make the best decision for you, your property, your budget, and your vision. Remember the carpenter's rule: measure twice, cut once. For an ADU project, that means verify twice, build once.",
    "chapters": [
      {
        "id": "m10c1",
        "n": 1,
        "title": "Lessons I Learned from Cedar Grove",
        "blurb": "A real story about committing to a vision before understanding the property.",
        "minutes": 5
      },
      {
        "id": "m10c2",
        "n": 2,
        "title": "From Feasibility to Verification",
        "blurb": "Verify the property, the regulations, the ADU, and the budget.",
        "minutes": 5
      },
      {
        "id": "m10c3",
        "n": 3,
        "title": "Verifying Utilities & Connection Points",
        "blurb": "Markers aren't connection points — capacity, ownership, and fees to confirm.",
        "minutes": 6
      },
      {
        "id": "m10c4",
        "n": 4,
        "title": "Completing Your Pre-Site Estimate",
        "blurb": "Every expense to consider — and why pre-site work can add 30–50% or more.",
        "minutes": 6
      },
      {
        "id": "m10c5",
        "n": 5,
        "title": "Building Your Realistic Total Budget",
        "blurb": "Six steps: pre-site first, then what remains for the structure.",
        "minutes": 5
      },
      {
        "id": "m10c6",
        "n": 6,
        "title": "Preparing to Meet with Builders",
        "blurb": "Your project folder, their questions, your questions, and comparing the same scope.",
        "minutes": 6
      },
      {
        "id": "m10c7",
        "n": 7,
        "title": "Working with Your City & Utility Providers",
        "blurb": "Easements, planned infrastructure, and why the first No isn't always final.",
        "minutes": 5
      },
      {
        "id": "m10c8",
        "n": 8,
        "title": "Hiring a Builder or Being Your Own GC",
        "blurb": "Two very different roles — choose the one that matches your capacity.",
        "minutes": 4
      },
      {
        "id": "m10c9",
        "n": 9,
        "title": "The ADUAtlas Promise & Your Next Steps",
        "blurb": "One year of access, our information commitment, and your 10-step checklist.",
        "minutes": 5
      },
      {
        "id": "m10c10",
        "n": 10,
        "title": "Course Summary & Wrap-Up",
        "blurb": "Everything you now understand — and the framework to carry forward.",
        "minutes": 4
      },
      {
        "id": "m10quiz",
        "n": 11,
        "kind": "quiz",
        "title": "Module 10 Quiz",
        "blurb": "Test your knowledge one final time.",
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
