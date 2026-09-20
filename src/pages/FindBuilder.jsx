import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiMapPin } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import { SPECIALTY_LABELS, fetchFeaturedBuilders, publicUrl } from "../lib/builders";
import { isPaid } from "../stores/paymentStore";

// Public Find a Builder page (scope §2/§5): explains builder access and
// matching, shows a few featured profiles, and sends visitors to the plans.
const POINTS = [
  { title: "Organized by area", desc: "Builders are listed by state and the cities they serve, so you see who actually works where you live." },
  { title: "Clear specialties", desc: "Detached, attached, garage conversion, interior units, prefab, or two-story, plus whether they build custom, prefab, or both." },
  { title: "Introductions, not cold calls", desc: "Save the builders you like. When your plan is ready, request an introduction and ADUAtlas connects you." },
];

const FindBuilder = () => {
  const [featured, setFeatured] = useState([]);
  useEffect(() => {
    fetchFeaturedBuilders().then(setFeatured);
  }, []);
  const paid = isPaid();

  return (
    <div>
      <PageHeader title="Find a builder" subtitle="Builder profiles organized by state and service area, included with every ADUAtlas plan. Platinum and Concierge homeowners also get suggestions matched to their property.">
        <div className="flex flex-wrap gap-3">
          <Link to={paid ? "/builders" : "/unlock"} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors">
            {paid ? "Open the directory" : "See plans"} <FiArrowRight />
          </Link>
          <Link to="/property" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition">
            Check my property first
          </Link>
        </div>
      </PageHeader>

      <section className="container mx-auto px-5 sm:px-8 py-16 max-w-6xl">
        <ul className="grid md:grid-cols-3 gap-6">
          {POINTS.map((p, i) => (
            <li key={p.title} className="bg-canvas border border-stroke rounded-3xl p-7">
              <p className="font-display text-accent text-2xl mb-3">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="font-display text-paper text-xl mb-2">{p.title}</h2>
              <p className="text-paper-dim text-sm leading-relaxed">{p.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {featured.length > 0 && (
        <section className="bg-surface-1-solid border-y border-stroke">
          <div className="container mx-auto px-5 sm:px-8 py-16 max-w-6xl">
            <h2 className="font-display text-paper text-3xl mb-6">A few builders in the directory</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.map((b) => {
                const logo = publicUrl(b.logo_path);
                return (
                  <li key={b.slug} className="bg-canvas border border-stroke rounded-2xl p-5 flex items-center gap-4">
                    {logo ? <img src={logo} alt="" className="w-12 h-12 object-contain rounded-lg" /> : <div className="w-12 h-12 rounded-lg bg-surface-1-solid" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-paper truncate">{b.name}</p>
                      <p className="text-paper-dim text-xs inline-flex items-center gap-1">
                        <FiMapPin /> {[...(b.cities || []).slice(0, 2), b.state].join(", ")}
                      </p>
                      <p className="text-paper-dim text-xs mt-0.5 truncate">{(b.specialties || []).map((s) => SPECIALTY_LABELS[s] || s).join(" · ")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <section className="container mx-auto px-5 sm:px-8 py-16 max-w-3xl">
        <h2 className="font-display text-paper text-3xl mb-3">Are you a builder?</h2>
        <p className="text-paper-dim leading-relaxed mb-5">
          ADUAtlas profiles are curated by our team. If you build ADUs and want homeowners who have done their homework to find you, tell us about your company.
        </p>
        <a href="mailto:hello@aduatlas.com?subject=Builder%20profile" className="inline-flex items-center gap-2 text-accent font-medium">
          Email us about a profile <FiArrowRight />
        </a>
      </section>
    </div>
  );
};

export default FindBuilder;
