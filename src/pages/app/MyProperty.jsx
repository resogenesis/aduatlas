import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiCheckSquare, FiClipboard, FiCrop, FiDollarSign, FiFileText, FiLayers, FiLock, FiMap, FiSave, FiZap } from "react-icons/fi";
import { loadPacket, packetProgress, savePacket } from "../../stores/courseStore";
import { briefOnly, fetchBuilderPacket, saveBuilderPacket } from "../../lib/supabase";
import { hasReportTier } from "../../stores/paymentStore";

// My Property and Site Plan: one of the five portal destinations (Phase 1
// spec, section 4). The project brief lives here, and the property pages that
// used to sit in the sidebar are reached from the sub navigation below. Their
// routes and gates are unchanged: the pages the router gates on the "report"
// tier carry the same Platinum lock the sidebar showed, and a Golden buyer who
// opens one lands on the tier paywall exactly as before.
//
// This list is the whole of the destination. It has to cover every path in the
// `also` array on the My Property entry in src/layout/AppLayout.jsx, because
// that array is what makes the sidebar highlight this destination. A page that
// highlights here and is not listed here has no way in. Each `isLocked` mirrors
// the router's gate for that path (src/router/router.jsx): requireTier="report"
// means Platinum and Concierge, and no requireTier means any paid plan.
// The exception is /study, which any signed-in account may open and save (2q):
// its lock marks only the submit step, hence its own label and title.
const SECTIONS = [
  { to: "/study", label: "Feasibility", Icon: FiFileText, desc: "Your property intake, then the study.", isLocked: () => !hasReportTier(), lockLabel: "Platinum to submit", lockTitle: "Anyone signed in can fill in and save the intake. Submitting it for the study needs Platinum or Concierge." },
  { to: "/site-plan", label: "Site Plan", Icon: FiMap, desc: "What could fit, and the arrangement you want.", isLocked: () => !hasReportTier() },
  { to: "/costs", label: "Costs", Icon: FiDollarSign, desc: "Construction range and pre-site guidance.", isLocked: () => false },
  { to: "/adu-options", label: "ADU Options", Icon: FiLayers, desc: "The ways an ADU can fit on a property.", isLocked: () => false },
  { to: "/feasibility", label: "Buildable envelope", Icon: FiCrop, desc: "Setbacks and lot coverage, and what is left to build in.", isLocked: () => !hasReportTier() },
  { to: "/utility-estimator", label: "Utility estimator", Icon: FiZap, desc: "What the water, sewer and power connections may cost.", isLocked: () => !hasReportTier() },
  { to: "/report", label: "My report", Icon: FiClipboard, desc: "Your property report, ready to print or send.", isLocked: () => !hasReportTier() },
  { to: "/packet", label: "Worksheets", Icon: FiCheckSquare, desc: "The preparation worksheets and your ADU Ready Score.", isLocked: () => !hasReportTier() },
];

