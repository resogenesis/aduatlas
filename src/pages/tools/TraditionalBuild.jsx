import WorksheetBar from "../../components/tools/WorksheetBar";
import { Disclaimer, GroupRow, NumCell, TextCell, WsHeader } from "../../components/tools/worksheetUi";
import { money, num, usePersistedWorksheet } from "../../components/tools/worksheetKit";

// Worksheet 4 of 6 — Traditional Build Quote Comparison (from the ADUAtlas
// workbook). Three companies side by side, same categories, computed totals.

const COMPANIES = [0, 1, 2];

const GROUPS = [
  { label: "Plans & pre-construction", rows: ["Design / Plans", "Engineering", "Permits"] },
  { label: "Site & foundation", rows: ["Site Preparation", "Excavation / Grading", "Foundation"] },
  { label: "Construction", rows: ["Framing", "Roofing", "Windows / Exterior Doors", "Exterior Finish / Siding", "Plumbing", "Electrical", "HVAC", "Insulation / Drywall", "Interior Finishes", "Kitchen", "Bathroom(s)", "Appliances"] },
  { label: "Utility connections", rows: ["Water Connection", "Sewer Connection", "Electric Service / Connection", "Gas, if applicable"] },
  { label: "Site completion", rows: ["Landscaping / Site Restoration", "Other"] },
];

const ALL_ROWS = GROUPS.flatMap((g) => g.rows);

const TraditionalBuild = () => {
  const [d, set, savedAt] = usePersistedWorksheet("traditionalBuild");
  const totals = COMPANIES.map((c) => ALL_ROWS.reduce((s, r) => s + num(d[`${r}-${c}`]), 0));

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />
      <WsHeader title="Traditional build comparison.">
        Enter each company name at the top, then record the quoted cost or information for each
        category. Same categories for every company — so you compare the whole project, not the
        advertised price.
      </WsHeader>

      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
              <th className="px-4 py-4 text-left font-medium min-w-52">Cost / information</th>
              {COMPANIES.map((c) => (
                <th key={c} className="px-3 py-3 text-left font-medium min-w-36">
                  <TextCell placeholder={`Company ${c + 1}`} value={d[`company-${c}`]} onChange={(v) => set(`company-${c}`, v)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <GroupSection key={g.label} group={g} d={d} set={set} />
            ))}
            <tr className="bg-accent/10">
              <td className="px-4 py-4 font-display text-paper text-base">Estimated total project cost</td>
              {COMPANIES.map((c) => (
                <td key={c} className="px-3 py-4 text-right font-display text-accent text-base tabular-nums">{money(totals[c])}</td>
              ))}
            </tr>
            {["Start Date", "Estimated Completion", "Notes"].map((r) => (
              <tr key={r} className="border-t border-stroke/60">
                <td className="px-4 py-3 text-paper">{r}</td>
                {COMPANIES.map((c) => (
                  <td key={c} className="px-3 py-3"><TextCell value={d[`${r}-${c}`]} onChange={(v) => set(`${r}-${c}`, v)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Disclaimer />
    </div>
  );
};

const GroupSection = ({ group, d, set }) => (
  <>
    <GroupRow label={group.label} cols={4} />
    {group.rows.map((r) => (
      <tr key={r} className="border-b border-stroke/60">
        <td className="px-4 py-3 text-paper">{r}</td>
        {COMPANIES.map((c) => (
          <td key={c} className="px-3 py-3">
            <NumCell w="w-28" value={d[`${r}-${c}`]} onChange={(v) => set(`${r}-${c}`, v)} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export default TraditionalBuild;
