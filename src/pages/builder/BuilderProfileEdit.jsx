import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle } from "react-icons/fi";
import { APPROACH_LABELS, BUILD_METHOD_LABELS, PROFILE_STATUS_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, TURNKEY_HELP, fetchMyBuilder, publicUrl, saveMyBuilder, submitMyBuilder } from "../../lib/builders";

// The builder's own profile. Every field here is on the save_my_builder()
// whitelist (migration 0006). Status, referral code, featured, pricing terms
// and the admin audit are not editable from this page and are not sent.
// A new profile is created as a draft; Submit for review moves it to pending;
// ADUAtlas approves it. Editing an approved profile keeps it live.

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const EMPTY = {
  name: "",
  description: "",
  address_line: "",
  city: "",
  state: "",
  zip: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  website: "",
  external_link: "",
  cities: "",
  service_zips: "",
  service_states: [],
  specialties: [],
  service_types: [],
  build_approach: "both",
  build_methods: [],
  turnkey: false,
  licensed_states: [],
  videos: "",
};

const csv = (arr) => (arr || []).join(", ");
const fromCsv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const stateList = (arr) => (arr || []).map((s) => String(s).toUpperCase()).filter((s) => US_STATES.includes(s));

const toForm = (b) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.entries(b || {}).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? EMPTY[k]])),
  cities: csv(b?.cities),
  service_zips: csv(b?.service_zips),
  videos: (b?.videos || []).join("\n"),
  turnkey: Boolean(b?.turnkey),
});

// Only whitelisted keys, normalised the way the RPC expects them.
const toPatch = (f) => ({
  name: f.name.trim(),
  description: f.description.trim() || null,
  address_line: f.address_line.trim() || null,
  city: f.city.trim() || null,
  state: f.state.toUpperCase(),
  zip: f.zip.trim() || null,
  contact_name: f.contact_name.trim() || null,
  contact_email: f.contact_email.trim() || null,
  contact_phone: f.contact_phone.trim() || null,
  website: f.website.trim() || null,
  external_link: f.external_link.trim() || null,
  cities: fromCsv(f.cities),
  service_zips: fromCsv(f.service_zips),
  service_states: stateList(f.service_states),
  specialties: f.specialties,
  service_types: f.service_types,
  build_approach: f.build_approach,
  build_methods: f.build_methods,
  turnkey: Boolean(f.turnkey),
  licensed_states: stateList(f.licensed_states),
  videos: String(f.videos || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 2),
});

const unwrap = (r) => {
  if (!r) return { builder: null, error: "" };
  if (Array.isArray(r)) return { builder: r[0] || null, error: "" };
  if (typeof r !== "object") return { builder: null, error: "" };
  if ("ok" in r) return { builder: r.ok ? r.builder ?? null : null, error: r.ok ? "" : String(r.error || "unavailable") };
  if ("builder" in r) return { builder: r.builder ?? null, error: "" };
  return { builder: r.id ? r : null, error: "" };
};

const input = "mt-1 w-full bg-canvas border border-stroke rounded-xl px-4 py-3 text-paper text-sm focus:outline-none focus:border-accent";

const Field = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="text-paper text-xs font-medium">{label}</span>
    {children}
    {hint && <span className="block mt-1 text-xs text-paper-dim/80">{hint}</span>}
  </label>
);

