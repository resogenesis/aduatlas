import { useState } from "react";
import WorksheetBar from "../../components/tools/WorksheetBar";
import { Disclaimer, NumCell, TextCell, WsHeader } from "../../components/tools/worksheetUi";
import { money, num, usePersistedWorksheet } from "../../components/tools/worksheetKit";

// Worksheet 6 of 6 — Modular / Prefab Estimate & Quote Comparison (from the
// ADUAtlas workbook). Compare the complete installed project cost, identify
// missing work, and verify who is responsible for every part of the project.

const GCS = [0, 1, 2];

const S1_PROPERTY = [
  { id: "address", label: "Property address" },
  { id: "city-state", label: "City and state" },
  { id: "size", label: "Proposed ADU size", hint: "Square feet" },
  { id: "modules", label: "Number of modules" },
  { id: "foundation-type", label: "Foundation type" },
  { id: "water-dist", label: "Water distance", hint: "Approximate distance to connection" },
  { id: "sewer-dist", label: "Sewer distance", hint: "Approximate distance and depth" },
  { id: "electric-dist", label: "Electrical distance", hint: "Approximate distance to service" },
  { id: "gas-dist", label: "Gas distance", hint: "If applicable" },
  { id: "access-width", label: "Delivery access width" },
  { id: "gate", label: "Gate opening" },
  { id: "overhead", label: "Overhead wires or trees" },
  { id: "crane-access", label: "Crane access" },
  { id: "street-closure", label: "Street closure required?" },
  { id: "slope", label: "Site slope" },
  { id: "hoa", label: "HOA or historic-district restrictions" },
];

const S2_MANUFACTURER = [
  { id: "mfg", label: "Manufacturer" },
  { id: "model", label: "Model" },
  { id: "base-price", label: "Base advertised price" },
  { id: "sqft", label: "Square footage" },
  { id: "mod-count", label: "Number of modules" },
  { id: "constr-type", label: "Construction type", hint: "Modular, panelized, prefab, kit, or manufactured" },
  { id: "code", label: "Building code used" },
  { id: "state-approval", label: "State approval status" },
  { id: "dest-approved", label: "Approved for destination city and state?" },
  { id: "warranty", label: "Manufacturer warranty" },
  { id: "production-time", label: "Estimated production time" },
  { id: "delivery-date", label: "Estimated delivery date" },
];

const S3_DOCUMENTS = [
  "Floor plans", "Building elevations", "Structural plans", "Engineering documents",
  "Foundation requirements", "Installation instructions", "State modular approval or insignia information",
  "Third-party inspection documentation", "Applicable building-code information", "Energy-code documentation",
  "Wind-load certification", "Snow-load certification", "Seismic design information", "Fire-rating information",
  "Electrical plans", "Plumbing plans", "Mechanical plans", "Product specifications",
  "Manufacturer license or registration", "Installer requirements", "Written warranty",
  "Complete list of factory-price exclusions",
];

const S4_CITY = [
  "Is this construction type permitted as an ADU?",
  "Will the city accept the state-approved plans?",
  "What additional local plans are required?",
  "Separate foundation engineering required?",
  "Site plan required?",
  "Utility plans required?",
  "Crane permit required?",
  "Street-use or closure permit required?",
  "Special fire-access requirements?",
  "Who inspects the factory-built portion?",
  "Who inspects site-built work?",
  "Documents required before permit submission",
  "Documents required before installation",
  "Required inspections",
  "Certificate of occupancy required?",
];

const S5_MFG_PRICE = [
  "Base unit", "Design modifications", "Engineering", "State approvals", "Appliances",
  "Cabinets and countertops", "Plumbing fixtures", "HVAC", "Electrical fixtures",
  "Interior finishes", "Exterior finishes", "Taxes", "Delivery", "Transportation permits",
  "Escort vehicles", "Storage", "Crane", "Module set", "Module connection",
  "Weatherproofing", "Manufacturer installation supervision", "Warranty", "Other",
];

