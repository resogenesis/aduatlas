import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiBookmark, FiCheck, FiExternalLink, FiGlobe, FiMail, FiMapPin, FiPhone } from "react-icons/fi";
import { APPROACH_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, fetchBuilder, fetchMyIntros, fetchSaved, publicUrl, requestIntro, toggleSaved } from "../lib/builders";

// Builder profile: description, service area, specialties, up to 3 photos and
// 2 videos, the website and one extra link, save, and request an introduction.

const embedUrl = (url = "") => {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

const BuilderProfile = () => {
  const { id: slug } = useParams();
  const [b, setB] = useState(undefined);
  const [saved, setSaved] = useState(false);
  const [intro, setIntro] = useState(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchBuilder(slug).then(async (r) => {
      if (cancelled) return;
      const builder = r.ok ? r.builder : null;
      setB(builder);
      if (!builder) return;
      const [savedSet, intros] = await Promise.all([fetchSaved(), fetchMyIntros()]);
      if (cancelled) return;
      setSaved(savedSet.has(builder.id));
      setIntro(intros.find((i) => i.builder_id === builder.id) || null);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (b === undefined) return <div className="px-5 sm:px-8 lg:px-12 py-14 text-paper-dim text-sm">Loading…</div>;
  if (!b)
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-14 max-w-3xl mx-auto">
        <p className="text-paper mb-4">That builder is not available.</p>
        <Link to="/builders" className="text-accent text-sm font-medium inline-flex items-center gap-1">
          <FiArrowLeft /> Back to builders
        </Link>
      </div>
    );

  const logo = publicUrl(b.logo_path);
  const photos = (b.photos || []).map(publicUrl).filter(Boolean);
  const videos = (b.videos || []).map(embedUrl).filter(Boolean);

  const onSave = async () => {
    const r = await toggleSaved(b.id, saved);
    if (r.ok) setSaved(r.saved);
  };
  const sendIntro = async (e) => {
    e.preventDefault();
    setError("");
    const r = await requestIntro(b.id, message);
    if (!r.ok) {
      setError(r.error === "already-requested" ? "You already requested an introduction to this builder." : r.error === "not-signed-in" ? "Sign in to request an introduction." : `Could not send: ${r.error}`);
      return;
    }
    setIntro(r.intro);
    setAsking(false);
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <Link to="/builders" className="inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
        <FiArrowLeft /> Back to builders
      </Link>

      <div className="grid lg:grid-cols-[22rem_1fr] gap-8 items-start">
        <aside className="bg-canvas border border-stroke rounded-3xl p-6 lg:sticky lg:top-8">
          {logo ? <img src={logo} alt={`${b.name} logo`} className="h-16 w-auto object-contain mb-4" /> : <div className="h-16 w-16 rounded-2xl bg-surface-1-solid mb-4" />}
          <h1 className="font-display text-paper text-2xl leading-tight mb-1">{b.name}</h1>
          <p className="text-paper-dim text-sm inline-flex items-center gap-1.5 mb-5">
            <FiMapPin /> {[...(b.cities || []).slice(0, 3), b.state].filter(Boolean).join(", ")}
          </p>

          <div className="flex gap-2 mb-6">
            {intro ? (
              <span className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-1-solid text-paper text-sm font-medium">
                <FiCheck className="text-accent" /> Introduction {intro.status === "sent" ? "sent" : intro.status === "declined" ? "not available" : "requested"}
              </span>
            ) : (
              <button type="button" onClick={() => setAsking(true)} className="flex-1 px-4 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
                Request introduction
              </button>
            )}
            <button type="button" onClick={onSave} aria-pressed={saved} className={`px-4 py-3 rounded-xl border text-sm font-medium transition inline-flex items-center gap-2 ${saved ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper hover:border-accent"}`}>
              <FiBookmark className={saved ? "fill-current" : ""} /> {saved ? "Saved" : "Save"}
            </button>
          </div>

          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-paper-dim mb-1">ADU types</dt>
              <dd className="text-paper">{(b.specialties || []).map((s) => SPECIALTY_LABELS[s] || s).join(", ") || "Not listed"}</dd>
            </div>
            <div>
              <dt className="text-paper-dim mb-1">Services</dt>
              <dd className="text-paper">{(b.service_types || []).map((s) => SERVICE_TYPE_LABELS[s] || s).join(", ") || "Not listed"}</dd>
            </div>
            <div>
              <dt className="text-paper-dim mb-1">Approach</dt>
              <dd className="text-paper">{APPROACH_LABELS[b.build_approach]}</dd>
            </div>
            {(b.cities || []).length > 0 && (
              <div>
                <dt className="text-paper-dim mb-1">Areas served</dt>
                <dd className="text-paper">{b.cities.join(", ")}</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 pt-5 border-t border-stroke space-y-2 text-sm">
            {b.website && (
              <a href={b.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-accent hover:underline underline-offset-2">
                <FiGlobe /> Website
              </a>
            )}
            {b.external_link && (
              <a href={b.external_link} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-accent hover:underline underline-offset-2">
                <FiExternalLink /> More from this builder
              </a>
            )}
            {b.contact_email && (
              <a href={`mailto:${b.contact_email}`} className="flex items-center gap-2 text-paper-dim hover:text-paper">
                <FiMail /> {b.contact_email}
              </a>
            )}
            {b.contact_phone && (
              <a href={`tel:${b.contact_phone}`} className="flex items-center gap-2 text-paper-dim hover:text-paper">
                <FiPhone /> {b.contact_phone}
              </a>
            )}
          </div>
        </aside>

        <main className="space-y-8">
          {photos.length > 0 && (
            <div className={`grid gap-3 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {photos.map((src, i) => (
                <img key={src} src={src} alt={`${b.name} project ${i + 1}`} className={`w-full rounded-2xl object-cover ${i === 0 && photos.length === 3 ? "col-span-2 aspect-[16/9]" : "aspect-[4/3]"}`} />
              ))}
            </div>
          )}
          {b.description && (
            <section className="bg-canvas border border-stroke rounded-3xl p-7">
              <h2 className="font-display text-paper text-xl mb-3">About {b.name}</h2>
              <p className="text-paper-dim text-sm sm:text-base leading-relaxed whitespace-pre-line">{b.description}</p>
            </section>
          )}
          {videos.length > 0 && (
            <section className="grid md:grid-cols-2 gap-4">
              {videos.map((src) => (
                <iframe key={src} src={src} title={`${b.name} video`} className="w-full aspect-video rounded-2xl bg-black" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              ))}
            </section>
          )}
          {photos.length === 0 && !b.description && videos.length === 0 && <p className="text-paper-dim text-sm">This profile is being completed.</p>}
        </main>
      </div>

      {asking && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-paper/40 backdrop-blur-sm" onClick={() => setAsking(false)} />
          <form onSubmit={sendIntro} className="relative w-full max-w-lg bg-canvas border border-stroke rounded-3xl p-7">
            <h2 className="font-display text-paper text-2xl mb-2">Request an introduction</h2>
            <p className="text-paper-dim text-sm mb-5">ADUAtlas will introduce you to {b.name} and share your project brief. Add anything you want them to know.</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Optional message" className="w-full px-4 py-3 bg-surface-1-solid border border-stroke rounded-xl text-paper focus:outline-none focus:ring-2 focus:ring-accent mb-4" />
            {error && (
              <p role="alert" className="text-sm text-red-700 mb-3">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button type="submit" className="px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim">
                Send request
              </button>
              <button type="button" onClick={() => setAsking(false)} className="px-5 py-3 rounded-xl border border-stroke text-paper text-sm font-medium">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default BuilderProfile;
