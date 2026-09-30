import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiMapPin, FiTool, FiUserCheck } from "react-icons/fi";

const POINT_ICONS = [FiMapPin, FiTool, FiUserCheck];
import PageHeader from "../components/common/PageHeader";
import { SPECIALTY_LABELS, fetchFeaturedBuilders, publicUrl } from "../lib/builders";
import { isPaid } from "../stores/paymentStore";

// Public Find a Builder page. It explains how builder access works, shows a few
// featured profiles, and sends visitors to the plans.
//
// INDIVIDUAL PROFILES ARE PUBLIC, THE MARKETPLACE IS NOT (Phase 1 spec,
// decision 2a: "The directory as a whole is never publicly browsable"). This
// page therefore carries NO roster. An earlier version read every published row
// out of builders_public_profile with no limit and printed the whole thing
// grouped by state with per-state counts, which is a browsable directory
// however few columns it shows: a visitor could read the full list of companies
// ADUAtlas has, by area, without a plan. The fetch behind it is gone with it.
//
// CRAWL DISCOVERY IS api/sitemap.js. Profiles do not need an HTML index to be
// found: the sitemap lists every slug in builders_public_profile, robots.txt
// points at it, and each profile is a public page in its own right. That is how
// a profile gets indexed without publishing the roster to every visitor.
//
// The featured strip stays. It is a handful of profiles an admin chose, not the
// directory, and it is the same teaser the homepage uses.
const POINTS = [
  { title: "Organized by area", desc: "Builders are listed by state and the cities they serve, so you see who actually works where you live." },
  // 2b, unknown means unknown: build approach is omitted on a profile whenever
  // the company never stated it, which is most of a seeded listing. The page
  // can promise the ADU types, and can only say the approach is shown WHERE the
  // company stated it.
  { title: "Clear specialties", desc: "Detached, attached, garage conversion, interior units, prefab, or two-story. Where a company has said how it builds, custom, prefab or both, its profile says so too." },
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
      <PageHeader title="Find a builder" subtitle="Every ADUAtlas builder profile is a public page, so you can read a company's listing before you spend anything. Searching and filtering the directory by state and service area, saving the builders you like and having an introduction sent on your behalf are part of a plan, and Platinum and Concierge homeowners also get suggestions matched to their property.">
        <div className="flex flex-wrap gap-3">
          <Link to={paid ? "/builders" : "/unlock"} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
            {paid ? "Open the directory" : "See plans"} <FiArrowRight />
          </Link>
        </div>
      </PageHeader>

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
        <ul className="grid md:grid-cols-3 gap-6">
          {POINTS.map((p, i) => {
            const Icon = POINT_ICONS[i];
            return (
              <li key={p.title} className="bg-canvas border border-stroke rounded-3xl p-7 lift">
                <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent inline-flex items-center justify-center text-xl mb-4">
                  <Icon aria-hidden />
                </span>
                <h2 className="font-display text-paper text-xl mb-2">{p.title}</h2>
                <p className="text-paper-dim text-sm leading-relaxed">{p.desc}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {featured.length > 0 && (
        <section className="bg-surface-1-solid border-y border-stroke">
          <div className="container mx-auto px-5 sm:px-8 max-w-6xl py-16">
            <h2 className="font-display text-paper text-3xl mb-6">A few builders in the directory</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.map((b) => {
                const logo = publicUrl(b.logo_path);
                return (
                  <li key={b.slug}>
                    <Link to={`/builders/${b.slug}`} className="bg-canvas border border-stroke rounded-2xl p-5 flex items-center gap-4 lift h-full hover:border-accent transition-colors">
                      {logo ? <img src={logo} alt="" className="w-12 h-12 object-contain rounded-lg" /> : <div className="w-12 h-12 rounded-lg bg-surface-1-solid" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-paper truncate">{b.name}</p>
                        <p className="text-paper-dim text-xs inline-flex items-center gap-1">
                          <FiMapPin /> {[...(b.cities || []).slice(0, 2), b.state].filter(Boolean).join(", ")}
                        </p>
                        <p className="text-paper-dim text-xs mt-0.5 truncate">{(b.specialties || []).map((s) => SPECIALTY_LABELS[s] || s).join(" · ")}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl section-y max-w-3xl">
        <h2 className="font-display text-paper text-3xl mb-3">Are you a builder?</h2>
        <p className="text-paper-dim leading-relaxed mb-5">
          If you build ADUs and want homeowners who have done their homework to find you, create a builder account and complete your company profile. ADUAtlas reviews it before it goes live.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Link to="/builders/join" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
            Create your builder account <FiArrowRight />
          </Link>
          <a href="mailto:hello@aduatlas.com?subject=Builder%20profile" className="inline-flex items-center gap-2 text-accent font-medium text-sm">
            Or email us about a profile
          </a>
        </div>
      </section>
    </div>
  );
};

export default FindBuilder;
