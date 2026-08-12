import WorksheetBar from "../../components/tools/WorksheetBar";
import { Disclaimer, NumCell, TextCell, WsHeader } from "../../components/tools/worksheetUi";
import { money, num, usePersistedWorksheet } from "../../components/tools/worksheetKit";

// Worksheet 2 of 6 — Pre-Site Verification Checklist (from the ADUAtlas
// workbook). A few measurements and phone calls that turn the Feasibility
// Study into a realistic, verified pre-site estimate.

const STEPS = [
  { n: "1", item: "Have a utility professional mark the utility connection locations on the property.", who: "Utility professional / locator", record: "Date marked; water distance; sewer distance; electric distance; gas distance, if applicable" },
  { n: "2", item: "Confirm utility connection charges.", who: "Utility companies", record: "Connection / tap / meter charges for each applicable utility" },
  { n: "3", item: "Request sewer and water connection estimates from 2–3 plumbers.", who: "Licensed plumbers", record: "Give them the measured distance. Record estimated connection cost and required depth." },
  { n: "4", item: "Ask about utility and plumbing timelines.", who: "Utility companies and plumbers", record: "Estimated lead time, scheduling time, and expected duration" },
  { n: "5", item: "Verify ADU permit and city fees.", who: "City website / building department", record: "ADU permit fees and other known city charges" },
  { n: "6", item: "Verify the city review and permit timeline.", who: "City building / planning department", record: "Estimated review time and permit issuance timeline" },
  { n: "7", item: "Record your realistic pre-site estimate.", who: "Homeowner", record: "Utility costs + plumbing connection estimates + city / permit fees + other known pre-site costs" },
  { n: "8", item: "Use the completed information when speaking with builders.", who: "Builders / contractors", record: "Share verified distances, known fees, estimated pre-site costs, and timelines" },
];

const SUMMARY = [
  { key: "water-sewer", label: "Water / sewer connection estimate" },
  { key: "electric", label: "Electric connection estimate" },
  { key: "gas", label: "Gas connection estimate" },
  { key: "city-fees", label: "City / permit fees" },
  { key: "other", label: "Other known pre-site costs" },
];

const PreSiteVerification = () => {
  const [d, set, savedAt] = usePersistedWorksheet("preSiteVerification");
  const total = SUMMARY.reduce((s, r) => s + num(d[`sum-${r.key}`]), 0);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />
      <WsHeader title="Pre-site verification.">
        Use this checklist after your Feasibility Study is delivered. A few measurements and phone
        calls can turn it into a realistic pre-site estimate before speaking with your city and
        builders. This is an estimate, not a final construction quote.
      </WsHeader>

      <div className="space-y-3 mb-12">
        {STEPS.map((s) => (
          <div key={s.n} className="bg-surface-1-solid rounded-2xl border border-stroke p-5">
            <div className="flex items-start gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-canvas border border-stroke flex items-center justify-center font-display text-accent text-sm">
                {s.n}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-paper text-sm font-medium leading-relaxed">{s.item}</p>
                <p className="text-paper-dim text-xs mt-1">
                  <span className="text-paper-dim/70 uppercase tracking-wider text-[0.65rem]">Contact:</span> {s.who}
                </p>
                <p className="text-paper-dim text-xs mt-0.5">
                  <span className="text-paper-dim/70 uppercase tracking-wider text-[0.65rem]">Record:</span> {s.record}
                </p>
                <div className="grid sm:grid-cols-[10rem_1fr] gap-3 mt-3">
                  <TextCell placeholder="Date completed" value={d[`step${s.n}-date`]} onChange={(v) => set(`step${s.n}-date`, v)} />
                  <TextCell placeholder="Notes / what you recorded" value={d[`step${s.n}-notes`]} onChange={(v) => set(`step${s.n}-notes`, v)} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-display text-paper text-2xl mb-3">Pre-site estimate summary</h2>
      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-6">
        <table className="w-full text-sm">
          <tbody>
            {SUMMARY.map((r) => (
              <tr key={r.key} className="border-b border-stroke/60">
                <td className="px-4 py-3 text-paper min-w-56">{r.label}</td>
                <td className="px-3 py-3 w-36"><NumCell value={d[`sum-${r.key}`]} onChange={(v) => set(`sum-${r.key}`, v)} /></td>
                <td className="px-3 py-3 min-w-48"><TextCell placeholder="Contact info / details" value={d[`sum-${r.key}-notes`]} onChange={(v) => set(`sum-${r.key}-notes`, v)} /></td>
              </tr>
            ))}
            <tr className="bg-accent/10">
              <td className="px-4 py-4 font-display text-paper text-base">Estimated pre-site total</td>
              <td className="px-3 py-4 text-right font-display text-accent text-lg tabular-nums" colSpan={2}>{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Disclaimer />
    </div>
  );
};

export default PreSiteVerification;
