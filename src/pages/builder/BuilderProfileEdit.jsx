import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle, FiKey } from "react-icons/fi";
import { APPROACH_LABELS, BUILD_METHOD_LABELS, PROFILE_STATUS_LABELS, RELATIONSHIP_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, TURNKEY_HELP, claimMyBuilder, fetchMyBuilder, isVerified, publicUrl, saveMyBuilder, submitMyBuilder } from "../../lib/builders";

// The builder's own profile. Every field here is on the save_my_builder()
// whitelist (migration 0006). Status, referral code, featured, pricing terms
// and the admin audit are not editable from this page and are not sent.
// A new profile is created as a draft; Submit for review moves it to pending;
// ADUAtlas approves it. Editing an approved profile keeps it live.
//
// Two ways to get a profile (Phase 1 spec 5.2). ADUAtlas seeds the directory
// from public information, so a builder may already be listed: the invitation
// carries a claim code, and entering it here (ClaimCodePanel, claim_my_builder
// in 0007) makes that row theirs. Otherwise the builder fills in the form and
// saves a new draft. The relationship type (marketplace, affiliate, partner)
// is set by ADUAtlas and shown read-only.
//
// Unknown means unknown. Turnkey and build approach are three-state here (Yes,
// No, Not stated) and a new profile starts at Not stated, so the company gives
// its own answer and ADUAtlas never invents one. Not stated saves null, and
// every homeowner surface omits the attribute instead of printing a default.

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
  // null is "the company never stated it" (migration 0008), not a No.
  build_approach: null,
  build_methods: [],
  turnkey: null,
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
  // Keep null as null; only a stored true or false becomes a Yes or a No.
  turnkey: b?.turnkey == null ? null : Boolean(b.turnkey),
  build_approach: b?.build_approach ?? null,
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
  build_approach: f.build_approach || null,
  build_methods: f.build_methods,
  turnkey: f.turnkey == null ? null : Boolean(f.turnkey),
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

// ── Claiming ────────────────────────────────────────────────────────────────
// A claim code is 8 characters from A-HJ-NP-Z2-9 (no 0/O/1/I), the same
// alphabet as referral codes; the check constraint in 0007 enforces it.
// Signup.jsx may park a code from ?claim= under PENDING_CLAIM_KEY so the panel
// is prefilled after the email confirmation round trip; a successful claim
// clears it.
export const PENDING_CLAIM_KEY = "aduatlas.claim_code";
const CLAIM_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const normalizeCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

const readPendingClaim = () => {
  try {
    const v = window.localStorage.getItem(PENDING_CLAIM_KEY) || "";
    return CLAIM_CODE_RE.test(v) ? v : "";
  } catch {
    return "";
  }
};
const clearPendingClaim = () => {
  try {
    window.localStorage.removeItem(PENDING_CLAIM_KEY);
  } catch {
    // best effort only
  }
};

const claimErrorText = (error) => {
  if (error === "not-available") return "Claiming is not available right now. Try again in a minute.";
  if (error === "supabase-disabled") return "The account service is not connected in this environment.";
  if (/invalid or already used/i.test(error || "")) return "That claim code is not valid or has already been used. Check the invitation, or write to hello@aduatlas.com.";
  return error ? `Could not claim the listing: ${error}` : "Could not claim the listing.";
};

// Shown to a builder account that owns no profile yet, on the dashboard and
// here. `children` is the page's own "not listed yet?" line.
export const ClaimCodePanel = ({ onClaimed, children }) => {
  const [code, setCode] = useState(readPendingClaim);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const c = normalizeCode(code);
    if (!CLAIM_CODE_RE.test(c)) {
      setError("A claim code is eight letters and numbers, as printed in our invitation.");
      return;
    }
    setBusy(true);
    const r = await claimMyBuilder(c);
    setBusy(false);
    const { builder, error: err } = unwrap(r);
    if (err || !builder) {
      setError(claimErrorText(err));
      return;
    }
    clearPendingClaim();
    onClaimed?.(builder);
  };

  return (
    <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9 mb-6">
      <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-3">
        <FiKey aria-hidden /> Already listed on ADUAtlas?
      </p>
      <h2 className="font-display text-paper text-2xl sm:text-3xl leading-tight mb-3">Enter your claim code</h2>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
        ADUAtlas lists builders from public information before they join. If we invited you, the invitation carries an eight character claim code. Enter it to take over your listing, and your referral link and your dashboard open with it.
      </p>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-5 max-w-xl">
        To be straight with you about the counts: for every listing we publish, claimed or not, ADUAtlas records the times the profile was opened and the times a homeowner asked for an introduction. Claiming is what gives you the dashboard to read them in, the referral link and the Verified badge. It does not start the recording.
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-md">
        <input
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          maxLength={8}
          placeholder="ABCD2345"
          aria-label="Claim code"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-canvas border border-stroke rounded-xl px-4 py-3 text-paper font-mono text-base uppercase tracking-[0.2em] focus:outline-none focus:border-accent"
        />
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim disabled:opacity-60 whitespace-nowrap press">
          {busy ? "Claiming…" : "Claim my listing"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-700 mt-3 max-w-xl">
          {error}
        </p>
      )}
      {children}
    </section>
  );
};

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

