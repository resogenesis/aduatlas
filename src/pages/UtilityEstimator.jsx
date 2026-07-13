import { useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";

// Editable line items for the site-prep + utility slice of an ADU budget —
// the costs a structural quote usually leaves out (see Course Ch.3). Rates are
// planning defaults, not quotes; the homeowner tunes rate and quantity to their
// property. Contingency is computed as a % of the subtotal so it always tracks.
const defaultRows = [
  { label: "Water line trenching", unit: "ft", rate: 30, qty: 50 },
  { label: "Sewer line trenching", unit: "ft", rate: 35, qty: 50 },
  { label: "Electrical service / panel upgrade", unit: "job", rate: 3500, qty: 1 },
  { label: "Foundation (slab)", unit: "sq ft", rate: 14, qty: 400 },
  { label: "Grading & drainage", unit: "job", rate: 2500, qty: 1 },
  { label: "Tree removal", unit: "tree", rate: 1200, qty: 0 },
  { label: "Utility connection fees", unit: "job", rate: 1800, qty: 1 },
  { label: "Permits & city fees", unit: "job", rate: 4500, qty: 1 },
  { label: "Design & engineering", unit: "job", rate: 8500, qty: 1 },
];

const CONTINGENCY_PCT = 10;
const money = (n) => `$${Math.round(n).toLocaleString()}`;

const UtilityEstimator = () => {
  const [rows, setRows] = useState(defaultRows);

  const update = (idx, field, val) =>
    setRows((arr) => arr.map((r, i) => (i === idx ? { ...r, [field]: Number(val) || 0 } : r)));

  const { subtotal, contingency, total } = useMemo(() => {
    const sub = rows.reduce((sum, r) => sum + r.rate * r.qty, 0);
    const cont = (sub * CONTINGENCY_PCT) / 100;
    return { subtotal: sub, contingency: cont, total: sub + cont };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Utility & Site-Prep Estimator"
        subtitle="Ballpark the costs a structural quote leaves out. Adjust each rate and quantity to your property — the total updates live."
      />

      <section className="container mx-auto px-5 sm:px-8 py-12 sm:py-16 max-w-3xl">
        <div className="overflow-x-auto bg-surface-1-solid rounded-2xl border border-stroke">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-paper-dim text-xs uppercase tracking-[0.15em] border-b border-stroke">
                <th className="px-4 py-4 text-left font-medium">Line item</th>
                <th className="px-4 py-4 text-right font-medium">Rate</th>
                <th className="px-4 py-4 text-right font-medium">Qty</th>
                <th className="px-4 py-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className="border-b border-stroke/60">
                  <td className="px-4 py-3 text-paper">{r.label}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-paper-dim">$</span>
                      <input
                        type="number"
                        min="0"
                        value={r.rate}
                        onChange={(e) => update(i, "rate", e.target.value)}
                        className="w-20 px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm text-right focus:outline-none focus:border-accent transition"
                      />
                      <span className="text-paper-dim text-xs w-10 text-left">/{r.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      value={r.qty}
                      onChange={(e) => update(i, "qty", e.target.value)}
                      className="w-16 px-2 py-1 rounded-lg bg-canvas border border-stroke text-paper text-sm text-right focus:outline-none focus:border-accent transition"
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-paper tabular-nums">
                    {money(r.rate * r.qty)}
                  </td>
                </tr>
              ))}

              <tr className="border-b border-stroke/60">
                <td className="px-4 py-3 text-paper-dim" colSpan="3">Subtotal</td>
                <td className="px-4 py-3 text-right text-paper tabular-nums">{money(subtotal)}</td>
              </tr>
              <tr className="border-b border-stroke/60">
                <td className="px-4 py-3 text-paper-dim" colSpan="3">
                  Contingency ({CONTINGENCY_PCT}%)
                </td>
                <td className="px-4 py-3 text-right text-paper-dim tabular-nums">{money(contingency)}</td>
              </tr>
              <tr className="bg-accent/10">
                <td className="px-4 py-4 font-display text-paper text-base" colSpan="3">
                  Estimated site-prep total
                </td>
                <td className="px-4 py-4 text-right font-display text-accent text-lg tabular-nums">
                  {money(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-paper-dim text-xs leading-relaxed mt-5">
          Planning estimate only, not a quote. This is the site-prep and utility slice that sits
          <em> on top of</em> a builder's structural price — the gap that surprises most homeowners.
          Add it to your structural cost for a realistic all-in budget.
        </p>
      </section>
    </div>
  );
};

export default UtilityEstimator;
