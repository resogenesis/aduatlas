import { useState } from "react";
import { Link } from "react-router-dom";
import { FiCheck, FiSave } from "react-icons/fi";
import { loadPacket, packetProgress, savePacket } from "../../funnel/courseStore";

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

  const setField = (key, value) => setPacket((p) => ({ ...p, [key]: value }));

  const handleSave = (e) => {
    e?.preventDefault?.();
    savePacket(packet);
    setSavedAt(new Date());
    // INTEGRATION POINT (Supabase): upsert builder_packet jsonb on the user row.
  };

  const progress = packetProgress();

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        My Property
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        Your project brief.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        These are the same questions every builder asks. Fill them in once and they flow into your Feasibility Study, Builder Packet, and quotes — apples-to-apples.
      </p>

      {/* Progress bar */}
      <div className="mb-10 bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6">
        <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-1">Builder Packet</p>
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
              <label className="block text-paper text-xs font-medium tracking-[0.15em] uppercase mb-2">
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
            <label className="block text-paper text-xs font-medium tracking-[0.15em] uppercase mb-2">
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
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
          >
            <FiSave /> Save brief
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-accent text-sm">
              <FiCheck /> Saved
            </span>
          )}
          <Link to="/dashboard" className="text-paper-dim text-sm hover:text-paper transition-colors sm:ml-auto">
            Back to dashboard
          </Link>
        </div>
      </form>
    </div>
  );
};

export default MyProperty;
