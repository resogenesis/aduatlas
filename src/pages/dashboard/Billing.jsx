import { FiDownload, FiCheck } from "react-icons/fi";

const invoices = [
  { plan: "30 Day Access", date: "Oct. 21, 2026", amount: "USD $29", status: "Paid" },
  { plan: "30 Day Access", date: "Oct. 21, 2026", amount: "USD $29", status: "Paid" },
  { plan: "30 Day Access", date: "Oct. 21, 2026", amount: "USD $29", status: "Paid" },
  { plan: "30 Day Access", date: "Oct. 21, 2026", amount: "USD $29", status: "Paid" },
];

const Billing = () => {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-primary mb-1">Subscription & Billing</h1>
      <p className="text-secondary text-sm mb-6">Manage your current plan and invoices.</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-6">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-primary">Current Plan</h3>
            <p className="text-xs text-gray-500">Active · 30-Day Plan</p>
          </div>
          <button className="px-4 py-2 rounded-md border border-[#2F5D50] text-[#2F5D50] text-sm font-semibold">+ Active</button>
        </div>

        <div className="mt-4 flex flex-wrap gap-6 text-sm">
          <div><span className="text-gray-500">Started:</span> Jan 15, 2026</div>
          <div><span className="text-gray-500">Renews:</span> Feb 15, 2026</div>
        </div>

        <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-sm text-secondary">
          {["Unlimited state rules", "Feasibility checklist access", "Utility cost estimator", "Lead match with builders", "Downloadable worksheets", "Priority support"].map((p) => (
            <li key={p} className="inline-flex items-center gap-2"><FiCheck className="text-[#2F5D50]" /> {p}</li>
          ))}
        </ul>

        <div className="flex gap-3 mt-5">
          <button className="px-4 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold">Manage Subscription</button>
          <button className="px-4 py-2 rounded-md border border-gray-300 text-sm">Cancel Plan</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
        <h3 className="font-semibold text-primary mb-4">Billing History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b border-gray-200">
              <tr>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((iv, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 pr-4">{iv.plan}</td>
                  <td className="py-3 pr-4">{iv.date}</td>
                  <td className="py-3 pr-4">{iv.amount}</td>
                  <td className="py-3 pr-4"><span className="text-green-700 bg-green-100 px-2 py-1 rounded text-xs">{iv.status}</span></td>
                  <td className="py-3"><button className="text-[#2F5D50]"><FiDownload /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Billing;