const Chips = ({ options, value, onChange, small }) => (
  <div className="flex flex-wrap gap-2 mt-2">
    {Object.entries(options).map(([k, label]) => {
      const on = value.includes(k);
      return (
        <button
          key={k}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(on ? value.filter((v) => v !== k) : [...value, k])}
          className={`${small ? "px-2.5 py-1 min-w-[2.75rem]" : "px-3 py-1.5"} rounded-lg text-xs font-medium border transition ${on ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper-dim hover:text-paper hover:border-accent"}`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

const STATE_OPTIONS = Object.fromEntries(US_STATES.map((s) => [s, s]));

const Section = ({ title, intro, children }) => (
  <section className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-7 space-y-4">
    <div>
      <h2 className="font-display text-paper text-xl">{title}</h2>
      {intro && <p className="text-paper-dim text-sm mt-1">{intro}</p>}
    </div>
    {children}
  </section>
);

const BuilderProfileEdit = () => {
  const [f, setF] = useState(EMPTY);
  const [row, setRow] = useState(null); // the saved row (status, media, code)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchMyBuilder().then((r) => {
      if (cancelled) return;
      const { builder, error } = unwrap(r);
      setRow(builder);
      if (builder) setF(toForm(builder));
      setLoadError(error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async (e) => {
    e?.preventDefault?.();
    setError("");
    setNotice("");
    if (!f.name.trim()) {
      setError("Enter your company name.");
      return;
    }
    if (!US_STATES.includes(f.state.toUpperCase())) {
      setError("Choose the state of your business address.");
      return;
    }
    setBusy("save");
    const r = await saveMyBuilder(toPatch(f));
    const { builder, error } = unwrap(r);
    setBusy("");
    if (error || !builder) {
      setError(error ? `Could not save: ${error}` : "Could not save your profile.");
      return;
    }
    setRow(builder);
    setF(toForm(builder));
    setNotice(builder.profile_status === "approved" ? "Saved. Your live listing is updated." : "Saved.");
    return builder;
  };

  const submit = async () => {
    setError("");
    setNotice("");
    setBusy("submit");
    // Save first so the review sees what is on screen.
    const saved = await save();
    if (!saved) {
      setBusy("");
      return;
    }
    setBusy("submit");
    const r = await submitMyBuilder();
    const { builder, error } = unwrap(r);
    setBusy("");
    if (error || !builder) {
      setError(error ? `Could not submit: ${error}` : "Could not submit your profile.");
      return;
    }
    setRow(builder);
    setF(toForm(builder));
    setNotice("Submitted. ADUAtlas reviews new profiles within a few business days.");
  };

  if (loading) return <div className="px-5 sm:px-8 lg:px-12 py-14 text-paper-dim text-sm">Loading your profile…</div>;

  if (loadError) {
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-14 max-w-3xl mx-auto">
        <h1 className="font-display text-paper text-3xl mb-3">Your profile is not available right now</h1>
        <p className="text-paper-dim text-sm leading-relaxed mb-4">
          {loadError === "supabase-disabled" ? "The account service is not connected in this environment." : "We could not load your profile. Try again in a minute, and write to us if it keeps happening."}
        </p>
        <a href="mailto:hello@aduatlas.com?subject=Builder%20profile" className="text-accent text-sm font-medium">
          hello@aduatlas.com
        </a>
      </div>
    );
  }

  const status = row?.profile_status || null;
  const isNew = !row;
  const canSubmit = status === "draft";
  const logo = publicUrl(row?.logo_path);
  const photos = (row?.photos || []).map(publicUrl).filter(Boolean);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      {!isNew && (
        <Link to="/builder" className="inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
          <FiArrowLeft /> Dashboard
        </Link>
      )}
      <div className="mb-8">
        <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">{isNew ? "Set up your company profile" : "Your company profile"}</h1>
        <p className="text-paper-dim text-base max-w-2xl">
          {isNew
            ? "This is what homeowners see in the directory. Fill in what you can now, save it as a draft, and submit it when it is ready for review."
            : status === "approved"
              ? "Your listing is live. Changes you save here appear in the directory right away."
              : status === "pending"
                ? "Your profile is under review. You can keep editing it."
                : status === "inactive"
                  ? "Your listing is inactive. You can still update the profile; contact us to reactivate it."
                  : "Your profile is a draft. Homeowners will see it once you submit it and ADUAtlas approves it."}
        </p>
        {status && (
          <p className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1-solid border border-stroke text-xs text-paper">
            Status: {PROFILE_STATUS_LABELS?.[status] || status}
          </p>
        )}
      </div>

      <form onSubmit={save} className="space-y-6">
        <Section title="Company">
          <Field label="Company name *">
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={input} required />
          </Field>
          <Field label="Short bio" hint="Two or three sentences about what you build and how you work with homeowners.">
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className={input} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Website">
              <input value={f.website} onChange={(e) => set("website", e.target.value)} className={input} placeholder="https://" />
            </Field>
            <Field label="One external link" hint="A portfolio or reviews page.">
              <input value={f.external_link} onChange={(e) => set("external_link", e.target.value)} className={input} placeholder="https://" />
            </Field>
          </div>
        </Section>

        <Section title="Business address" intro="Homeowners see your city and state. The street address stays with ADUAtlas.">
          <Field label="Street address">
            <input value={f.address_line} onChange={(e) => set("address_line", e.target.value)} className={input} />
          </Field>
          <div className="grid sm:grid-cols-[1fr_8rem_8rem] gap-4">
            <Field label="City">
              <input value={f.city} onChange={(e) => set("city", e.target.value)} className={input} />
            </Field>
            <Field label="State *">
              <select value={f.state} onChange={(e) => set("state", e.target.value)} className={input} required>
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ZIP">
              <input value={f.zip} onChange={(e) => set("zip", e.target.value)} className={input} inputMode="numeric" />
            </Field>
          </div>
        </Section>

        <Section title="Contact" intro="Homeowners see the email and phone. The contact name is for ADUAtlas.">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Contact name">
              <input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={input} />
            </Field>
            <Field label="Contact email">
              <input type="email" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} className={input} />
            </Field>
            <Field label="Contact phone">
              <input type="tel" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} className={input} />
            </Field>
          </div>
        </Section>

        <Section title="Service area" intro="This is where you market to homeowners and take on work.">
          <div>
            <p className="text-paper text-xs font-medium">States you serve</p>
            <Chips small options={STATE_OPTIONS} value={f.service_states} onChange={(v) => set("service_states", v)} />
          </div>
          <Field label="Cities or areas served" hint="Comma separated.">
            <input value={f.cities} onChange={(e) => set("cities", e.target.value)} className={input} placeholder="Pasadena, Glendale, Altadena" />
          </Field>
          <Field label="ZIP codes or prefixes served" hint="Optional, comma separated.">
            <input value={f.service_zips} onChange={(e) => set("service_zips", e.target.value)} className={input} placeholder="911, 90041" />
          </Field>
        </Section>

        <Section title="Licensed states" intro="The states where you are licensed or otherwise approved to do the work. This is separate from your service area, because marketing into a state is not the same as being licensed there.">
          <Chips small options={STATE_OPTIONS} value={f.licensed_states} onChange={(v) => set("licensed_states", v)} />
        </Section>

        <Section title="What you build">
          <div>
            <p className="text-paper text-xs font-medium">ADU types</p>
            <Chips options={SPECIALTY_LABELS} value={f.specialties} onChange={(v) => set("specialties", v)} />
          </div>
          <div>
            <p className="text-paper text-xs font-medium">Build methods</p>
            <Chips options={BUILD_METHOD_LABELS || {}} value={f.build_methods} onChange={(v) => set("build_methods", v)} />
          </div>
          <div>
            <p className="text-paper text-xs font-medium">Services</p>
            <Chips options={SERVICE_TYPE_LABELS} value={f.service_types} onChange={(v) => set("service_types", v)} />
          </div>
          <Field label="Build approach">
            <select value={f.build_approach} onChange={(e) => set("build_approach", e.target.value)} className={input}>
              {Object.entries(APPROACH_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-start justify-between gap-4 bg-surface-1-solid border border-stroke rounded-2xl p-4">
            <div>
              <p className="text-paper text-sm font-medium">Turnkey</p>
              <p className="text-paper-dim text-xs mt-1 leading-relaxed">{TURNKEY_HELP}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={f.turnkey}
              onClick={() => set("turnkey", !f.turnkey)}
              className={`shrink-0 mt-1 w-12 h-7 rounded-full border transition relative ${f.turnkey ? "bg-accent border-accent" : "bg-canvas border-stroke"}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${f.turnkey ? "left-[1.35rem]" : "left-0.5"}`} />
              <span className="sr-only">{f.turnkey ? "Turnkey: yes" : "Turnkey: no"}</span>
            </button>
          </div>
        </Section>

        <Section title="Media">
          <Field label="Video links" hint="Up to two YouTube or Vimeo links, one per line.">
            <textarea value={f.videos} onChange={(e) => set("videos", e.target.value)} rows={2} className={input} />
          </Field>
          <div>
            <p className="text-paper text-xs font-medium mb-2">Logo and project photos</p>
            {logo || photos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {logo && <img src={logo} alt="Logo" className="h-12 w-auto object-contain rounded-lg bg-surface-1-solid p-1" />}
                {photos.map((src) => (
                  <img key={src} src={src} alt="" className="w-20 h-20 object-cover rounded-lg" />
                ))}
              </div>
            ) : null}
            <p className="text-paper-dim text-xs leading-relaxed">
              Send your logo and up to three project photos to{" "}
              <a href="mailto:hello@aduatlas.com?subject=Builder%20profile%20photos" className="text-accent font-medium">
                hello@aduatlas.com
              </a>{" "}
              and we will add them to your profile.
            </p>
          </div>
        </Section>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
        {notice && (
          <p className="inline-flex items-center gap-2 text-sm text-accent bg-accent/10 border border-accent/30 rounded-xl px-4 py-3">
            <FiCheckCircle aria-hidden /> {notice}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={Boolean(busy)} className="px-6 py-3 rounded-xl border border-stroke text-paper text-sm font-semibold hover:border-accent disabled:opacity-60 press">
            {busy === "save" ? "Saving…" : isNew ? "Save draft" : "Save"}
          </button>
          {canSubmit && (
            <button type="button" onClick={submit} disabled={Boolean(busy)} className="px-6 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim disabled:opacity-60 press">
              {busy === "submit" ? "Submitting…" : "Submit for review"}
            </button>
          )}
        </div>
        {isNew && <p className="text-paper-dim text-xs">Save the draft first. The Submit for review button appears once the profile exists.</p>}
      </form>
    </div>
  );
};

export default BuilderProfileEdit;