const S6_GC_FIELDS = [
  "Company", "Contact", "Phone", "Email", "License number", "Insurance verified?",
  "Service area", "Experience with this manufacturer", "Number of this manufacturer's projects completed",
  "References", "Work performed directly", "Work subcontracted",
];

const S7_GC_QUOTE = [
  "Permits and city fees", "Survey and site plan", "Engineering", "Excavation and grading",
  "Foundation", "Water connection", "Sewer connection", "Electrical connection", "Gas connection",
  "Trenching", "Driveway or access preparation", "Tree removal", "Retaining walls",
  "Delivery coordination", "Transportation permits", "Street closure", "Traffic control",
  "Crane", "Module set", "Module fastening and connections", "Roof connection",
  "Exterior seam completion", "Interior seam completion", "Plumbing connections",
  "Electrical connections", "HVAC connections", "Stairs, porches, decks, and railings",
  "Skirting or foundation finish", "Gutters and drainage", "Site-built finish work",
  "Inspections", "Cleanup", "Landscaping restoration", "Project management", "Contingency",
];

const S7_META = ["Major exclusions", "Estimated timeline", "Payment schedule", "Contractor warranty", "Quote expiration date"];

const S8_RESPONSIBILITY = [
  "Factory documents and approvals", "Local permit submission", "Site plan", "Foundation engineering",
  "Site preparation", "Foundation", "Utility-company coordination", "Utility connections",
  "Transportation and delivery", "Crane and module set", "Module connections", "Weatherproofing",
  "Site-built finish work", "Inspections", "Certificate of occupancy", "Final cleanup and restoration",
];

const PARTIES = ["", "Manufacturer", "GC", "Homeowner", "City", "Utility company"];

const S9_EXTRA = [
  { id: "city-fees", label: "City and professional fees", hint: "Add costs not included above" },
  { id: "utility-fees", label: "Utility-company charges", hint: "Add direct utility-company fees not included above" },
  { id: "contingency", label: "Additional contingency", hint: "Add only if not already included in the contractor quote" },
];

const S9_SUMMARY = ["Estimated completion time", "Major exclusions or missing costs", "Warranty coverage", "Homeowner questions", "Additional verification needed"];

const SectionCard = ({ n, title, blurb, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface-1-solid border border-stroke rounded-2xl mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-4 p-5 text-left hover:bg-canvas/40 transition-colors print:hidden"
        aria-expanded={open}
      >
        <span className="shrink-0 w-8 h-8 rounded-full bg-canvas border border-stroke flex items-center justify-center font-display text-accent text-sm">{n}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-display text-paper text-lg leading-snug">{title}</span>
          {blurb && <span className="block text-paper-dim text-xs mt-0.5">{blurb}</span>}
        </span>
        <span className="text-paper-dim text-sm self-center">{open ? "−" : "+"}</span>
      </button>
      {/* Print shows everything; screen honors the toggle */}
      <div className={`${open ? "block" : "hidden"} print:block px-5 pb-5`}>
        <p className="hidden print:block font-display text-paper text-lg mb-3">{n}. {title}</p>
        {children}
      </div>
    </div>
  );
};

const FieldRows = ({ rows, d, set, prefix, placeholder = "Value / notes" }) => (
  <div className="space-y-2">
    {rows.map((row) => {
      const r = typeof row === "string" ? { id: row, label: row } : row;
      return (
        <div key={r.id} className="grid sm:grid-cols-[minmax(12rem,1.2fr)_2fr] gap-2 sm:items-center p-3 bg-canvas/50 rounded-xl border border-stroke/60">
          <div>
            <p className="text-sm text-paper leading-snug">{r.label}</p>
            {r.hint && <p className="text-paper-dim/70 text-xs mt-0.5">{r.hint}</p>}
          </div>
          <TextCell value={d[`${prefix}-${r.id}`]} placeholder={placeholder} onChange={(v) => set(`${prefix}-${r.id}`, v)} />
        </div>
      );
    })}
  </div>
);

