import { useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";

const baseItems = [
  { category: "Water Line Distance (ft)", base: 1500, qty: 50 },
  { category: "Sewer Line Distance (ft)", base: 1200, qty: 50 },
  { category: "Electric Panel Work Up", base: 750, qty: 1 },
  { category: "Concrete Slab Area (sqft)", base: 9, qty: 400 },
  { category: "Landscaping / Misc", base: 250, qty: 1 },
  { category: "Electric Panel Upgrade Needed", base: 3500, qty: 1 },
  { category: "Tree Removal Required", base: 800, qty: 2 },
  { category: "Site ADU Subs Cost", base: 120, qty: 1 },
  { category: "Foundation Engineering", base: 0, qty: 0, note: "Included" },
  { category: "Utility Connection Jobs", base: 0, qty: 0, note: "Included" },
  { category: "Permits & Fees", base: 0, qty: 0, note: "Included" },
  { category: "Design Engineering", base: 0, qty: 0, note: "Included" },
  { category: "Contingency 10%", base: 0, qty: 0, note: "Included" },
];

const projectItems = [
  { category: "Water Line Distance (ft)", base: 30, qty: 50 },
  { category: "Sewer Line Distance (ft)", base: 22, qty: 50 },
  { category: "Electric Panel Hook-Up", base: "-", qty: "-" },
  { category: "Concrete Slab Work Total", base: 14, qty: 400 },
  { category: "Landscaping / Misc", base: "-", qty: "-" },
  { category: "Electric Panel Upgrade", base: 3500, qty: 1 },
  { category: "Tree Removal Required", base: 1200, qty: 2 },
  { category: "Site ADU Subs Cost", base: 120, qty: 1 },
  { category: "Foundation Engineering", base: 2000, qty: 1 },
  { category: "Utility Connection Jobs", base: 1800, qty: 1 },
  { category: "Permits & Fees", base: 4500, qty: 1 },
  { category: "Design Engineering", base: 8500, qty: 1 },
  { category: "Contingency 10%", base: 4800, qty: 1 },
];

const UtilityEstimator = () => {
  const [items, setItems] = useState(projectItems);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (typeof it.base === "number" && typeof it.qty === "number" ? it.base * it.qty : 0), 0),
    [items]
  );

  const updateQty = (idx, val) => {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, qty: Number(val) || 0 } : it)));
  };

  return (
    <div>
      <PageHeader title="Utility Cost Estimator" subtitle="Ballpark the utility + site-prep slice of your ADU project." />

      <section className="container mx-auto px-4 sm:px-6 py-10">
        <h3 className="text-xl font-semibold text-primary mb-3">Utility Assumptions</h3>
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 mb-8">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7F6] text-left">
              <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Base</th><th className="px-4 py-3">Quantity</th></tr>
            </thead>
            <tbody>
              {baseItems.map((it, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2">{it.category}</td>
                  <td className="px-4 py-2">{it.note ? it.note : `$${it.base}`}</td>
                  <td className="px-4 py-2">{it.note ? "—" : it.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-xl font-semibold text-primary mb-3">Estimated ADU Project Cost</h3>
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7F6] text-left">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2">{it.category}</td>
                  <td className="px-4 py-2">{typeof it.base === "number" ? `$${it.base}` : "—"}</td>
                  <td className="px-4 py-2">
                    {typeof it.qty === "number" ? (
                      <input
                        type="number"
                        value={it.qty}
                        onChange={(e) => updateQty(i, e.target.value)}
                        className="w-20 px-2 py-1 rounded border border-gray-300 text-sm"
                      />
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {typeof it.base === "number" && typeof it.qty === "number" ? `$${(it.base * it.qty).toLocaleString()}` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#2F5D50] text-white font-semibold">
                <td colSpan="3" className="px-4 py-3">Utility Subtotal</td>
                <td className="px-4 py-3 text-right">${total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default UtilityEstimator;
