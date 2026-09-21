import { FiCheck } from "react-icons/fi";

// A pre-site estimate card drawn in code: the shape of the worksheet a
// homeowner fills in, with illustrative figures and a gold total.
const ROWS = [
  ["Survey and site plan", "$2,400"],
  ["Sewer connection", "$9,500"],
  ["Water and electric", "$6,800"],
  ["Permits and plan check", "$4,200"],
  ["Grading and access", "$3,100"],
];

const CostsArt = ({ className = "" }) => (
  <div className={`relative ${className}`} aria-label="Illustration of a pre-site cost estimate" role="img">
    <div className="absolute inset-x-6 -top-3 h-full rounded-3xl bg-surface-2" aria-hidden />
    <div className="relative bg-canvas border border-stroke rounded-3xl p-6 sm:p-7 shadow-[0_30px_60px_-40px_rgba(23,32,27,0.35)]">
      <div className="flex items-center justify-between mb-5">
        <p className="font-display text-paper text-lg">Pre-site estimate</p>
        <span className="text-xs text-paper-dim">Sample</span>
      </div>
      <ul className="divide-y divide-stroke">
        {ROWS.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between py-2.5 text-sm">
            <span className="inline-flex items-center gap-2 text-paper">
              <FiCheck className="text-accent" aria-hidden /> {k}
            </span>
            <span className="text-paper-dim tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 pt-4 border-t border-stroke flex items-center justify-between">
        <span className="text-paper font-semibold">Before the structure</span>
        <span className="font-display text-gold text-2xl">$26,000</span>
      </div>
    </div>
  </div>
);

export default CostsArt;
