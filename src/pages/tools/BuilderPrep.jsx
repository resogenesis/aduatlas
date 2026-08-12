import { useMemo } from "react";
import { FiCheck } from "react-icons/fi";
import WorksheetBar from "../../components/tools/WorksheetBar";
import { Disclaimer, TextCell, WsHeader } from "../../components/tools/worksheetUi";
import { usePersistedWorksheet } from "../../components/tools/worksheetKit";
import { loadPacket } from "../../stores/courseStore";

// Worksheet 3 of 6 — Builder Preparation (from the ADUAtlas workbook).
// Give every builder or GC the same project information and ask the same
// questions, so quotes come back accurate and comparable.

const BEFORE = [
  "Review your ADUAtlas Feasibility Report.",
  "Check your HOA or neighborhood association requirements, if applicable. This is for your own verification and does not need to be provided to the builder.",
  "Review the approximate utility connection distances identified in your ADUAtlas Feasibility Report.",
  "A builder or GC may want to visit your property to verify measurements, utility locations, site access, and other site conditions before providing a final quote.",
  "If you plan to finance your ADU, ask your bank or lender what information or documentation they require from the GC for financing.",
];

// `fromPacket` seeds the note field on first use.
const PROVIDE = [
  { id: "address", label: "Property address", fromPacket: "address" },
  { id: "feas-report", label: "ADUAtlas Feasibility Report" },
  { id: "size", label: "ADU size", fromPacket: "desiredSqft" },
  { id: "type", label: "ADU type or construction method being considered", fromPacket: "aduType" },
  { id: "floorplan", label: "Floor plan" },
  { id: "utility-dist", label: "Approximate utility connection distances", fromPacket: "utilityNotes" },
  { id: "site-access", label: "Known site and access information", fromPacket: "siteAccess" },
  { id: "timeframe", label: "Desired project timeframe", fromPacket: "timeline" },
  { id: "presite-info", label: "Other relevant verified pre-site information" },
];

const QUESTIONS = [
  "What exactly is included in your quote?",
  "What is not included in your quote?",
  "Can you provide an itemized quote?",
  "Does your quote include site preparation?",
  "Does your quote include the foundation?",
  "Does your quote include utility connections?",
  "Does your quote include permits and permit-related costs?",
  "Is set up or assembly included?",
  "Who is responsible for coordinating inspections?",
  "Are delivery or transportation costs included?",
  "If a crane is required, is the crane included?",
  "Are appliances, fixtures, finishes, and upgrades included?",
  "What additional costs could I be responsible for?",
  "Do you have experience building ADUs?",
  "Do you have experience working with my city's permitting and inspection process?",
  "Can you provide examples of comparable ADU projects you have completed?",
  "Can you provide references?",
  "When could you begin my project?",
  "What is the estimated construction timeline?",
  "Are you licensed and insured?",
  "What is your payment schedule?",
  "How are change orders handled?",
  "If your proposal is substantially higher or lower than another proposal, can you explain why?",
];

const BuilderPrep = () => {
  const [d, set, savedAt] = usePersistedWorksheet("builderPrep");
  const packet = useMemo(() => loadPacket(), []);
  const provideValue = (row) =>
    d[`provide-${row.id}`] ?? (row.fromPacket ? String(packet[row.fromPacket] || "") : "");

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />
      <WsHeader title="Builder preparation.">
        Provide each builder or GC with the same project information and ask the same questions.
        This helps you obtain more accurate quotes and compare proposals more effectively.
      </WsHeader>

      <h2 className="font-display text-paper text-2xl mb-3">Before contacting a builder or GC</h2>
      <ul className="space-y-2.5 mb-10">
        {BEFORE.map((b, i) => (
          <li key={i} className="flex items-start gap-3 p-4 bg-surface-1-solid rounded-xl border border-stroke">
            <FiCheck className="shrink-0 mt-0.5 text-accent" />
            <span className="text-sm text-paper leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-display text-paper text-2xl mb-1">Information to provide each builder or GC</h2>
      <p className="text-paper-dim text-sm mb-4">Pre-filled from your project brief where available — edit anything that's changed.</p>
      <div className="space-y-3 mb-10">
        {PROVIDE.map((row) => (
          <div key={row.id} className="p-4 bg-surface-1-solid rounded-xl border border-stroke">
            <label htmlFor={`prov-${row.id}`} className="block text-sm text-paper leading-relaxed mb-2">{row.label}</label>
            <TextCell
              value={provideValue(row)}
              placeholder="Homeowner information / notes"
              onChange={(v) => set(`provide-${row.id}`, v)}
            />
          </div>
        ))}
      </div>

      <h2 className="font-display text-paper text-2xl mb-1">Type of quote requested</h2>
      <p className="text-paper-dim text-sm mb-4">
        Full ADU construction, or pre-site / site work only for a prefab or modular ADU. For a
        prefab or modular ADU, the GC may only be responsible for the pre-site and site-related
        work necessary to prepare the property.
      </p>
      <div className="p-4 bg-surface-1-solid rounded-xl border border-stroke mb-10">
        <TextCell value={d["quote-type"]} placeholder="e.g. Full construction / Pre-site only for modular" onChange={(v) => set("quote-type", v)} />
      </div>

      <h2 className="font-display text-paper text-2xl mb-1">Questions to ask each builder or GC</h2>
      <p className="text-paper-dim text-sm mb-4">Record each builder's response — written answers whenever possible.</p>
      <div className="space-y-3 mb-8">
        {QUESTIONS.map((q, i) => (
          <div key={i} className="p-4 bg-surface-1-solid rounded-xl border border-stroke">
            <label htmlFor={`bq-${i}`} className="block text-sm text-paper leading-relaxed mb-2">{q}</label>
            <TextCell value={d[`q-${i}`]} placeholder="Builder response / notes" onChange={(v) => set(`q-${i}`, v)} />
          </div>
        ))}
      </div>

      <div className="bg-accent/5 border-l-2 border-accent rounded-r-xl px-5 py-4 mb-4">
        <p className="text-accent text-xs font-semibold tracking-[0.16em] uppercase mb-1.5">Compare before you select</p>
        <p className="text-paper text-sm leading-relaxed">
          Give the same project information to each builder or GC and ask the same questions.
          Compare the total project cost, what is included, what is excluded, the proposed
          timeline, and the builder's experience — not simply the advertised or initial price.
        </p>
      </div>

      <Disclaimer />
    </div>
  );
};

export default BuilderPrep;
