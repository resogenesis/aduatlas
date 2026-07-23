// Feasibility stat cards — the modern "report" panel beside the site plan.
//
// The cards read from the shared lotModel and are deliberately split by data
// provenance (see lotModel.js):
//   • Values we can compute from the homeowner's inputs (lot size, footprints,
//     coverage) are shown as numbers — flagged "estimated" when the underlying
//     dimensions were derived from public-record area rather than confirmed.
//   • Values that require the municipal ZONING CODE or a survey (FAR limit,
//     height limit, whether setbacks are legal, by-right ADU size, utility
//     locations) are NOT invented. They render as "Verify your zone" — no
//     green ✅ on a guess. Those get real answers in Phase 2 (Regrid + zoning).

const fmt = (n) => Math.round(n).toLocaleString();

const Tag = ({ prov }) => {
  if (prov === "estimated")
    return (
      <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5">
        Estimated
      </span>
    );
  if (prov === "measured")
    return (
      <span className="text-[9px] font-semibold uppercase tracking-wider text-accent/90 bg-accent/10 border border-accent/25 rounded px-1.5 py-0.5">
        From your inputs
      </span>
    );
  return null;
};

const Card = ({ title, prov, children }) => (
  <div className="bg-canvas border border-stroke rounded-2xl p-4">
    <div className="flex items-center justify-between gap-2 mb-2">
      <h4 className="text-paper font-semibold text-sm">{title}</h4>
      <Tag prov={prov} />
    </div>
    {children}
  </div>
);

const Row = ({ label, value, accent }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="text-paper-dim text-xs">{label}</span>
    <span className={`tabular-nums text-sm ${accent ? "text-accent font-semibold" : "text-paper"}`}>{value}</span>
  </div>
);

// A value we can't know without zoning/survey data — shown honestly as pending.
const Pending = ({ label }) => (
  <div className="flex items-center justify-between gap-3 py-0.5">
    <span className="text-paper-dim text-xs">{label}</span>
    <span className="text-paper-dim/70 text-xs italic">Verify your zone</span>
  </div>
);

const FeasibilityCards = ({ model }) => {
  const { stats, provenance, adu } = model;
  const dimProv = provenance.lotDims; // measured | estimated

  return (
    <div className="grid gap-3">
      {/* Lot */}
      <Card title="Lot" prov={dimProv}>
        <Row label="Area" value={`${fmt(stats.lotArea)} sq ft`} />
        <Row label="Dimensions" value={`${fmt(stats.lotDims.w)}′ × ${fmt(stats.lotDims.d)}′`} />
        <Row label="Lot coverage" value={`${Math.round(stats.coverage * 100)}%`} />
        <div className="border-t border-stroke my-2" />
        <Pending label="FAR limit" />
        <Pending label="Max height" />
      </Card>

      {/* Existing home */}
      <Card title="Existing home" prov={dimProv}>
        {stats.homeArea > 0 ? (
          <>
            <Row label="Footprint" value={`${fmt(stats.homeArea)} sq ft`} />
            {stats.homeDims && (
              <Row label="Dimensions" value={`${fmt(stats.homeDims.w)}′ × ${fmt(stats.homeDims.d)}′`} />
            )}
          </>
        ) : (
          <p className="text-paper-dim text-xs">No home footprint entered.</p>
        )}
      </Card>

      {/* Proposed ADU */}
      <Card title="Proposed ADU" prov="estimated">
        {adu ? (
          <>
            <Row label="Largest that fits" value={`${fmt(stats.aduArea)} sq ft`} accent />
            {stats.aduDims && (
              <Row label="Footprint" value={`${fmt(stats.aduDims.w)}′ × ${fmt(stats.aduDims.d)}′`} />
            )}
            <Row label="Type" value="Detached, rear yard" />
            <div className="border-t border-stroke my-2" />
            <Pending label="By-right size" />
            <Pending label="Meets setbacks" />
          </>
        ) : (
          <p className="text-amber-300 text-xs leading-relaxed">
            No rear-yard room left for a detached ADU with these numbers. Try a smaller home depth,
            a conversion, or check for a setback reduction.
          </p>
        )}
      </Card>

      {/* Utilities — no data source yet; honest placeholder */}
      <Card title="Utilities" prov="unknown">
        <Pending label="Water line" />
        <Pending label="Sewer line" />
        <Pending label="Electrical" />
        <p className="text-paper-dim/70 text-[10px] leading-relaxed mt-1.5">
          Utility locations come from your survey or municipal GIS — not yet wired in.
        </p>
      </Card>
    </div>
  );
};

export default FeasibilityCards;
