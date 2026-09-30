import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiAward, FiBookmark, FiCheck, FiCheckCircle, FiExternalLink, FiGlobe, FiInfo, FiMail, FiMapPin, FiMessageCircle, FiPhone } from "react-icons/fi";
import { APPROACH_LABELS, BUILD_METHOD_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, TURNKEY_HELP, VERIFIED_BADGE_LABEL, VERIFIED_HELP, VERIFIED_LIMITS, canShowContact, fetchBuilder, fetchMyIntros, fetchPublicBuilder, fetchSaved, isApproachKnown, isTurnkeyKnown, isVerified, logBuilderEvent, publicUrl, requestIntro, toggleSaved } from "../lib/builders";
import { clampText, setHead, setRobots } from "../lib/head";
import { isPaid } from "../stores/paymentStore";
import { currentUser } from "../stores/authStore";
import { MESSAGE_MAX, fetchConversation, startConversation } from "../lib/builderMessaging";
import Dialog from "../components/messaging/Dialog";

// ONE builder profile page, at ONE url, for two audiences (Phase 1 spec,
// decision 2a). The page is PUBLIC and indexable; the marketplace around it is
// not.
//
// PUBLIC (anyone, signed out included) reads builders_public_profile: company
// name, city and state and service area, builder category and type, ADU types,
// a short description, imagery only for a claimed listing, the website, the
// Verified flag, and a call to action into ADUAtlas. The view has no contact
// email, no phone, no claim code, no referral or tracking column, no
// verification audit and nothing about a homeowner, so this page cannot leak
// one by mistake.
//
// PAID AND SIGNED IN additionally reads the fuller directory record and gets
// what the marketplace is for: Save, Request introduction, and the direct
// contact details of a builder that has CLAIMED its listing. Search and filters
// stay on the paid directory at /builders.
//
// CONTACT DETAILS ARE GATED ON THE CLAIM, NOT THE PLAN (decision 2d, migration
// 0010). Until this pass the mailto and tel were rendered on `paidView` alone,
// and builders_public selected contact_email and contact_phone for every
// approved listing, so a $79 purchase handed out the scraped email address and
// phone number of a company that had never heard of ADUAtlas. Now:
//
//   anonymous visitor            no contact details, claimed or not. The
//                                anon-safe view has never carried the columns.
//   paid, listing UNCLAIMED      no contact details. The page says so and points
//                                at the introduction, which is ADUAtlas passing
//                                a message on by hand.
//   paid, listing CLAIMED        email and phone, as before.
//   paid, ownership not stated   no contact details. canShowContact fails closed.
//
// Everything else an unclaimed listing carries is unchanged: name, location and
// service area, category and type, ADU types, turnkey where stated, website and
// the sourced description all stay (decision 2d).
//
// UNKNOWN MEANS UNKNOWN (decision 2b). A missing field is never printed as a
// claim: the Turnkey row is omitted when turnkey is null and the Build approach
// row is omitted when build_approach is null, and every other row is left out
// when the company never stated it. "No" and "Not listed" are gone.
//
// PROVENANCE (decision 2a). "An unclaimed public profile must carry no
// implication that the company has partnered with, endorsed or joined
// ADUAtlas." `claimed` comes from builders_public_profile (migration 0009) and
// is the only thing that separates the two kinds of listing here:
//
//   claimed === false   ADUAtlas seeded the listing from the company's own
//                       public material and nobody there agreed to anything.
//                       The page says so under the name, attributes the
//                       description to ADUAtlas rather than to the company, and
//                       closes with wording that implies no relationship.
//   claimed === true     A builder account owns the row. Today's wording stands,
//                       including "Work with <company> through ADUAtlas".
//   claimed undefined    The database has not applied 0009, or the record came
//                       from the paid directory fallback, which never carried
//                       the column. Nothing is asserted in either direction:
//                       no provenance note, and the neutral closing block. The
//                       one thing that must never happen is telling a visitor a
//                       company failed to claim a listing it may in fact own.
//
// What claiming does NOT change here (decision 2c): a paid homeowner still sees
// the same fields on an unclaimed listing, still asks ADUAtlas for an
// introduction, and ADUAtlas still records its own marketplace activity. Which
// fields a paid visitor sees is settled elsewhere and is not this page's call.
//
// Section order is fixed for every builder, so a factory built, general
// contractor, design build, alternative or affiliate company all read the same
// way:
//   1. name and badge   2. what they build   3. build method and turnkey
//   4. service area and licensed states   5. about   6. media
//   7. contact and links
// A section with nothing to show is left out rather than filled with defaults.
//
// THE BADGE (decision 2e) reads "Verified on ADUAtlas" and appears only when
// isVerified(b): a builder account owns the listing AND ADUAtlas has checked the
// business information. Claiming alone does not earn it, and a relationship type
// of affiliate or partner does not earn it either; relationship_type is in
// neither public view, so it cannot leak onto this page as a substitute. Four
// states stay distinct here: unclaimed shows the provenance note and no badge,
// claimed but unverified shows neither, verified shows the badge, and the
// commercial relationship is invisible. VerifiedBadge is the one badge component
// for the profile, the directory card and the builder's own dashboard; the
// sentence under it states what the check covers and, in VERIFIED_LIMITS, what
// it does not.
//
// MESSAGING (decision 2h). A paid homeowner on a CLAIMED listing gets "Message
// this builder", or "Open your conversation" once a thread exists. The button
// is drawn only when builders_public_profile says claimed === true, and that
// is a courtesy: the INSERT policy on builder_conversations (0011) is what
// refuses an unclaimed, unapproved or inactive listing, an unpaid homeowner and
// every builder account, and a refusal is shown as the plain sentence it is.
// The first message opens the thread and the homeowner continues it on
// /messages. The builder replies from its portal and never sees who the
// homeowner is.
//
// THE INTRODUCTION REQUEST is still offered on every listing. What it sends is
// what the dialog says (R3-17): an admin forwards the homeowner's own message
// to the builder and nothing else (api/send-email.js, "intro-forward"), so the
// dialog promises no project brief, name, email address or phone number.
//
// BOTH DIALOGS RENDER THROUGH A PORTAL (src/components/messaging/Dialog.jsx,
// R3-15). Inside RootLayout's animated <main> a fixed overlay was positioned
// against <main> instead of the screen and opened below the fold on a phone.
//
// VIEW LOGGING. builder_profile_viewed is recorded through log_builder_event,
// which migration 0006 grants to `authenticated` only and which raises "not
// signed in" without a users row. An anonymous visitor therefore CANNOT record
// a view, and calling it anyway would fire a failing request on every public
// page load. Anonymous profile views are left unlogged, deliberately, until
// there is a server-side endpoint for them. Signed-in views and introduction
// requests are recorded as before, for any approved listing, claimed or not.