const SubNav = () => (
  <nav aria-label="Property sections" className="mb-10">
    <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {SECTIONS.map(({ to, label, Icon, desc, isLocked, lockLabel = "Platinum", lockTitle = "Included with Platinum and Concierge" }) => {
        const locked = isLocked();
        return (
          <li key={to}>
            <Link to={to} className="group flex flex-col h-full bg-surface-1-solid border border-stroke rounded-2xl p-4 hover:border-accent transition">
              <span className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-2 text-paper text-sm font-medium">
                  <Icon className="text-accent" aria-hidden /> {label}
                </span>
                {locked && (
                  <span className="inline-flex items-center gap-1 text-paper-dim text-[0.65rem]" title={lockTitle}>
                    <FiLock aria-hidden /> {lockLabel}
                  </span>
                )}
              </span>
              <span className="text-paper-dim text-xs leading-relaxed flex-1">{desc}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-accent text-xs font-medium">
                Open <FiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  </nav>
);

const fields = [
  { key: "address", label: "Property address", placeholder: "123 Main St, Anytown CA 90210", type: "text" },
  { key: "zip", label: "ZIP code", placeholder: "90210", type: "text", short: true },
  { key: "lotSize", label: "Lot size (approx.)", placeholder: "5,000–10,000 sq ft", type: "text", short: true },
  { key: "purpose", label: "Purpose of the ADU", placeholder: "Rental income / aging parent / office / etc.", type: "text" },
  { key: "aduType", label: "Desired ADU type", placeholder: "Detached prefab, garage conversion, etc.", type: "text" },
  { key: "desiredSqft", label: "Desired ADU sq ft", placeholder: "600", type: "text", short: true },
  { key: "stories", label: "Stories", placeholder: "1 or 2", type: "text", short: true },
  { key: "budget", label: "Budget range (site prep + structure)", placeholder: "$200K–$400K", type: "text" },
  { key: "timeline", label: "Timeline to break ground", placeholder: "6 months / 1–2 years / exploring", type: "text" },
  { key: "siteAccess", label: "Site access notes", placeholder: "Driveway width, gate clearance, fence to remove, etc.", type: "textarea" },
  { key: "utilityNotes", label: "Utility notes", placeholder: "Sewer location, water meter, electric panel capacity", type: "textarea" },
  { key: "hoaNotes", label: "HOA / restrictions", placeholder: "Architectural review, deed restrictions, easements", type: "textarea" },
];

const MyProperty = () => {
  const [packet, setPacket] = useState(loadPacket);
  const [savedAt, setSavedAt] = useState(null);

  // THIS PAGE WRITES THE PROJECT BRIEF AND NOTHING ELSE (I4-01). The packet in
  // localStorage also carries the worksheets, the Ready Score and the lot, and
  // src/stores/worksheetStore.js is their ONLY writer, here and on the server:
  // it keeps the pending, base and unowned marks and merges three ways, so an
  // older copy on this device never lands on newer server data (R3-02). This
  // page once saved the whole packet it loaded at mount, so a device whose read
  // had failed or not landed sent older sheets over newer ones. Now it takes
  // briefOnly() of every packet it handles, and each local write lays the brief
  // over the packet stored at that moment, not over the copy loaded at mount.
  //
  // Hydrate from the server on mount: if this user saved a brief before (e.g.
  // on another device), pull it in. Server wins over the empty defaults but we
  // keep any locally-entered values the server doesn't have. Best-effort,
  // silently ignored when logged out or Supabase is disabled.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchBuilderPacket();
      if (cancelled || !res.ok || !res.packet) return;
      setPacket((local) => {
        const merged = { ...local };
        for (const [k, v] of Object.entries(briefOnly(res.packet))) {
          if (v != null && v !== "") merged[k] = v;
        }
        // Keep the localStorage mirror of the brief in sync.
        savePacket({ ...loadPacket(), ...briefOnly(merged) });
        return merged;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (key, value) => setPacket((p) => ({ ...p, [key]: value }));

  const handleSave = (e) => {
    e?.preventDefault?.();
    savePacket({ ...loadPacket(), ...briefOnly(packet) });
    setSavedAt(new Date());
    // Mirror the brief to Supabase (users.builder_packet). Best-effort: the
    // local save above is the synchronous source of truth; this adds
    // durability. No worksheet or lot write leaves this page.
    saveBuilderPacket(briefOnly(packet));
  };

  const progress = packetProgress();

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        My Property and Site Plan
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-8">
        Everything about your property sits in one place. Open any section below, or fill in the project brief underneath them.
      </p>

      <SubNav />

      <h2 className="font-display text-paper text-2xl sm:text-3xl leading-tight mb-2">Your project brief</h2>
      <p className="text-paper-dim text-base max-w-2xl mb-8">
        These are the same questions every builder asks. Fill them in once and they flow into your builder introductions and, with Platinum, into your feasibility study and worksheets.
      </p>

      {/* Progress bar */}
      <div className="mb-10 bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6">
        <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-paper-dim text-xs mb-1">Project brief</p>
            <p className="font-display text-paper text-2xl">{progress.percent}% complete</p>
          </div>
          <p className="text-paper-dim text-xs">{progress.filled} of {progress.total} fields</p>
        </div>
        <div className="w-full h-2 bg-canvas border border-stroke rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-5">
          {fields.filter((f) => f.type !== "textarea").map((f) => (
            <div key={f.key} className={f.short ? "" : "sm:col-span-2"}>
              <label className="block text-paper text-xs font-medium mb-2">
                {f.label}
              </label>
              <input
                type="text"
                value={packet[f.key] || ""}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full px-4 py-3.5 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
              />
            </div>
          ))}
        </div>

        {fields.filter((f) => f.type === "textarea").map((f) => (
          <div key={f.key}>
            <label className="block text-paper text-xs font-medium mb-2">
              {f.label}
            </label>
            <textarea
              rows={3}
              value={packet[f.key] || ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full px-4 py-3.5 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition resize-y"
            />
          </div>
        ))}

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4">
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
          >
            <FiSave /> Save brief
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-accent text-sm">
              <FiCheck /> Saved
            </span>
          )}
          <Link to="/dashboard" className="tap-target text-paper-dim text-sm hover:text-paper transition-colors sm:ml-auto">
            Back to dashboard
          </Link>
        </div>
      </form>
    </div>
  );
};

export default MyProperty;