// Yes, No, Not stated. A two-state switch forced every builder into a Yes or a
// No, which made a blank field read as a No on the homeowner's screen. Not
// stated saves null and the homeowner surfaces leave the attribute out.
const TRI_OPTIONS = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
  { value: null, label: "Not stated" },
];

const TriState = ({ label, hint, value, onChange }) => {
  const current = value == null ? null : Boolean(value);
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 bg-surface-1-solid border border-stroke rounded-2xl p-4">
      <div>
        <p className="text-paper text-sm font-medium">{label}</p>
        {hint && <p className="text-paper-dim text-xs mt-1 leading-relaxed">{hint}</p>}
      </div>
      <div role="radiogroup" aria-label={label} className="shrink-0 flex rounded-xl border border-stroke overflow-hidden self-start">
        {TRI_OPTIONS.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={current === o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition ${current === o.value ? "bg-accent text-accent-fg" : "bg-canvas text-paper-dim hover:text-paper"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const Section = ({ title, intro, children }) => (
  <section className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-7 space-y-4">
    <div>
      <h2 className="font-display text-paper text-xl">{title}</h2>
      {intro && <p className="text-paper-dim text-sm mt-1">{intro}</p>}
    </div>
    {children}
  </section>
);

const chip = "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1-solid border border-stroke text-xs text-paper";

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

  const onClaimed = (builder) => {
    setRow(builder);
    setF(toForm(builder));
    setError("");
    setNotice("Listing claimed. Review the details below and save any changes.");
  };

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
  // relationship_type arrives with 0007; a row from an older database reads
  // as marketplace, which is also the column default.
  const relationship = row?.relationship_type || "marketplace";
  const relationshipLabel = RELATIONSHIP_LABELS?.[relationship] || relationship;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <Link to="/builder" className="tap-target inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
        <FiArrowLeft /> Dashboard
      </Link>
      <div className="mb-8">
        <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">{isNew ? "Set up your company profile" : "Your company profile"}</h1>
        <p className="text-paper-dim text-base max-w-2xl">
          {isNew
            ? "This is what homeowners see in the directory. Claim the listing ADUAtlas already created for you, or fill in the form, save it as a draft and submit it when it is ready for review."
            : status === "approved"
              ? "Your listing is live. Changes you save here appear in the directory right away."
              : status === "pending"
                ? "Your profile is under review. You can keep editing it."
                : status === "inactive"
                  ? "Your listing is inactive. You can still update the profile; contact us to reactivate it."
                  : "Your profile is a draft. Homeowners will see it once you submit it and ADUAtlas approves it."}
        </p>
        {row && (
          <div className="mt-3 flex flex-wrap gap-2">
            {status && <p className={chip}>Status: {PROFILE_STATUS_LABELS?.[status] || status}</p>}
            <p className={chip} title="Set by ADUAtlas. Write to us if it should change.">
              Relationship: {relationshipLabel}
            </p>
            {isVerified(row) && <p className={chip}>Verified</p>}
          </div>
        )}
        {relationship === "affiliate" && row?.external_tracking_url && (
          <p className="text-paper-dim text-xs leading-relaxed mt-3 max-w-2xl">
            Your partner tracking link: <span className="font-mono text-paper break-all">{row.external_tracking_url}</span>. ADUAtlas recorded it with you; write to us to change it.
          </p>
        )}
      </div>

      {isNew && (
        <ClaimCodePanel onClaimed={onClaimed}>
          <p className="text-paper-dim text-sm mt-5">Not listed yet? Fill in the profile below and save it as a draft.</p>
        </ClaimCodePanel>
      )}

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
          <Field label="Build approach" hint="Leave this at Not stated if you would rather not answer. Your profile then leaves the line out instead of showing a guess.">
            <select value={f.build_approach ?? ""} onChange={(e) => set("build_approach", e.target.value || null)} className={input}>
              <option value="">Not stated</option>
              {Object.entries(APPROACH_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <TriState
            label="Turnkey"
            hint={`${TURNKEY_HELP} Choose Not stated if you would rather not answer, and your profile leaves the line out.`}
            value={f.turnkey}
            onChange={(v) => set("turnkey", v)}
          />
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
