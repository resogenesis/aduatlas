import { Link } from "react-router-dom";
import { FiArrowUpRight, FiCheck, FiHelpCircle, FiAlertTriangle } from "react-icons/fi";
import { CONFIDENCE_META } from "../../funnel/confidence";

const ICON = {
  high: FiCheck,
  medium: FiHelpCircle,
  low: FiAlertTriangle,
};

export const ConfidenceChip = ({ level, className = "" }) => {
  const meta = CONFIDENCE_META[level];
  if (!meta) return null;
  const Icon = ICON[level];
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[0.65rem] font-semibold uppercase tracking-wider ${meta.chip} ${className}`}
    >
      <Icon className="text-xs" />
      {meta.label}
    </span>
  );
};

// One row of output: label · value · confidence chip · optional upgrade CTA.
export const ConfidenceRow = ({ point, onUpgrade }) => {
  const { label, value, confidence, source, canUpgrade, note } = point;
  return (
    <div className="grid grid-cols-12 gap-3 sm:gap-4 items-center py-4 border-b border-stroke last:border-b-0">
      <div className="col-span-12 sm:col-span-4">
        <p className="text-paper-dim text-xs uppercase tracking-[0.15em] mb-1">{label}</p>
        {source && <p className="text-paper-dim/60 text-[0.65rem]">{source}</p>}
      </div>
      <div className="col-span-7 sm:col-span-4">
        <p className="text-paper text-sm sm:text-base">{value}</p>
        {note && <p className="text-paper-dim text-xs mt-0.5 italic">{note}</p>}
      </div>
      <div className="col-span-5 sm:col-span-2">
        <ConfidenceChip level={confidence} />
      </div>
      <div className="col-span-12 sm:col-span-2 sm:text-right">
        {canUpgrade && (
          onUpgrade ? (
            <button
              onClick={onUpgrade}
              className="inline-flex items-center gap-1 text-accent text-xs font-medium hover:text-paper transition-colors"
            >
              Verify <FiArrowUpRight />
            </button>
          ) : (
            <Link
              to="/unlock"
              className="inline-flex items-center gap-1 text-accent text-xs font-medium hover:text-paper transition-colors"
            >
              Verify <FiArrowUpRight />
            </Link>
          )
        )}
      </div>
    </div>
  );
};

// Inline summary count: "3 of 8 verified · 4 estimated · 1 unknown"
export const ConfidenceSummary = ({ points }) => {
  const counts = { high: 0, medium: 0, low: 0 };
  points.forEach((p) => { if (counts[p.confidence] != null) counts[p.confidence]++; });
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {counts.high > 0 && (
        <span className="inline-flex items-center gap-1.5 text-paper-dim">
          <span className="w-2 h-2 rounded-full" style={{ background: CONFIDENCE_META.high.dot }} />
          {counts.high} verified
        </span>
      )}
      {counts.medium > 0 && (
        <span className="inline-flex items-center gap-1.5 text-paper-dim">
          <span className="w-2 h-2 rounded-full" style={{ background: CONFIDENCE_META.medium.dot }} />
          {counts.medium} estimated
        </span>
      )}
      {counts.low > 0 && (
        <span className="inline-flex items-center gap-1.5 text-paper-dim">
          <span className="w-2 h-2 rounded-full" style={{ background: CONFIDENCE_META.low.dot }} />
          {counts.low} unknown
        </span>
      )}
    </div>
  );
};
