import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiSearch } from "react-icons/fi";
import { allLeads } from "../../funnel/builderStore";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "viewed", label: "Viewed" },
  { id: "claimed", label: "Claimed" },
];

const STATUS_BADGE = {
  new: { text: "New", className: "bg-accent text-accent-fg" },
  viewed: { text: "Viewed", className: "bg-canvas border border-stroke text-paper-dim" },
  claimed: { text: "Claimed", className: "bg-paper text-canvas" },
  won: { text: "Won", className: "bg-accent text-accent-fg" },
  lost: { text: "Lost", className: "bg-canvas border border-stroke text-paper-dim/60" },
};

const Leads = () => {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const all = allLeads();

  const filtered = useMemo(() => {
    let r = all;
    if (filter !== "all") r = r.filter((l) => l.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((l) =>
        [l.homeowner, l.city, l.zip, l.aduType, l.purpose, l.id].some((v) =>
          (v || "").toString().toLowerCase().includes(q)
        )
      );
    }
    return r;
  }, [all, filter, query]);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Leads</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-3">
        Qualified Builder Packets.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg mb-10 max-w-2xl">
        Every lead has paid $79.99, completed the system, and submitted a packet. Click any row to see the full project brief.
      </p>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-7">
        <div className="flex gap-1 p-1 bg-surface-1-solid border border-stroke rounded-full">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition cursor-pointer ${
                filter === f.id ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-paper-dim" />
          <input
            type="text"
            placeholder="Search ZIP, name, ADU type…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-full bg-surface-1-solid border border-stroke text-paper text-sm placeholder:text-paper-dim/60 focus:outline-none focus:border-accent transition"
          />
        </div>
      </div>

      {/* Leads list */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-paper-dim text-sm">No leads match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-stroke">
            {filtered.map((lead) => {
              const badge = STATUS_BADGE[lead.status] || STATUS_BADGE.new;
              return (
                <Link
                  key={lead.id}
                  to={`/builder/leads/${lead.id}`}
                  className="grid grid-cols-12 gap-4 items-center px-6 py-5 hover:bg-canvas/40 transition-colors"
                >
                  {/* Score */}
                  <div className="col-span-2 sm:col-span-1 flex items-center">
                    <div className="w-11 h-11 rounded-full bg-canvas border border-stroke flex items-center justify-center font-display text-paper">
                      {lead.score}
                    </div>
                  </div>
                  {/* Identity */}
                  <div className="col-span-7 sm:col-span-4 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-paper text-base">{lead.homeowner}</h3>
                      <span className={`text-[0.65rem] font-semibold rounded-full px-2 py-0.5 uppercase tracking-wider ${badge.className}`}>
                        {badge.text}
                      </span>
                    </div>
                    <p className="text-paper-dim text-xs mt-0.5 truncate">
                      {lead.city}, {lead.state} {lead.zip} · ID {lead.id}
                    </p>
                  </div>
                  {/* Project */}
                  <div className="hidden sm:block sm:col-span-3 text-paper-dim text-sm truncate">
                    {lead.aduType} · {lead.desiredSqft} sq ft
                  </div>
                  {/* Budget */}
                  <div className="hidden sm:block sm:col-span-3 text-paper text-sm">
                    {lead.budget}
                  </div>
                  {/* Arrow */}
                  <div className="col-span-3 sm:col-span-1 flex justify-end">
                    <FiArrowRight className="text-paper-dim" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leads;
