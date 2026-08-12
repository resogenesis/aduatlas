import { useEffect, useMemo, useRef, useState } from "react";
import WorksheetBar from "../../components/tools/WorksheetBar";
import { loadPacket } from "../../stores/courseStore";
import { loadWorksheet, saveWorksheet } from "../../stores/worksheetStore";

// Pre-filled Builder Questionnaire — the deliverable homeowners hand to every
// builder so quotes come back apples to apples. Part 1 is the questions
// builders ask YOU (Module 8), pre-filled from your project brief and
// editable. Part 2 is the questions to ask EVERY builder (Module 8), printed
// as a checklist so each builder answers the same list.

// Part 1 — grouped questions; `fromPacket` seeds the answer on first load.
const ASK_YOU = [
  {
    title: "Property information",
    items: [
      { id: "address", q: "What is the property address?", fromPacket: "address" },
      { id: "feas", q: "Have you completed an ADUAtlas Feasibility Study?" },
      { id: "survey", q: "Have you obtained an official property survey?" },
      { id: "stories-primary", q: "Is the primary residence single-story or two-story?" },
      { id: "lot", q: "Lot square footage and dimensions", fromPacket: "lotSize" },
    ],
  },
  {
    title: "Intended use & selection",
    items: [
      { id: "use", q: "How do you plan to use the ADU — rental income, a family member, a guest house, a home office, or something else?", fromPacket: "purpose" },
      { id: "type", q: "What type of ADU are you interested in?", fromPacket: "aduType" },
      { id: "size", q: "Approximately what size would you like to build?", fromPacket: "desiredSqft" },
      { id: "method", q: "Have you selected a construction method?" },
    ],
  },
  {
    title: "Budget",
    items: [
      { id: "budget", q: "What is your total project budget?", fromPacket: "budget" },
      { id: "financing", q: "Will you be financing the project?" },
    ],
  },
  {
    title: "Property conditions",
    items: [
      { id: "slope", q: "Is the property flat or sloped?" },
      { id: "trees", q: "Does the property have mature trees?" },
      { id: "retaining", q: "Are there retaining walls?" },
      { id: "access", q: "Is backyard access limited?", fromPacket: "siteAccess" },
      { id: "overhead", q: "Are there overhead utility lines?" },
      { id: "utilities", q: "Utility locations and capacity", fromPacket: "utilityNotes" },
      { id: "obstacles", q: "Are there other site obstacles that may affect construction?" },
    ],
  },
  {
    title: "Additional",
    items: [
      { id: "hoa", q: "Do you belong to a homeowners association (HOA)?", fromPacket: "hoaNotes" },
      { id: "start", q: "When would you like construction to begin?", fromPacket: "timeline" },
      { id: "finish", q: "Is there a desired completion date?" },
    ],
  },
];

// Part 2 — ask every builder the same questions (Module 8).
const ASK_BUILDER = [
  {
    title: "Builder experience",
    items: [
      "Which ADU construction services do you provide?",
      "What services are not included?",
      "Have you completed similar ADU projects in my city?",
      "Have you previously obtained permits for similar projects?",
      "May I see photos of completed projects?",
      "May I speak with previous clients?",
    ],
  },
  {
    title: "Licensing & insurance",
    items: [
      "Are you licensed to perform this work?",
      "Are you fully insured?",
      "Can you provide proof of licensing and insurance?",
    ],
  },
  {
    title: "Proposal & scope of work",
    items: [
      "Will you provide an itemized written estimate?",
      "Does your proposal include site preparation?",
      "Does it include excavation and grading?",
      "Does it include utility connections?",
      "Does it include foundation construction?",
      "Will you assist with permits and inspections?",
    ],
  },
  {
    title: "Project management",
    items: [
      "When can construction begin?",
      "What is the estimated construction timeline?",
      "Who will be my primary point of contact?",
      "May I schedule periodic walkthroughs during construction?",
      "How are change orders handled?",
    ],
  },
  {
    title: "Payments",
    items: [
      "What payment schedule do you require?",
      "What milestones trigger payments?",
      "Are there circumstances that could increase the contract price?",
    ],
  },
];

