import WorksheetBar from "../../components/tools/WorksheetBar";
import { Disclaimer, NumCell, TextCell, WsHeader } from "../../components/tools/worksheetUi";
import { money, usePersistedWorksheet } from "../../components/tools/worksheetKit";

// Worksheet 1 of 6 — Pre-site Estimate (from the ADUAtlas workbook).
// Utilities: estimated cost = distance × cost/LF + permit fee + connection
// fee. Site items: qty × cost/unit + permit fee + connection fee + other.

import {
  PRESITE_ITEMS as ITEMS,
  PRESITE_UTILITIES as UTILITIES,
  presiteItemCost as itemCost,
  presiteTotal,
  presiteUtilCost as utilCost,
} from "./worksheetDefs";

const PreSiteEstimate = () => {
  const [d, set, savedAt] = usePersistedWorksheet("preSiteEstimate");
  const total = presiteTotal(d);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />
      <WsHeader title="Pre-site estimate.">
        Estimate the utility and pre-site expenses for your property. Measure or verify each
        distance, record the fees your utility companies and city quote you, and the totals update
        live.
      </WsHeader>

      <h2 className="font-display text-paper text-2xl mb-3">Utilities</h2>
      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
              <th className="px-4 py-4 text-left font-medium">Utility</th>
              <th className="px-3 py-4 text-right font-medium">Distance (LF)</th>
              <th className="px-3 py-4 text-right font-medium">Depth (ft)</th>
              <th className="px-3 py-4 text-right font-medium">Permit fee</th>
              <th className="px-3 py-4 text-right font-medium">Connection fee</th>
              <th className="px-3 py-4 text-right font-medium">Cost per LF</th>
              <th className="px-3 py-4 text-right font-medium">Est. cost</th>
              <th className="px-3 py-4 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {UTILITIES.map((u) => (
              <tr key={u} className="border-b border-stroke/60">
                <td className="px-4 py-3 text-paper">{u}</td>
                <td className="px-3 py-3"><NumCell prefix="" w="w-20" value={d[`${u}-dist`]} onChange={(v) => set(`${u}-dist`, v)} /></td>
                <td className="px-3 py-3"><NumCell prefix="" w="w-16" value={d[`${u}-depth`]} onChange={(v) => set(`${u}-depth`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${u}-permit`]} onChange={(v) => set(`${u}-permit`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${u}-conn`]} onChange={(v) => set(`${u}-conn`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${u}-lf`]} onChange={(v) => set(`${u}-lf`, v)} /></td>
                <td className="px-3 py-3 text-right text-paper tabular-nums">{money(utilCost(d, u))}</td>
                <td className="px-3 py-3 min-w-36"><TextCell value={d[`${u}-notes`]} onChange={(v) => set(`${u}-notes`, v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display text-paper text-2xl mb-3">Pre-site items</h2>
      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper-dim text-xs uppercase tracking-[0.12em] border-b border-stroke">
              <th className="px-4 py-4 text-left font-medium">Item</th>
              <th className="px-3 py-4 text-right font-medium">Quantity</th>
              <th className="px-3 py-4 text-left font-medium">Unit</th>
              <th className="px-3 py-4 text-right font-medium">Permit fee</th>
              <th className="px-3 py-4 text-right font-medium">Connection fee</th>
              <th className="px-3 py-4 text-right font-medium">Cost per unit</th>
              <th className="px-3 py-4 text-right font-medium">Other cost</th>
              <th className="px-3 py-4 text-right font-medium">Est. cost</th>
              <th className="px-3 py-4 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map((it) => (
              <tr key={it} className="border-b border-stroke/60">
                <td className="px-4 py-3 text-paper whitespace-nowrap">{it}</td>
                <td className="px-3 py-3"><NumCell prefix="" w="w-16" value={d[`${it}-qty`]} onChange={(v) => set(`${it}-qty`, v)} /></td>
                <td className="px-3 py-3"><TextCell w="w-20" placeholder="sq ft / job" value={d[`${it}-unit`]} onChange={(v) => set(`${it}-unit`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${it}-permit`]} onChange={(v) => set(`${it}-permit`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${it}-conn`]} onChange={(v) => set(`${it}-conn`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${it}-unit-cost`]} onChange={(v) => set(`${it}-unit-cost`, v)} /></td>
                <td className="px-3 py-3"><NumCell w="w-20" value={d[`${it}-other`]} onChange={(v) => set(`${it}-other`, v)} /></td>
                <td className="px-3 py-3 text-right text-paper tabular-nums">{money(itemCost(d, it))}</td>
                <td className="px-3 py-3 min-w-36"><TextCell value={d[`${it}-notes`]} onChange={(v) => set(`${it}-notes`, v)} /></td>
              </tr>
            ))}
            <tr className="bg-accent/10">
              <td colSpan={7} className="px-4 py-4 font-display text-paper text-base">Pre-site estimated total</td>
              <td className="px-3 py-4 text-right font-display text-accent text-lg tabular-nums">{money(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <Disclaimer />
    </div>
  );
};

export default PreSiteEstimate;
