import { useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import WorksheetBar from "../../components/tools/WorksheetBar";
import { loadPacket } from "../../stores/courseStore";
import { loadWorksheet, saveWorksheet } from "../../stores/worksheetStore";

// Pre-Site Budget Worksheet — the "dynamic spreadsheet" deliverable of the
// $399 Feasibility Report. Line items come from Module 5's preliminary-budget
// list ("A complete budget covers far more than the ADU itself"); the
// homeowner enters low/high estimates for THEIR property — we never supply
// jurisdiction-specific dollar figures, because they vary by municipality.

const DEFAULT_ROWS = [
  { label: "ADU structure", hint: "The unit itself — site-built, prefab, kit, or other method" },
  { label: "Foundation", hint: "Slab, pier, or crawlspace — one of the first major costs" },
  { label: "Utility connections", hint: "Water, sewer/septic, electric — distance drives cost" },
  { label: "Site preparation", hint: "Clearing, grading, drainage, access work" },
  { label: "Survey (if required)", hint: "Many cities require one before permitting — ask yours" },
  { label: "Engineering", hint: "Structural, and geotechnical if slope or soils trigger it" },
  { label: "Permits and inspections", hint: "Fees vary by municipality — get your city's schedule" },
  { label: "Builder / general contractor", hint: "Labor and management if not included above" },
  { label: "Delivery and setup", hint: "Crane, transport, and placement for factory-built units" },
];

// Module 7's budget killers, reframed as site considerations to check before
// trusting the totals above.
const SITE_CONSIDERATIONS = [
  "Long utility extensions, or a service-capacity upgrade to support a second dwelling",
  "Significant excavation, grading, or earthwork on a difficult site",
  "Retaining walls or drainage systems required by the terrain or local review",
  "Tree removal, rock, or unexpected subsurface conditions",
  "Engineering, geotechnical, or special studies triggered by slope or soils",
  "Local fees, connection charges, and permit-related costs — these vary by municipality",
];

const CONTINGENCY_PCT = 10;
const money = (n) => `$${Math.round(n).toLocaleString()}`;

const emptyRow = (label = "", hint = "") => ({ label, hint, low: 0, high: 0 });

const BudgetWorksheet = () => {
  const [rows, setRows] = useState(() => {
    const saved = loadWorksheet("budget");
    return saved?.rows?.length ? saved.rows : DEFAULT_ROWS.map((r) => emptyRow(r.label, r.hint));
  });
  const [considerations, setConsiderations] = useState(() => loadWorksheet("budget")?.considerations || {});
  const [savedAt, setSavedAt] = useState(null);
  const packet = useMemo(() => loadPacket(), []);

  // Debounced autosave — the worksheet is a living document, not a form.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      saveWorksheet("budget", { rows, considerations });
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [rows, considerations]);

  const update = (idx, field, val) =>
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, [field]: field === "label" ? val : Number(val) || 0 } : r)));
  const addRow = () => setRows((arr) => [...arr, emptyRow()]);
  const removeRow = (idx) => setRows((arr) => arr.filter((_, i) => i !== idx));

  const totals = useMemo(() => {
    const low = rows.reduce((s, r) => s + (r.low || 0), 0);
    const high = rows.reduce((s, r) => s + (r.high || 0), 0);
    return {
      low, high,
      lowAll: low * (1 + CONTINGENCY_PCT / 100),
      highAll: high * (1 + CONTINGENCY_PCT / 100),
    };
  }, [rows]);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto print-sheet">
      <WorksheetBar savedAt={savedAt} />

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Feasibility Report · Worksheet
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-4">
        Pre-site budget.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-4">
        A realistic budget includes more than the cost of the ADU itself. Enter a low and high
        estimate for each line as you learn your property — the totals update live.
      </p>
      {packet.budget && (
        <p className="text-paper-dim text-sm mb-8">
          Your stated budget range (from My Property): <span className="text-paper font-medium">{packet.budget}</span>
        </p>
      )}

      {/* Budget table */}
      <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper-dim text-xs uppercase tracking-[0.15em] border-b border-stroke">
              <th className="px-4 py-4 text-left font-medium">Line item</th>
              <th className="px-4 py-4 text-right font-medium">Low</th>
              <th className="px-4 py-4 text-right font-medium">High</th>
              <th className="px-2 py-4 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-stroke/60 align-top">
                <td className="px-4 py-3">
                  {i < DEFAULT_ROWS.length ? (
                    <>
                      <span className="text-paper">{r.label}</span>
                      {r.hint && <p className="text-paper-dim/70 text-xs mt-0.5">{r.hint}</p>}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={r.label}
                      placeholder="Custom line item"
                      onChange={(e) => update(i, "label", e.target.value)}
                      className="w-full px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
                    />
                  )}
                </td>
                {["low", "high"].map((f) => (
                  <td key={f} className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-paper-dim">$</span>
                      <input
                        type="number"
                        min="0"
                        value={r[f] || ""}
                        placeholder="0"
                        onChange={(e) => update(i, f, e.target.value)}
                        className="w-24 px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm text-right focus:outline-none focus:border-accent transition"
                      />
                    </div>
                  </td>
                ))}
                <td className="px-2 py-3 text-right print:hidden">
                  {i >= DEFAULT_ROWS.length && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label={`Remove ${r.label || "custom row"}`}
                      className="p-1.5 text-paper-dim/60 hover:text-red-400 transition-colors"
                    >
                      <FiTrash2 />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            <tr className="border-b border-stroke/60">
              <td className="px-4 py-3 text-paper-dim">Subtotal</td>
              <td className="px-4 py-3 text-right text-paper tabular-nums">{money(totals.low)}</td>
              <td className="px-4 py-3 text-right text-paper tabular-nums">{money(totals.high)}</td>
              <td className="print:hidden" />
            </tr>
            <tr className="border-b border-stroke/60">
              <td className="px-4 py-3 text-paper-dim">Contingency ({CONTINGENCY_PCT}%)</td>
              <td className="px-4 py-3 text-right text-paper-dim tabular-nums">{money(totals.low * CONTINGENCY_PCT / 100)}</td>
              <td className="px-4 py-3 text-right text-paper-dim tabular-nums">{money(totals.high * CONTINGENCY_PCT / 100)}</td>
              <td className="print:hidden" />
            </tr>
            <tr className="bg-accent/10">
              <td className="px-4 py-4 font-display text-paper text-base">Estimated total range</td>
              <td className="px-4 py-4 text-right font-display text-accent text-lg tabular-nums">{money(totals.lowAll)}</td>
              <td className="px-4 py-4 text-right font-display text-accent text-lg tabular-nums">{money(totals.highAll)}</td>
              <td className="print:hidden" />
            </tr>
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-xs font-medium mb-10 print:hidden"
      >
        <FiPlus /> Add line item
      </button>

      {/* Site considerations (Module 7 budget killers) */}
      <h2 className="font-display text-paper text-2xl sm:text-3xl mb-2">Site considerations</h2>
      <p className="text-paper-dim text-sm max-w-2xl mb-6">
        These costs rarely show up as a line you planned for — they show up as the sum of the
        surprises. Mark any that could apply to your property, and reflect them in the ranges above.
      </p>
      <div className="space-y-3 mb-10">
        {SITE_CONSIDERATIONS.map((c, i) => (
          <label
            key={i}
            className="flex items-start gap-3 p-4 bg-surface-1-solid rounded-xl border border-stroke cursor-pointer"
          >
            <input
              type="checkbox"
              checked={Boolean(considerations[i])}
              onChange={(e) => setConsiderations((s) => ({ ...s, [i]: e.target.checked }))}
              className="mt-0.5 accent-[#C6F24E]"
            />
            <span className="text-sm text-paper leading-relaxed">{c}</span>
          </label>
        ))}
      </div>

      <p className="text-paper-dim text-xs leading-relaxed">
        Planning worksheet, not a quote. Actual figures depend on your property and your
        municipality — confirm fees and requirements with your local planning department, and
        replace estimates with real bids as they arrive.
      </p>
    </div>
  );
};

export default BudgetWorksheet;