const BuilderQuestionnaire = () => {
  const packet = useMemo(() => loadPacket(), []);
  const [answers, setAnswers] = useState(() => {
    const saved = loadWorksheet("questionnaire")?.answers;
    if (saved) return saved;
    // First load: seed from the project brief.
    const seeded = {};
    ASK_YOU.forEach((g) =>
      g.items.forEach((it) => {
        if (it.fromPacket && packet[it.fromPacket]) seeded[it.id] = String(packet[it.fromPacket]);
      })
    );
    if (packet.worksheets?.readyScore?.grade) {
      seeded.feas = `Yes — ADUAtlas Ready Score ${packet.worksheets.readyScore.grade}`;
    }
    return seeded;
  });
  const [savedAt, setSavedAt] = useState(null);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      saveWorksheet("questionnaire", { answers });
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [answers]);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Feasibility Report · Questionnaire
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-4">
        Builder questionnaire.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-2">
        Print this and bring it to every builder conversation. Part 1 answers the questions builders
        will ask you — pre-filled from your project brief. Part 2 is the same list of questions for
        every builder, so proposals come back apples to apples.
      </p>
      {packet.address && (
        <p className="text-paper-dim text-sm mb-8">
          Property: <span className="text-paper font-medium">{packet.address}</span>
        </p>
      )}

      {/* Part 1 */}
      <h2 className="font-display text-paper text-2xl sm:text-3xl mt-8 mb-1">Part 1 — Your answers</h2>
      <p className="text-paper-dim text-sm mb-6">
        Having these ready helps your project move efficiently and surfaces issues before detailed
        design work begins. Edit anything that's changed.
      </p>
      {ASK_YOU.map((group) => (
        <div key={group.title} className="mb-8">
          <h3 className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">{group.title}</h3>
          <div className="space-y-3">
            {group.items.map((it) => (
              <div key={it.id} className="p-4 bg-surface-1-solid rounded-xl border border-stroke">
                <label htmlFor={`q-${it.id}`} className="block text-sm text-paper leading-relaxed mb-2">{it.q}</label>
                <input
                  id={`q-${it.id}`}
                  type="text"
                  value={answers[it.id] || ""}
                  placeholder="Your answer"
                  onChange={(e) => setAnswers((a) => ({ ...a, [it.id]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/40 focus:outline-none focus:border-accent transition"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Part 2 */}
      <h2 className="font-display text-paper text-2xl sm:text-3xl mt-10 mb-1">Part 2 — Ask every builder</h2>
      <p className="text-paper-dim text-sm mb-6">
        Never assume two proposals include the same services because the totals look similar. Ask
        for written answers whenever possible — comparing builders on equal information beats
        comparing price alone.
      </p>
      {ASK_BUILDER.map((group) => (
        <div key={group.title} className="mb-8">
          <h3 className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">{group.title}</h3>
          <ul className="space-y-2">
            {group.items.map((q) => (
              <li key={q} className="flex items-start gap-3 p-3.5 bg-surface-1-solid rounded-xl border border-stroke">
                <span aria-hidden className="mt-0.5 w-4 h-4 shrink-0 rounded border border-paper-dim/50" />
                <span className="text-sm text-paper leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="text-paper-dim text-sm leading-relaxed mb-2">
        Still evaluating construction methods? Ask whether the builder offers modular, prefabricated,
        panelized, or kit ADUs — and whether they can coordinate pre-site preparation and utility
        connections.
      </p>
      <p className="text-paper-dim text-xs leading-relaxed">
        The more information you gather, the easier it becomes to compare builders on an equal basis
        rather than simply comparing price.
      </p>
    </div>
  );
};

export default BuilderQuestionnaire;
