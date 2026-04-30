import { useState } from "react";
import { FiSearch, FiPlay } from "react-icons/fi";
import PageHeader from "../../components/common/PageHeader";
import img1 from "../../assets/home/choose_img1.png";
import img2 from "../../assets/home/choose_img2.png";

const stateData = [
  {
    name: "Missouri",
    bullets: {
      allowed: ["One ADU per single-family lot", "Attached and detached allowed", "Owner occupancy not required statewide"],
      restrictions: ["Max 900 sqft in many cities", "Setback minimums vary by municipality", "Short-term rentals restricted in most metros"],
    },
    source: "https://revisor.mo.gov/",
    video: img1,
  },
  {
    name: "New York",
    bullets: {
      allowed: ["ADUs legal statewide under 2023 HEO", "Up to 800 sqft in NYC outer boroughs", "Attached + detached + conversion types"],
      restrictions: ["Additional historic district overlays apply", "NYC requires separate egress + fire rating", "Annual registration required for rentals"],
    },
    source: "https://www.nyc.gov/",
    video: img2,
  },
];

const ChooseState = () => {
  const [q, setQ] = useState("");
  const filtered = stateData.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Choose Your State" subtitle="Review local ADU rules, then drop into the city-level details." />

      <section className="container mx-auto px-4 sm:px-6 py-10">
        <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl mx-auto flex gap-2 mb-10">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Enter state or city name"
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#2F5D50]"
          />
          <button className="px-5 py-3 rounded-lg bg-[#2F5D50] text-white font-semibold text-sm hover:bg-[#244A40] inline-flex items-center gap-2">
            <FiSearch /> Search
          </button>
        </form>

        <div className="flex flex-col gap-10">
          {filtered.map((s) => (
            <div key={s.name} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-semibold text-primary mb-4">ADU Rules in {s.name}</h3>
              <p className="text-secondary text-sm mb-4 leading-relaxed">
                Summary of statewide ADU policy, local zoning overlays, and permitting thresholds. Every city layers its own rules on top — always verify with your municipality before design.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-[#F4F7F6]">
                  <h4 className="font-semibold text-primary mb-2">Generally Allowed</h4>
                  <ul className="text-sm text-secondary list-disc pl-4 space-y-1">
                    {s.bullets.allowed.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-[#FEF3F2]">
                  <h4 className="font-semibold text-primary mb-2">Important Restrictions</h4>
                  <ul className="text-sm text-secondary list-disc pl-4 space-y-1">
                    {s.bullets.restrictions.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-[#EEF2FB] text-sm">
                <span className="text-gray-500">Source: </span>
                <a href={s.source} className="text-[#2F5D50] font-semibold underline">{s.source}</a>
              </div>

              <div className="mt-5 relative rounded-xl overflow-hidden">
                <img src={s.video} alt="" className="w-full h-64 object-cover" />
                <button className="absolute inset-0 m-auto w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
                  <FiPlay className="text-[#2F5D50] text-2xl ml-1" />
                </button>
              </div>

              <div className="flex justify-between items-center mt-5">
                <button className="px-4 py-2 rounded-md border border-gray-300 text-sm">Go Back</button>
                <button className="px-5 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold">Next</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-500">No matches. Try another state.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default ChooseState;
