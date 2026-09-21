import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiBookmark, FiMapPin, FiSearch } from "react-icons/fi";
import { APPROACH_LABELS, SPECIALTY_LABELS, fetchBuilders, fetchSaved, filterBuilders, parseAddress, publicUrl, suggestForProperty, toggleSaved } from "../lib/builders";
import { loadPacket } from "../stores/courseStore";
import { hasReportTier } from "../stores/paymentStore";
import { supabaseEnabled } from "../lib/supabase";

// Builder directory for paid homeowners: search by state, city or ZIP, filter
// by ADU type and build approach, save builders, and (Platinum+) see
// suggestions ranked for the saved property.

const STATES = ["AZ", "CA", "CO", "FL", "GA", "MA", "NC", "NV", "NY", "OR", "TX", "UT", "WA"];

const Card = ({ b, saved, onSave }) => {
  const logo = publicUrl(b.logo_path);
  const photo = publicUrl((b.photos || [])[0]);
  return (
    <li className="bg-canvas border border-stroke rounded-3xl overflow-hidden flex flex-col lift">
      <Link to={`/builders/${b.slug}`} className="block aspect-[16/9] bg-surface-1-solid overflow-hidden">
        {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : logo ? <img src={logo} alt="" className="w-full h-full object-contain p-8" /> : <div className="w-full h-full flex items-center justify-center text-paper-dim text-sm">No photo yet</div>}
      </Link>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-1">
          <Link to={`/builders/${b.slug}`} className="font-display text-paper text-lg leading-tight hover:text-accent">
            {b.name}
          </Link>
          <button type="button" onClick={() => onSave(b)} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save builder"} className={`p-2 rounded-lg border transition ${saved ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper-dim hover:border-accent"}`}>
            <FiBookmark className={saved ? "fill-current" : ""} />
          </button>
        </div>
        <p className="text-paper-dim text-sm inline-flex items-center gap-1.5 mb-3">
          <FiMapPin className="shrink-0" /> {[...(b.cities || []).slice(0, 2), b.state].filter(Boolean).join(", ")}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(b.specialties || []).slice(0, 3).map((s) => (
            <span key={s} className="px-2.5 py-1 rounded-full bg-surface-1-solid text-xs text-paper-dim">
              {SPECIALTY_LABELS[s] || s}
            </span>
          ))}
          <span className="px-2.5 py-1 rounded-full bg-surface-1-solid text-xs text-paper-dim">{APPROACH_LABELS[b.build_approach]}</span>
        </div>
        <Link to={`/builders/${b.slug}`} className="mt-auto inline-flex items-center gap-1 text-accent text-sm font-medium">
          View profile <FiArrowRight />
        </Link>
      </div>
    </li>
  );
};

const BuilderListing = () => {
  const [items, setItems] = useState(null);
  const [saved, setSaved] = useState(new Set());
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [approach, setApproach] = useState("");
  const [tab, setTab] = useState("all");
  const packet = loadPacket();
  const platinum = hasReportTier();

  useEffect(() => {
    fetchBuilders().then((r) => setItems(r.items));
    fetchSaved().then(setSaved);
  }, []);

  const filtered = useMemo(() => filterBuilders(items || [], { q, state, specialty, approach }), [items, q, state, specialty, approach]);
  const savedList = useMemo(() => (items || []).filter((b) => saved.has(b.id)), [items, saved]);
  const addr = parseAddress(packet.address || "");
  const suggested = useMemo(() => (platinum && items ? suggestForProperty(items, { ...addr, zip: addr.zip || packet.zip, aduType: packet.aduType }).slice(0, 3) : []), [items, platinum, addr, packet.zip, packet.aduType]);

  const onSave = async (b) => {
    const isSaved = saved.has(b.id);
    const r = await toggleSaved(b.id, isSaved);
    if (!r.ok) return;
    setSaved((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(b.id);
      else next.add(b.id);
      return next;
    });
  };

  const list = tab === "saved" ? savedList : filtered;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Builders</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-8">
        ADU builders organized by state and service area. Save the ones you like and request an introduction when your plan is ready.
      </p>

      {platinum && suggested.length > 0 && tab === "all" && !q && !state && !specialty && (
        <section className="mb-10">
          <h2 className="font-display text-paper text-xl mb-1">Suggested for {packet.address ? addr.city || "your property" : "your property"}</h2>
          <p className="text-paper-dim text-sm mb-4">Ranked by service area and the ADU type in your project brief.</p>
          <ul className="grid md:grid-cols-3 gap-5">
            {suggested.map((b) => (
              <Card key={b.id} b={b} saved={saved.has(b.id)} onSave={onSave} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="flex-1 min-w-[16rem] flex items-center gap-2 px-4 py-3 bg-canvas border border-stroke rounded-xl">
          <FiSearch className="text-paper-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, ZIP, or builder name" className="flex-1 bg-transparent text-paper focus:outline-none" aria-label="Search builders" />
        </label>
        <select value={state} onChange={(e) => setState(e.target.value)} className="px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper" aria-label="State">
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper" aria-label="ADU type">
          <option value="">All ADU types</option>
          {Object.entries(SPECIALTY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={approach} onChange={(e) => setApproach(e.target.value)} className="px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper" aria-label="Build approach">
          <option value="">Custom or prefab</option>
          <option value="custom">Custom builds</option>
          <option value="prefab">Prefab</option>
        </select>
        <div className="flex rounded-xl border border-stroke overflow-hidden">
          {["all", "saved"].map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-3 text-sm font-medium ${tab === t ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper"}`}>
              {t === "all" ? "All" : `Saved (${savedList.length})`}
            </button>
          ))}
        </div>
      </div>

      {!supabaseEnabled && <p className="text-paper-dim text-sm">The directory needs the account service, which is not connected in this environment.</p>}
      {items === null && supabaseEnabled && <p className="text-paper-dim text-sm">Loading builders…</p>}
      {items && list.length === 0 && (
        <p className="text-paper-dim text-sm bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
          {tab === "saved" ? "You have not saved any builders yet." : items.length === 0 ? "Builder profiles are being added. Check back soon." : "No builders match that search yet. Try a nearby city or clear a filter."}
        </p>
      )}
      {list.length > 0 && (
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((b) => (
            <Card key={b.id} b={b} saved={saved.has(b.id)} onSave={onSave} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default BuilderListing;
