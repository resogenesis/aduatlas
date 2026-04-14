import { FiSearch } from "react-icons/fi";
import mapImg from "../../assets/home/how_it_works.png";

const leads = [
  { address: "St. Louis, MO 63122", size: "1,000 SqFt lot, A/R", type: "Detached + Prefab", status: "Ready to Hire" },
  { address: "St. Louis, MO 63122", size: "1,000 SqFt lot, A/R", type: "Detached + Prefab", status: "Early Research" },
  { address: "St. Louis, MO 63122", size: "1,000 SqFt lot, A/R", type: "Detached + Prefab", status: "Ready to Hire" },
];

const Dashboard = () => {
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-semibold text-primary mb-1">Welcome Back, John!</h1>
      <p className="text-secondary mb-6">Summary of 13 available leads</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Selected State", val: "Missouri" },
          { label: "New Leads", val: "3" },
          { label: "Active Inquiries", val: "7" },
          { label: "Conversion", val: "45%" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-semibold text-primary mt-1">{s.val}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button className="px-4 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold">View Leads</button>
        <button className="px-4 py-2 rounded-md border border-gray-300 text-sm">Edit Service Area</button>
        <button className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-semibold">Upgrade Plan</button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-primary">Recent ADU Leads in Your Area</h3>
            <button className="text-sm text-[#2F5D50] font-semibold">View all</button>
          </div>
          <div className="flex flex-col gap-3">
            {leads.map((l, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-[#F4F7F6]">
                <div>
                  <p className="font-semibold text-primary">{l.address}</p>
                  <p className="text-xs text-secondary">{l.size} · {l.type}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded ${l.status === "Ready to Hire" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{l.status}</span>
                  <button className="px-3 py-1.5 rounded-md bg-[#2F5D50] text-white text-xs font-semibold">Request Contact</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-primary">Area Activity Map</h3>
            <button className="text-gray-400"><FiSearch /></button>
          </div>
          <img src={mapImg} alt="Map" className="w-full h-64 object-cover rounded-lg" />
          <div className="mt-3 p-3 rounded-lg bg-[#F4F7F6] text-xs text-secondary">
            <strong className="text-primary">Heat Tips:</strong> Focus high-intent leads first. Update service area weekly for best match quality.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
