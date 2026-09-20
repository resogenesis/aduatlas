import { Link } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { hasReportTier } from "../../stores/paymentStore";
import { loadWorksheets } from "../../stores/worksheetStore";
import { presiteTotal, tpcTotals } from "../tools/worksheetDefs";
import { money } from "../../components/tools/worksheetKit";

// Costs: what the worksheets say so far, with the doors into each estimate.
const Costs = () => {
  const ws = loadWorksheets();
  const presite = presiteTotal(ws);
  const tpc = tpcTotals(ws);
  const platinum = hasReportTier();

  const tiles = [
    { label: "Pre-site estimate", value: presite ? money(presite) : "Not started", to: "/packet/pre-site-estimate", desc: "Utilities, site work, and fees before the structure." },
    { label: "Total project cost", value: tpc?.estimated ? money(tpc.estimated) : "Not started", to: "/packet/total-cost", desc: "Estimated versus final, rolled up from your worksheets." },
    { label: "Utility hookup estimate", value: platinum ? "Open" : "Platinum", to: platinum ? "/utility-estimator" : "/unlock?tier=report", desc: "Water, sewer, and electric connection costs for your lot.", locked: !platinum },
  ];

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Costs</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        Construction range, pre-site considerations, and utility hookup guidance. Planning estimates, not quotes.
      </p>
      <div className="grid md:grid-cols-3 gap-5 mb-10">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="bg-surface-1-solid border border-stroke rounded-3xl p-6 hover:border-accent transition flex flex-col">
            <p className="text-paper-dim text-sm mb-2 inline-flex items-center gap-2">
              {t.locked && <FiLock className="text-xs" />} {t.label}
            </p>
            <p className="font-primary font-extrabold tracking-tight text-paper text-3xl mb-3">{t.value}</p>
            <p className="text-paper-dim text-sm leading-relaxed flex-1">{t.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-accent text-sm font-medium">
              Open <FiArrowRight />
            </span>
          </Link>
        ))}
      </div>
      <div className="bg-canvas border border-stroke rounded-3xl p-7">
        <h2 className="font-primary font-extrabold tracking-tight text-paper text-xl mb-2">All worksheets</h2>
        <p className="text-paper-dim text-sm mb-4">Pre-site verification, builder preparation, traditional build quotes, modular and prefab estimate, and the ADU Ready Score.</p>
        <Link to="/packet" className="inline-flex items-center gap-2 text-accent text-sm font-medium">
          Open the worksheets <FiArrowRight />
        </Link>
      </div>
    </div>
  );
};

export default Costs;
