import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { hasReportTier } from "../../stores/paymentStore";
import { fetchMyStudy } from "../../lib/studies";

// ADU options: the configurations a property may support. General
// descriptions for every plan; the property-specific recommendation arrives
// with the Platinum study.
const OPTIONS = [
  { name: "Detached ADU", desc: "A new stand-alone unit in the rear or side yard. Most flexible layout, most site work." },
  { name: "Attached ADU", desc: "An addition sharing a wall with the main house. Shares utilities, tighter on setbacks." },
  { name: "Garage conversion", desc: "Turns an existing garage into living space. Often the lowest cost; parking rules vary." },
  { name: "Interior conversion or JADU", desc: "A unit carved from the existing home, usually up to 500 sq ft with a small kitchen." },
  { name: "Prefab or factory-built", desc: "Built off site and set on a prepared foundation. Faster build, still needs full site prep." },
  { name: "Above-garage or two-story", desc: "Adds height rather than footprint. Height limits and neighbor privacy rules apply." },
];

const AduOptions = () => {
  const [study, setStudy] = useState(null);
  const platinum = hasReportTier();
  useEffect(() => {
    fetchMyStudy().then((r) => setStudy(r.ok ? r.study : null));
  }, []);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">ADU options</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        The main ways an ADU can fit on a property. Which ones fit yours depends on your lot, your home, and your city.
      </p>
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-7 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-paper font-semibold mb-1">
            {platinum ? (study?.status === "ready" ? "Your study names the options your property supports." : "Your options will be named in your feasibility study.") : "Want the options for your property?"}
          </p>
          <p className="text-paper-dim text-sm">
            {platinum ? "Open the study for placement, size, and type guidance specific to your lot." : "Platinum includes a property-specific feasibility study with the ADU types your lot supports."}
          </p>
        </div>
        <Link to={platinum ? "/study" : "/unlock?tier=report"} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
          {platinum ? "Open my study" : "See Platinum"} <FiArrowRight />
        </Link>
      </div>
      <ul className="grid sm:grid-cols-2 gap-5">
        {OPTIONS.map((o) => (
          <li key={o.name} className="bg-canvas border border-stroke rounded-3xl p-6">
            <h2 className="font-primary font-extrabold tracking-tight text-paper text-xl mb-2">{o.name}</h2>
            <p className="text-paper-dim text-sm leading-relaxed">{o.desc}</p>
          </li>
        ))}
      </ul>
      <p className="text-paper-dim text-xs mt-8">
        Requirements vary by jurisdiction and property. <Link to="/adu-types" className="underline underline-offset-2">See the full ADU types guide</Link>.
      </p>
    </div>
  );
};

export default AduOptions;