// The one badge, everywhere a builder appears: this page, the paid directory
// card and the builder dashboard all render this component. The words come from
// VERIFIED_BADGE_LABEL so there is exactly one place to read them.
export const VerifiedBadge = ({ className = "" }) => (
  <span title={`${VERIFIED_HELP}. ${VERIFIED_LIMITS}`} aria-label={`${VERIFIED_BADGE_LABEL}. ${VERIFIED_HELP}. ${VERIFIED_LIMITS}`} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-accent-fg text-xs font-semibold ${className}`}>
    <FiCheckCircle aria-hidden /> {VERIFIED_BADGE_LABEL}
  </span>
);

const embedUrl = (url = "") => {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

const labels = (keys, map) => (keys || []).map((k) => map?.[k] || k).filter(Boolean).join(", ");

// "A" / "A and B". Capped at two so a title or description never turns into a
// list of everything a company mentioned.
const firstTwo = (keys, map) => {
  const list = (keys || []).map((k) => map?.[k] || k).filter(Boolean).slice(0, 2);
  return list.length === 2 ? `${list[0]} and ${list[1]}` : list[0] || "";
};

const placeOf = (b) => [b?.city, b?.state].filter(Boolean).join(", ");

// A company's own material often gives a bare domain. A public page cannot ship
// that as an href: the browser would read it as a path on aduatlas.com.
const externalHref = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// The head for a profile: the company and where it is in the title, and what it
// builds plus its own words in the description.
const headFor = (b, slug) => {
  const where = placeOf(b);
  const types = firstTwo(b.specialties, SPECIALTY_LABELS);
  const kinds = firstTwo(b.service_types, SERVICE_TYPE_LABELS);
  const opening = types
    ? `${b.name} builds ${types}${where ? ` in ${where}` : ""}.`
    : kinds
      ? `${b.name} works as ${kinds}${where ? ` in ${where}` : ""}.`
      : `${b.name}${where ? ` works in ${where}` : ""} is listed on ADUAtlas.`;
  const own = (b.description || "").trim();
  return {
    title: `${b.name}${where ? `, ${where}` : ""} · ADUAtlas`,
    description: clampText(own ? `${opening} ${own}` : `${opening} See where this company works and what it builds on ADUAtlas.`),
    path: `/builders/${slug}`,
  };
};

const Section = ({ title, children }) => (
  <section className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-7">
    <h2 className="font-display text-paper text-xl mb-4">{title}</h2>
    {children}
  </section>
);

// A row renders only when there is something to say. Nothing here prints a
// default, an inferred value or the word "No" for a field the company never
// filled in (decision 2b).
const Rows = ({ rows }) => (
  <dl className="space-y-4">
    {rows.map(([label, value]) => (
      <div key={label}>
        <dt className="text-paper-dim text-xs mb-1">{label}</dt>
        <dd className="text-paper text-sm leading-relaxed">{value}</dd>
      </div>
    ))}
  </dl>
);

const stated = (rows) => rows.filter(([, value]) => Boolean(value));

const Profile = ({ slug }) => {
  // `pub` is the anon-safe record every visitor gets. `full` is the directory
  // record, fetched only for a signed-in paid homeowner and null otherwise.
  const [pub, setPub] = useState(undefined);
  const [full, setFull] = useState(null);
  const [saved, setSaved] = useState(false);
  const [intro, setIntro] = useState(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Messaging: the homeowner's existing thread with this builder (null when
  // there is none, undefined until known), and the first-message dialog.
  const [conversation, setConversation] = useState(undefined);
  const [writing, setWriting] = useState(false);
  const [firstMessage, setFirstMessage] = useState("");
  const [msgError, setMsgError] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const signedIn = Boolean(currentUser());
      const paid = signedIn && isPaid();
      const [publicRes, fullRes] = await Promise.all([
        fetchPublicBuilder(slug),
        paid ? fetchBuilder(slug) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      // The public view is the page's source. The directory record is the
      // fallback for a database that has not applied the migration behind the
      // public view yet: a paid homeowner keeps the page they had.
      const record = (publicRes?.ok ? publicRes.builder : null) || (fullRes?.ok ? fullRes.builder : null);
      setPub(record || null);
      if (!record) return;
      if (fullRes?.ok && fullRes.builder) setFull(fullRes.builder);
      // Signed in only: see VIEW LOGGING above. Best effort either way.
      if (signedIn) logBuilderEvent(record.id, "builder_profile_viewed");
      if (!paid) return;
      const [savedSet, intros, thread] = await Promise.all([
        fetchSaved(),
        fetchMyIntros(),
        // Only a claimed listing can hold a conversation, so only then is it
        // worth asking whether this homeowner already has one.
        record.claimed === true ? fetchConversation({ builderId: record.id }) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setSaved(savedSet.has(record.id));
      setIntro(intros.find((i) => i.builder_id === record.id) || null);
      setConversation(thread?.ok ? thread.conversation : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Runs after the route's own applyTitle(), because it waits on the fetch.
  useEffect(() => {
    if (!pub) return;
    setHead(headFor(pub, slug));
  }, [pub, slug]);

  // An unavailable profile (a draft, pending, inactive or unknown slug) answers
  // 200 with "That builder profile is not available", so it asks not to be
  // indexed rather than sitting in a search index as a soft 404 (DEF-03). The
  // tag is the page's own and is removed when the visitor moves on.
  const unavailable = pub === null;
  useEffect(() => {
    if (!unavailable) return undefined;
    setRobots("noindex");
    return () => setRobots(null);
  }, [unavailable]);

  if (pub === undefined) return <div className="px-5 sm:px-8 lg:px-12 py-14 text-paper-dim text-sm">Loading…</div>;

  const paidView = Boolean(full);
  const backTo = paidView ? "/builders" : "/find-a-builder";
  const backLabel = paidView ? "Back to builders" : "Find a builder";

  if (!pub)
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-14 max-w-3xl mx-auto">
        <p className="text-paper mb-4">That builder profile is not available.</p>
        <Link to="/find-a-builder" className="text-accent text-sm font-medium inline-flex items-center gap-1">
          <FiArrowLeft /> Find a builder
        </Link>
      </div>
    );

  // The paid record only ever adds to the public one. Keys the paid read did not
  // select (older schemas select fewer columns) keep their public value.
  const b = full ? { ...pub, ...full } : pub;
  // Ownership, from builders_public_profile (0009). The paid directory record
  // has no `claimed` column, so spreading it over the public one cannot erase
  // this. Only an explicit boolean is treated as an answer: see PROVENANCE
  // above.
  const claimed = b.claimed === true;
  const unclaimed = b.claimed === false;
  const verified = isVerified(b);
  const logo = publicUrl(b.logo_path);
  const photos = (b.photos || []).map(publicUrl).filter(Boolean);
  const videos = (b.videos || []).map(embedUrl).filter(Boolean);
  const licensed = b.licensed_states || [];
  const basedIn = placeOf(b);
  const areas = [...(b.cities || []), ...(b.service_states || []).filter((s) => s !== b.state)];

  const buildRows = stated([
    ["ADU types", labels(b.specialties, SPECIALTY_LABELS)],
    ["Services", labels(b.service_types, SERVICE_TYPE_LABELS)],
  ]);
  const methodRows = stated([
    ["Build methods", labels(b.build_methods, BUILD_METHOD_LABELS)],
    // Omitted entirely when the company never stated either one.
    ["Build approach", isApproachKnown(b) ? APPROACH_LABELS[b.build_approach] : ""],
    ["Turnkey", isTurnkeyKnown(b) ? (b.turnkey ? "Yes. This builder can take a project from selection and design through the build." : "No. Ask this builder about the scope they take on.") : ""],
  ]);
  const areaRows = stated([
    ["Based in", basedIn],
    ["Areas served", areas.join(", ")],
    ["Licensed in", licensed.join(", ")],
  ]);

  // Contact email and phone are never public (decision 2a), are not in the
  // anon-safe view, and reach a paid homeowner only for a CLAIMED listing
  // (decision 2d). Two independent gates: the plan decides whether the paid
  // record is read at all, canShowContact decides whether its contact columns may
  // be rendered. The 0010 view already withholds them, so on a current database
  // there is nothing here to withhold; this keeps the paid fallback read on an
  // older schema from publishing what the view would have hidden.
  const showContact = paidView && canShowContact(b);
  const contactLinks = [
    b.website ? { key: "website", href: externalHref(b.website), external: true, icon: FiGlobe, text: "Website", accent: true } : null,
    paidView && b.external_link ? { key: "external", href: externalHref(b.external_link), external: true, icon: FiExternalLink, text: "More from this builder", accent: true } : null,
    showContact && b.contact_email ? { key: "email", href: `mailto:${b.contact_email}`, icon: FiMail, text: b.contact_email } : null,
    showContact && b.contact_phone ? { key: "phone", href: `tel:${b.contact_phone}`, icon: FiPhone, text: b.contact_phone } : null,
  ].filter(Boolean);

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
  // The first message opens the thread (startConversation reuses one that
  // already exists), then the homeowner continues on their Messages page. The
  // row is the message: nothing else has to succeed for it to have been sent.
  const sendFirstMessage = async (e) => {
    e.preventDefault();
    if (msgSending) return;
    setMsgError("");
    if (!firstMessage.trim()) {
      setMsgError("Write a message first.");
      return;
    }
    setMsgSending(true);
    const r = await startConversation({ builderId: b.id, body: firstMessage });
    setMsgSending(false);
    if (r.conversation) setConversation(r.conversation);
    if (!r.ok) {
      setMsgError(
        r.error === "not-allowed"
          ? `${b.name} cannot receive messages on ADUAtlas right now.`
          : r.error === "supabase-disabled"
            ? "Messaging is not connected in this environment."
            : "Your message was not sent. Try again in a minute."
      );
      return;
    }
    setWriting(false);
    setFirstMessage("");
    navigate(`/messages/${r.conversation.id}`);
  };
  // Decision 2h: a homeowner on a plan may message a builder that claimed its
  // listing. The database decides; this only chooses whether to draw the door.
  const canMessage = paidView && claimed;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
        <FiArrowLeft /> {backLabel}
      </Link>

      {/* 1. Name and badge */}
      <header className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          {logo ? <img src={logo} alt={`${b.name} logo`} className="h-16 w-auto max-w-[10rem] object-contain shrink-0" /> : <div className="h-16 w-16 rounded-2xl bg-canvas border border-stroke shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-display text-paper text-3xl sm:text-4xl leading-tight">{b.name}</h1>
              {verified && <VerifiedBadge />}
            </div>
            {basedIn && (
              <p className="text-paper-dim text-sm inline-flex items-center gap-1.5 mb-3">
                <FiMapPin aria-hidden /> {basedIn}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {/* Only an explicit yes earns the chip. */}
              {isTurnkeyKnown(b) && b.turnkey === true && (
                <span title={TURNKEY_HELP} className="px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">Turnkey</span>
              )}
              {licensed.length > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-canvas border border-stroke text-xs text-paper-dim inline-flex items-center gap-1">
                  <FiAward aria-hidden /> Licensed in {licensed.join(", ")}
                </span>
              )}
            </div>
            {/* What the badge covers, and what it does not. Decision 2e: no
                sentence near the badge may imply ADUAtlas certifies the work. */}
            {verified && (
              <p className="text-paper-dim text-xs mt-3">
                {VERIFIED_HELP}. {VERIFIED_LIMITS}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:flex-nowrap sm:items-stretch shrink-0">
            {paidView ? (
              <>
                {canMessage && conversation && (
                  <Link to={`/messages/${conversation.id}`} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors press">
                    <FiMessageCircle aria-hidden /> Open your conversation
                  </Link>
                )}
                {canMessage && conversation === null && (
                  <button type="button" onClick={() => setWriting(true)} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors press">
                    <FiMessageCircle aria-hidden /> Message this builder
                  </button>
                )}
                {intro ? (
                  <span className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-canvas border border-stroke text-paper text-sm font-medium">
                    <FiCheck className="text-accent" /> Introduction {intro.status === "sent" ? "sent" : intro.status === "declined" ? "not available" : "requested"}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAsking(true)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors press ${canMessage ? "border border-stroke text-paper hover:border-accent" : "bg-accent text-accent-fg hover:bg-accent-dim"}`}
                  >
                    Request introduction
                  </button>
                )}
                <button type="button" onClick={onSave} aria-pressed={saved} className={`px-4 py-3 rounded-xl border text-sm font-medium transition inline-flex items-center justify-center gap-2 ${saved ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper hover:border-accent"}`}>
                  <FiBookmark className={saved ? "fill-current" : ""} /> {saved ? "Saved" : "Save"}
                </button>
              </>
            ) : (
              <Link to="/unlock" className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors press">
                See plans <FiArrowRight aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Where the record came from. Directly under the name, for every visitor
          including a paid one, because an unclaimed listing must never read as
          a company that took part (decision 2a). Shown only when the view said
          so outright. */}
      {unclaimed && (
        <section aria-label="Where this listing came from" className="bg-canvas border border-stroke rounded-3xl p-5 sm:p-6 mb-6 flex items-start gap-3">
          <FiInfo className="text-paper-dim mt-0.5 shrink-0" aria-hidden />
          <p className="text-paper-dim text-sm leading-relaxed">
            ADUAtlas compiled this listing from public information. {b.name} has not claimed its profile, and being listed here does not mean the company has partnered with, endorsed or joined ADUAtlas.
          </p>
        </section>
      )}

      {(buildRows.length > 0 || methodRows.length > 0 || areaRows.length > 0 || b.description) && (
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* 2. What they build */}
          {buildRows.length > 0 && (
            <Section title="What they build">
              <Rows rows={buildRows} />
            </Section>
          )}

          {/* 3. Build method and turnkey */}
          {methodRows.length > 0 && (
            <Section title="Build method and turnkey">
              <Rows rows={methodRows} />
            </Section>
          )}

          {/* 4. Service area and licensed states */}
          {areaRows.length > 0 && (
            <Section title="Service area and licensed states">
              <Rows rows={areaRows} />
            </Section>
          )}

          {/* 5. About. On an unclaimed listing this prose is ADUAtlas's own
              summary of public material, so it is attributed to ADUAtlas
              instead of running under the company's name as though the company
              wrote it. A claimed company owns its description and keeps the
              heading it had. */}
          {b.description && (
            <Section title={unclaimed ? `What ADUAtlas found about ${b.name}` : `About ${b.name}`}>
              <p className="text-paper-dim text-sm sm:text-base leading-relaxed whitespace-pre-line">{b.description}</p>
              {unclaimed && (
                <p className="text-paper-dim text-xs mt-4">
                  Written by ADUAtlas from public information. It is not {b.name}'s own description of the company.
                </p>
              )}
            </Section>
          )}
        </div>
      )}

      {/* 6. Media. The anon-safe view carries imagery only for a claimed
          listing, so nothing is published for a company that has not taken
          part. */}
      {(photos.length > 0 || videos.length > 0) && (
        <div className="mb-6">
          <Section title="Media">
            {photos.length > 0 && (
              <div className={`grid gap-3 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${videos.length > 0 ? "mb-4" : ""}`}>
                {photos.map((src, i) => (
                  <img key={src} src={src} alt={`${b.name} project ${i + 1}`} className={`w-full rounded-2xl object-cover ${i === 0 && photos.length === 3 ? "col-span-2 aspect-[16/9]" : "aspect-[4/3]"}`} />
                ))}
              </div>
            )}
            {videos.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                {videos.map((src) => (
                  <iframe key={src} src={src} title={`${b.name} video`} className="w-full aspect-video rounded-2xl bg-black" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* 7. Contact and links */}
      <Section title="Contact and links">
        {contactLinks.length > 0 && (
          <ul className="space-y-2 text-sm">
            {contactLinks.map(({ key, href, external, icon: Icon, text, accent }) => (
              <li key={key}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className={accent ? "inline-flex items-center gap-2 text-accent hover:underline underline-offset-2" : "inline-flex items-center gap-2 text-paper-dim hover:text-paper"}
                >
                  <Icon aria-hidden /> {text}
                </a>
              </li>
            ))}
          </ul>
        )}
        {/* Why a detail is missing, said plainly, because "no contact details"
            would read as a company that never published one. An unclaimed
            listing is withheld by ADUAtlas; a claimed one with nothing here
            simply did not fill the field in. */}
        {paidView && !showContact && (
          <p className={`text-paper-dim text-sm ${contactLinks.length > 0 ? "mt-3" : ""}`}>
            {unclaimed
              ? `${b.name} has not claimed this listing, so ADUAtlas does not pass on its email address or phone number. Request an introduction and ADUAtlas will pass your message on if it has a way to reach them.`
              : "ADUAtlas is not showing direct contact details for this listing. Request an introduction and ADUAtlas will pass your message on if it has a way to reach them."}
          </p>
        )}
        {paidView && showContact && contactLinks.length === 0 && (
          <p className="text-paper-dim text-sm">
            {canMessage ? `No contact details listed. You can message ${b.name} here on ADUAtlas.` : "No contact details listed. Request an introduction and ADUAtlas will pass your message on if it has a way to reach them."}
          </p>
        )}
        {!paidView && (
          <p className={`text-paper-dim text-sm ${contactLinks.length > 0 ? "mt-3" : ""}`}>
            ADUAtlas never publishes a company's email address or phone number. A homeowner on a plan sees the direct details of a builder that has claimed its listing, and asks ADUAtlas for an introduction to one that has not.
          </p>
        )}
      </Section>

      {/* The call to action into ADUAtlas, for a visitor who is not on a plan.
          "Work with <company> through ADUAtlas" reads as a company ADUAtlas
          works with, so it is kept for a claimed listing and replaced
          everywhere else with an offer about ADUAtlas itself. The plan is the
          same either way; only the implied relationship changes. */}
      {!paidView && (
        <section className="mt-6 bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-2xl mb-3">{claimed ? `Work with ${b.name} through ADUAtlas` : "What an ADUAtlas plan adds"}</h2>
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
            An ADUAtlas plan opens the full builder directory with search and filters. You can save the companies you like, message a builder that has claimed its listing, and ask ADUAtlas to send an introduction. You always start the conversation, and a builder never browses homeowner information.
            {unclaimed && ` ADUAtlas cannot speak for ${b.name}: the company has not claimed its profile, so ADUAtlas cannot promise that it will reply.`}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/unlock" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
              See plans <FiArrowRight aria-hidden />
            </Link>
            <Link to="/find-a-builder" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
              How builder profiles work
            </Link>
          </div>
        </section>
      )}

      <Dialog open={asking && paidView} onClose={() => setAsking(false)} labelledBy="intro-dialog-title">
        <form onSubmit={sendIntro}>
          <h2 id="intro-dialog-title" className="font-display text-paper text-2xl mb-2">
            Request an introduction
          </h2>
          {/* What the forward actually carries (R3-17): the message typed here
              and nothing else (api/send-email.js "intro-forward"). A person
              at ADUAtlas sends it from the console and can decline, and the
              forward is refused when the listing has no contact email (many
              seeded listings have none, and this page cannot see which), so
              the copy does not promise that it always goes out. */}
          <p className="text-paper-dim text-sm mb-5">
            Someone at ADUAtlas reads each request and, if we have a way to reach {b.name}, forwards the message you write here. Nothing else is sent to them: not your name, email address, phone number or project brief. Add anything you want them to know.
          </p>
          <label htmlFor="intro-message" className="sr-only">
            Your message to {b.name}
          </label>
          <textarea id="intro-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder="Optional message" className="w-full px-4 py-3 bg-surface-1-solid border border-stroke rounded-xl text-paper text-base focus:outline-none focus:ring-2 focus:ring-accent mb-4" />
          {error && (
            <p role="alert" className="text-sm text-red-700 mb-3">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim press">
              Send request
            </button>
            <button type="button" onClick={() => setAsking(false)} className="px-5 py-3 rounded-xl border border-stroke text-paper text-sm font-medium press">
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={writing && canMessage} onClose={() => setWriting(false)} labelledBy="message-dialog-title">
        <form onSubmit={sendFirstMessage}>
          <h2 id="message-dialog-title" className="font-display text-paper text-2xl mb-2">
            Message {b.name}
          </h2>
          <p className="text-paper-dim text-sm mb-5">
            {b.name} can read your message in its ADUAtlas builder portal and reply there. It sees what you write, not your name, email address or phone number, unless you include them. Replies appear on your Messages page, where the conversation continues.
          </p>
          <label htmlFor="first-message" className="block text-paper text-sm font-medium mb-1.5">
            Your message
          </label>
          <textarea id="first-message" value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} rows={5} maxLength={MESSAGE_MAX} className="w-full px-4 py-3 bg-surface-1-solid border border-stroke rounded-xl text-paper text-base focus:outline-none focus:ring-2 focus:ring-accent mb-4" />
          {msgError && (
            <p role="alert" className="text-sm text-red-700 mb-3">
              {msgError}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={msgSending} className="px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim press disabled:opacity-60">
              {msgSending ? "Sending…" : "Send message"}
            </button>
            <button type="button" onClick={() => setWriting(false)} className="px-5 py-3 rounded-xl border border-stroke text-paper text-sm font-medium press">
              Cancel
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

// The slug keys the page, so walking from one profile to the next starts with
// empty state instead of showing the previous company's record, saved flag or
// introduction while the new one loads.
const BuilderProfile = () => {
  const { id: slug } = useParams();
  return <Profile key={slug} slug={slug} />;
};

export default BuilderProfile;