const ModularPrefabEstimate = () => {
  const [d, set, savedAt] = usePersistedWorksheet("modularPrefab");

  const mfgTotal = S5_MFG_PRICE.reduce((s, r) => s + num(d[`s5-${r}`]), 0);
  const gcTotals = GCS.map((g) => S7_GC_QUOTE.reduce((s, r) => s + num(d[`s7-${r}-${g}`]), 0));
  const extras = S9_EXTRA.reduce((s, r) => s + num(d[`s9-${r.id}`]), 0);
  const completeTotals = GCS.map((g) => mfgTotal + gcTotals[g] + extras);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />
      <WsHeader title="Modular / prefab estimate.">
        Compare the complete installed project cost, identify missing work, and verify who is
        responsible for every part of the project — manufacturer, GC, you, the city, or the
        utility company.
      </WsHeader>

      <SectionCard n="1" title="Homeowner and property information" defaultOpen>
        <FieldRows rows={S1_PROPERTY} d={d} set={set} prefix="s1" />
      </SectionCard>

      <SectionCard n="2" title="Manufacturer and ADU information">
        <FieldRows rows={S2_MANUFACTURER} d={d} set={set} prefix="s2" />
      </SectionCard>

      <SectionCard n="3" title="Documents and certifications to request from the manufacturer">
        <div className="space-y-2">
          {S3_DOCUMENTS.map((doc) => (
            <label key={doc} className="flex items-center gap-3 p-3 bg-canvas/50 rounded-xl border border-stroke/60 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(d[`s3-${doc}`])}
                onChange={(e) => set(`s3-${doc}`, e.target.checked)}
                className="accent-[#C6F24E]"
              />
              <span className="text-sm text-paper leading-snug">{doc}</span>
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard n="4" title="City approval verification" blurb="Ask your building department — answers vary by municipality.">
        <FieldRows rows={S4_CITY} d={d} set={set} prefix="s4" placeholder="City's answer" />
      </SectionCard>

      <SectionCard n="5" title="Manufacturer price and inclusions">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {S5_MFG_PRICE.map((r) => (
                <tr key={r} className="border-b border-stroke/40">
                  <td className="px-2 py-2 text-paper">{r}</td>
                  <td className="px-2 py-2 w-36"><NumCell value={d[`s5-${r}`]} onChange={(v) => set(`s5-${r}`, v)} /></td>
                </tr>
              ))}
              <tr className="bg-accent/10">
                <td className="px-2 py-3 font-display text-paper">Total manufacturer cost</td>
                <td className="px-2 py-3 text-right font-display text-accent tabular-nums">{money(mfgTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard n="6" title="General contractor referrals" blurb="Request three licensed GCs from the manufacturer who have installed their homes in your area.">
        <p className="text-paper-dim text-xs leading-relaxed mb-4 italic">
          "Please provide contact information for three licensed general contractors who have
          previously installed your homes in my state or service area and can provide a complete,
          itemized quote for delivery coordination, pre-site work, foundation, crane and set,
          module connection, utility connections, site-built finish work, inspections, and project
          completion."
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
                <th className="px-2 py-3 text-left font-medium min-w-40" />
                {GCS.map((g) => <th key={g} className="px-2 py-3 text-left font-medium">GC {g + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {S6_GC_FIELDS.map((f) => (
                <tr key={f} className="border-b border-stroke/40">
                  <td className="px-2 py-2 text-paper">{f}</td>
                  {GCS.map((g) => (
                    <td key={g} className="px-2 py-2 min-w-32"><TextCell value={d[`s6-${f}-${g}`]} onChange={(v) => set(`s6-${f}-${g}`, v)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard n="7" title="General contractor quote comparison">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
                <th className="px-2 py-3 text-left font-medium min-w-48" />
                {GCS.map((g) => (
                  <th key={g} className="px-2 py-3 text-right font-medium">{d[`s6-Company-${g}`] || `GC ${g + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {S7_GC_QUOTE.map((r) => (
                <tr key={r} className="border-b border-stroke/40">
                  <td className="px-2 py-2 text-paper">{r}</td>
                  {GCS.map((g) => (
                    <td key={g} className="px-2 py-2"><NumCell w="w-24" value={d[`s7-${r}-${g}`]} onChange={(v) => set(`s7-${r}-${g}`, v)} /></td>
                  ))}
                </tr>
              ))}
              <tr className="bg-accent/10">
                <td className="px-2 py-3 font-display text-paper">Total contractor quote</td>
                {GCS.map((g) => (
                  <td key={g} className="px-2 py-3 text-right font-display text-accent tabular-nums">{money(gcTotals[g])}</td>
                ))}
              </tr>
              {S7_META.map((r) => (
                <tr key={r} className="border-b border-stroke/40">
                  <td className="px-2 py-2 text-paper">{r}</td>
                  {GCS.map((g) => (
                    <td key={g} className="px-2 py-2"><TextCell value={d[`s7m-${r}-${g}`]} onChange={(v) => set(`s7m-${r}-${g}`, v)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard n="8" title="Responsibility verification" blurb="Identify the responsible party for every part of the project — in writing.">
        <div className="space-y-2">
          {S8_RESPONSIBILITY.map((r) => (
            <div key={r} className="grid sm:grid-cols-[1.4fr_10rem_1fr] gap-2 sm:items-center p-3 bg-canvas/50 rounded-xl border border-stroke/60">
              <p className="text-sm text-paper leading-snug">{r}</p>
              <select
                value={d[`s8-${r}`] || ""}
                onChange={(e) => set(`s8-${r}`, e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-canvas border border-stroke text-paper text-sm focus:outline-none focus:border-accent transition"
              >
                {PARTIES.map((p) => <option key={p} value={p}>{p || "Responsible party…"}</option>)}
              </select>
              <TextCell value={d[`s8-${r}-notes`]} placeholder="Notes" onChange={(v) => set(`s8-${r}-notes`, v)} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard n="9" title="Complete project cost comparison" defaultOpen>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
                <th className="px-2 py-3 text-left font-medium min-w-48" />
                {GCS.map((g) => (
                  <th key={g} className="px-2 py-3 text-right font-medium">{d[`s6-Company-${g}`] || `GC ${g + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stroke/40">
                <td className="px-2 py-2 text-paper">Manufacturer total <span className="text-paper-dim/70 text-xs">(from section 5)</span></td>
                {GCS.map((g) => <td key={g} className="px-2 py-2 text-right text-paper tabular-nums">{money(mfgTotal)}</td>)}
              </tr>
              <tr className="border-b border-stroke/40">
                <td className="px-2 py-2 text-paper">Contractor total <span className="text-paper-dim/70 text-xs">(from section 7)</span></td>
                {GCS.map((g) => <td key={g} className="px-2 py-2 text-right text-paper tabular-nums">{money(gcTotals[g])}</td>)}
              </tr>
              {S9_EXTRA.map((r) => (
                <tr key={r.id} className="border-b border-stroke/40">
                  <td className="px-2 py-2">
                    <span className="text-paper">{r.label}</span>
                    <span className="block text-paper-dim/70 text-xs">{r.hint}</span>
                  </td>
                  <td colSpan={3} className="px-2 py-2"><NumCell w="w-32" value={d[`s9-${r.id}`]} onChange={(v) => set(`s9-${r.id}`, v)} /></td>
                </tr>
              ))}
              <tr className="bg-accent/10">
                <td className="px-2 py-3 font-display text-paper">Estimated complete modular ADU cost</td>
                {GCS.map((g) => (
                  <td key={g} className="px-2 py-3 text-right font-display text-accent tabular-nums">{money(completeTotals[g])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <FieldRows rows={S9_SUMMARY} d={d} set={set} prefix="s9m" />
      </SectionCard>

      <Disclaimer />
    </div>
  );
};

export default ModularPrefabEstimate;
