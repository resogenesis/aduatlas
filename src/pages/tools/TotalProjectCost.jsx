import WorksheetBar from "../../components/tools/WorksheetBar";
import { Disclaimer, GroupRow, NumCell, TextCell, WsHeader } from "../../components/tools/worksheetUi";
import { money, num, usePersistedWorksheet } from "../../components/tools/worksheetKit";

// Worksheet 5 of 6 — Total ADU Project Cost (from the ADUAtlas workbook).
// The final rollup: verified costs + the selected quote → a realistic
// estimated total. Estimated vs. final columns, timelines, notes.

const GROUPS = [
  { label: "ADU / construction", rows: ["Selected ADU / Base Unit OR Builder Construction Quote", "Options / Upgrades", "Assembly", "Delivery / Transportation", "Crane / Set, if applicable"] },
  { label: "Pre-site", rows: ["Obstacle Removal", "Excavation / Grading", "Foundation", "Water Connection", "Sewer Connection", "Electric Connection", "Gas, if applicable", "Retaining Wall", "Access / Site Restoration / Landscape"] },
  { label: "City / professional fees", rows: ["Permits / City Fees", "Design / Plans", "Survey / Plans", "Engineering", "Other Professional Fees"] },
  { label: "Other known costs", rows: ["Taxes", "Contingency or Change Orders"] },
];

const ALL_ROWS = GROUPS.flatMap((g) => g.rows);

const TotalProjectCost = () => {
  const [d, set, savedAt] = usePersistedWorksheet("totalProjectCost");
  const estTotal = ALL_ROWS.reduce((s, r) => s + num(d[`${r}-est`]), 0);
  const finalTotal = ALL_ROWS.reduce((s, r) => s + num(d[`${r}-final`]), 0);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />
      <WsHeader title="Total ADU project cost.">
        Use your verified costs and your selected builder or ADU company quote to create a
        realistic estimated total project cost. This is an estimate, not a final construction
        price.
      </WsHeader>

      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
              <th className="px-4 py-4 text-left font-medium min-w-56">Project cost summary</th>
              <th className="px-3 py-4 text-right font-medium">Estimated cost</th>
              <th className="px-3 py-4 text-right font-medium">Final cost</th>
              <th className="px-3 py-4 text-left font-medium">Timelines</th>
              <th className="px-3 py-4 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <Section key={g.label} group={g} d={d} set={set} />
            ))}
            <tr className="bg-accent/10">
              <td className="px-4 py-4 font-display text-paper text-base">Estimated total project cost</td>
              <td className="px-3 py-4 text-right font-display text-accent text-lg tabular-nums">{money(estTotal)}</td>
              <td className="px-3 py-4 text-right font-display text-accent text-lg tabular-nums">{finalTotal ? money(finalTotal) : "—"}</td>
              <td colSpan={2} />
            </tr>
            {["Selected Builder / Company", "Estimated Start Date", "Estimated Completion", "Notes"].map((r) => (
              <tr key={r} className="border-t border-stroke/60">
                <td className="px-4 py-3 text-paper">{r}</td>
                <td colSpan={4} className="px-3 py-3"><TextCell value={d[`meta-${r}`]} onChange={(v) => set(`meta-${r}`, v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Disclaimer />
    </div>
  );
};

const Section = ({ group, d, set }) => (
  <>
    <GroupRow label={group.label} cols={5} />
    {group.rows.map((r) => (
      <tr key={r} className="border-b border-stroke/60">
        <td className="px-4 py-3 text-paper">{r}</td>
        <td className="px-3 py-3"><NumCell w="w-28" value={d[`${r}-est`]} onChange={(v) => set(`${r}-est`, v)} /></td>
        <td className="px-3 py-3"><NumCell w="w-28" value={d[`${r}-final`]} onChange={(v) => set(`${r}-final`, v)} /></td>
        <td className="px-3 py-3 min-w-28"><TextCell value={d[`${r}-time`]} onChange={(v) => set(`${r}-time`, v)} /></td>
        <td className="px-3 py-3 min-w-32"><TextCell value={d[`${r}-notes`]} onChange={(v) => set(`${r}-notes`, v)} /></td>
      </tr>
    ))}
  </>
);

export default TotalProjectCost;
