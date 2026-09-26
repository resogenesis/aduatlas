import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiCopy, FiExternalLink, FiEyeOff, FiLink, FiPlus, FiRefreshCw, FiTrash2, FiUpload, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { APPROACH_LABELS, BUILD_METHOD_LABELS, PROFILE_STATUS_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, TURNKEY_HELP, publicUrl } from "../../lib/builders";

// Builder database management + introduction requests (Phase 1 scope §7).
// A builder record is either admin-managed or a self-serve profile owned by a
// 'pro' account (draft, then pending, then approved here). Each builder has a
// referral link (https://aduatlas.com/?ref=<code>); the page shows raw event
// counts for it. Attribution only. The terms on the record (free period,
// membership, success fee) are recorded, not billed: nothing here charges a
// card.
const REFERRAL_BASE = "https://aduatlas.com/?ref=";
const STATUS_TONE = {
  draft: "bg-paper-dim/15 text-paper-dim",
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-accent/15 text-accent",
  inactive: "bg-red-500/15 text-red-700",
};
// Rows from before migration 0006 carry no profile_status; read `active` as
// the status so the table keeps rendering until 0006 is applied.
const statusOf = (b) => b.profile_status || (b.active === false ? "inactive" : "approved");
const EVENT_COUNTS = [
  ["visits", "Link visits"],
  ["emails", "Emails captured"],
  ["accounts", "Accounts created"],
  ["purchases", "Packages purchased"],
  ["profile_views", "Profile views"],
  ["contacts", "Contacts"],
  ["projects_signed", "Projects signed"],
];
const count = (s, k) => (s && s[k] != null ? s[k] : "—");
const dollars = (cents) => `$${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");
const refSummary = (s) => {
  if (!s) return "—";
  if (s.visits != null) return `${s.visits} visits · ${s.emails} emails · ${s.accounts} accounts · ${s.projects_signed} signed`;
  return `${s.leads_count} leads · ${s.paid_count} paid`;
};

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
const csv = (arr) => (arr || []).join(", ");
const fromCsv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const fromCsvUpper = (s) => fromCsv(s).map((x) => x.toUpperCase());

const EMPTY = {
  name: "", description: "", website: "", external_link: "",
  address_line: "", city: "", state: "CA", zip: "",
  contact_name: "", contact_email: "", contact_phone: "",
  service_states: "", cities: "", service_zips: "",
  specialties: [], build_methods: [], service_types: [], build_approach: "both", turnkey: false, licensed_states: "",
  videos: "", commercial_terms: "", admin_notes: "", active: true, featured: false,
};
// Row -> form: arrays become comma lists, videos one per line.
const toForm = (b) => ({ ...EMPTY, ...b, cities: csv(b.cities), service_zips: csv(b.service_zips), service_states: csv(b.service_states), licensed_states: csv(b.licensed_states), videos: (b.videos || []).join("\n") });
// Form -> save body. profile_status is left out on purpose: status moves only
// through Approve / Set inactive, so a form opened before a builder submitted
// for review cannot overwrite that submission on save.
const toPayload = (f) => {
  const payload = { ...f, cities: fromCsv(f.cities), service_zips: fromCsv(f.service_zips), service_states: fromCsvUpper(f.service_states), licensed_states: fromCsvUpper(f.licensed_states), videos: String(f.videos || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean) };
  delete payload.profile_status;
  return payload;
};

const Toggle = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(options).map(([k, label]) => {
      const on = value.includes(k);
      return (
        <button key={k} type="button" onClick={() => onChange(on ? value.filter((v) => v !== k) : [...value, k])} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${on ? "bg-accent text-accent-fg border-accent" : "border-stroke text-paper-dim hover:text-paper"}`}>
          {label}
        </button>
      );
    })}
  </div>
);

const Field = ({ label, children }) => (
  <label className="block text-sm">
    <span className="text-paper-dim text-xs">{label}</span>
    {children}
  </label>
);
const input = "mt-1 w-full bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper";
const inputRO = `${input} opacity-70 cursor-default`;

const Section = ({ title, hint, children }) => (
  <section className="pt-5 border-t border-stroke first:pt-0 first:border-t-0 space-y-4">
    <div>
      <h3 className="text-paper text-sm font-semibold">{title}</h3>
      {hint && <p className="text-paper-dim text-xs mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

const StatusBadge = ({ status }) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[status] || STATUS_TONE.draft}`}>{PROFILE_STATUS_LABELS[status] || status}</span>;

const Drawer = ({ builder, stats, onClose, onChanged }) => {
  const [f, setF] = useState(() => (builder ? toForm(builder) : EMPTY));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [signed, setSigned] = useState({ email: "", note: "" });
  const [linkEmail, setLinkEmail] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const status = statusOf(f);
  const hasStatus = f.profile_status !== undefined; // false until migration 0006 is applied
  const approved = status === "approved";
  const referralLink = f.referral_code ? `${REFERRAL_BASE}${f.referral_code}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. Select the link and copy it by hand.");
    }
  };

  const save = async () => {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const { builder: saved, warning } = await adminPost("builders/save", { builder: toPayload(f) });
      await onChanged();
      setF(toForm(saved));
      if (warning) setNotice(warning);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  // Approve / Set inactive. Only the status fields are merged back so edits
  // typed into the form but not yet saved survive the click.
  const applyStatus = async (path, body) => {
    setBusy("status");
    setError("");
    try {
      const { builder: b } = await adminPost(path, { id: f.id, ...body });
      setF((p) => ({ ...p, profile_status: b.profile_status, active: b.active, approved_at: b.approved_at, referral_code: b.referral_code || p.referral_code }));
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const markSigned = async () => {
    const email = signed.email.trim();
    if (!email) {
      setError("Enter the homeowner's ADUAtlas account email.");
      return;
    }
    setBusy("signed");
    setError("");
    setNotice("");
    try {
      await adminPost("builders/mark-project-signed", { builder_id: f.id, email, note: signed.note.trim() || undefined });
      setSigned({ email: "", note: "" });
      setNotice(`Recorded a signed project for ${f.name}.`);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  // Admin half of claiming: joins an existing builder ('pro') account to this
  // admin-created profile so the builder can log in to the portal. The server
  // matches the account by email and reports only found / not found.
  const linkOwner = async () => {
    const email = linkEmail.trim();
    if (!email) {
      setError("Enter the email the builder signed up with.");
      return;
    }
    setBusy("link");
    setError("");
    setNotice("");
    try {
      const { builder: b } = await adminPost("builders/link-owner", { id: f.id, email });
      setF((p) => ({ ...p, owner_user_id: b.owner_user_id }));
      setLinkEmail("");
      setNotice(`Linked a portal account to ${f.name}.`);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const upload = async (kind, file) => {
    if (!file || !f.id) return;
    setBusy(kind);
    setError("");
    try {
      const dataUrl = await readAsDataUrl(file);
      const { builder: b } = await adminPost("builders/upload", { id: f.id, kind, dataUrl, filename: file.name });
      setF((p) => ({ ...p, logo_path: b.logo_path, photos: b.photos }));
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const removePhoto = async (path) => {
    setBusy("rm");
    try {
      const { builder: b } = await adminPost("builders/remove-photo", { id: f.id, path });
      setF((p) => ({ ...p, logo_path: b.logo_path, photos: b.photos }));
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const del = async () => {
    if (!window.confirm(`Delete ${f.name}? Saved builders, introduction requests and referral events for it are removed too.`)) return;
    await adminPost("builders/delete", { id: f.id });
    await onChanged();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-paper/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-paper text-2xl">{f.id ? f.name : "New builder"}</h2>
            {f.id && <StatusBadge status={status} />}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-paper-dim hover:text-paper hover:bg-canvas" aria-label="Close">
            <FiX />
          </button>
        </div>

        <div className="space-y-5">
          <Section title="Company">
            <Field label="Company name">
              <input value={f.name} onChange={(e) => set("name", e.target.value)} className={input} />
            </Field>
            <Field label="Short bio">
              <textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} rows={4} className={input} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Website">
                <input value={f.website || ""} onChange={(e) => set("website", e.target.value)} className={input} placeholder="https://" />
              </Field>
              <Field label="One external link (portfolio, reviews)">
                <input value={f.external_link || ""} onChange={(e) => set("external_link", e.target.value)} className={input} placeholder="https://" />
              </Field>
            </div>
          </Section>

          <Section title="Location" hint="The business address. Homeowners see city and state only.">
            <Field label="Street address">
              <input value={f.address_line || ""} onChange={(e) => set("address_line", e.target.value)} className={input} />
            </Field>
            <div className="grid sm:grid-cols-[1fr_6rem_8rem] gap-4">
              <Field label="City">
                <input value={f.city || ""} onChange={(e) => set("city", e.target.value)} className={input} />
              </Field>
              <Field label="State">
                <input value={f.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} className={input} />
              </Field>
              <Field label="ZIP">
                <input value={f.zip || ""} onChange={(e) => set("zip", e.target.value)} className={input} />
              </Field>
            </div>
          </Section>

          <Section title="Contact" hint="Contact name stays internal. Email and phone show on the profile.">
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Contact name">
                <input value={f.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} className={input} />
              </Field>
              <Field label="Contact email">
                <input value={f.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} className={input} />
              </Field>
              <Field label="Contact phone">
                <input value={f.contact_phone || ""} onChange={(e) => set("contact_phone", e.target.value)} className={input} />
              </Field>
            </div>
          </Section>

          <Section title="Service area" hint="Where this builder takes projects. The directory filters by state first.">
            <Field label="States served (two-letter codes, comma separated)">
              <input value={f.service_states} onChange={(e) => set("service_states", e.target.value.toUpperCase())} className={input} placeholder="CA, NV" />
            </Field>
            <Field label="Cities / areas served (comma separated)">
              <input value={f.cities} onChange={(e) => set("cities", e.target.value)} className={input} placeholder="Pasadena, Glendale, Altadena" />
            </Field>
            <Field label="ZIP codes or prefixes served (optional, comma separated)">
              <input value={f.service_zips} onChange={(e) => set("service_zips", e.target.value)} className={input} placeholder="911, 90041" />
            </Field>
          </Section>

          <Section title="What they build">
            <div>
              <p className="text-paper-dim text-xs mb-2">ADU types</p>
              <Toggle options={SPECIALTY_LABELS} value={f.specialties || []} onChange={(v) => set("specialties", v)} />
            </div>
            <div>
              <p className="text-paper-dim text-xs mb-2">Build methods</p>
              <Toggle options={BUILD_METHOD_LABELS} value={f.build_methods || []} onChange={(v) => set("build_methods", v)} />
            </div>
            <div>
              <p className="text-paper-dim text-xs mb-2">Services</p>
              <Toggle options={SERVICE_TYPE_LABELS} value={f.service_types || []} onChange={(v) => set("service_types", v)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <Field label="Build approach">
                <select value={f.build_approach} onChange={(e) => set("build_approach", e.target.value)} className={input}>
                  {Object.entries(APPROACH_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pb-2">
                <label className="inline-flex items-center gap-2 text-paper text-sm">
                  <input type="checkbox" checked={Boolean(f.turnkey)} onChange={(e) => set("turnkey", e.target.checked)} /> Turnkey
                </label>
                <p className="text-paper-dim text-xs mt-1">{TURNKEY_HELP}</p>
              </div>
            </div>
            <Field label="Licensed in (two-letter codes, comma separated; separate from service area)">
              <input value={f.licensed_states} onChange={(e) => set("licensed_states", e.target.value.toUpperCase())} className={input} placeholder="CA" />
            </Field>
          </Section>

          <Section title="Media">
            <Field label="Video links, up to 2 (YouTube or Vimeo, one per line)">
              <textarea value={f.videos || ""} onChange={(e) => set("videos", e.target.value)} rows={2} className={input} />
            </Field>
            {f.id ? (
              <>
                <div>
                  <p className="text-paper-dim text-xs mb-2">Logo</p>
                  <div className="flex items-center gap-4">
                    {f.logo_path && <img src={publicUrl(f.logo_path)} alt="" className="h-12 w-auto object-contain rounded-lg bg-canvas p-1" />}
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke text-sm text-paper cursor-pointer hover:border-accent">
                      <FiUpload /> {busy === "logo" ? "Uploading…" : f.logo_path ? "Replace logo" : "Upload logo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => upload("logo", e.target.files?.[0])} />
                    </label>
                  </div>
                </div>
                <div>
                  <p className="text-paper-dim text-xs mb-2">Project photos ({(f.photos || []).length} of 3)</p>
                  <div className="flex flex-wrap gap-3 items-center">
                    {(f.photos || []).map((p) => (
                      <div key={p} className="relative">
                        <img src={publicUrl(p)} alt="" className="w-24 h-24 object-cover rounded-lg" />
                        <button type="button" onClick={() => removePhoto(p)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-canvas border border-stroke text-paper-dim hover:text-red-700 text-xs" aria-label="Remove photo">
                          ×
                        </button>
                      </div>
                    ))}
                    {(f.photos || []).length < 3 && (
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke text-sm text-paper cursor-pointer hover:border-accent">
                        <FiUpload /> {busy === "photo" ? "Uploading…" : "Add photo"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => upload("photo", e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-paper-dim text-xs">Create the builder first to upload a logo and project photos.</p>
            )}
          </Section>

          <Section title="Terms" hint="Recorded terms, not billed. Nothing here charges a card.">
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Free period">
                <input readOnly value={`${f.intro_days ?? 90} days`} className={inputRO} />
              </Field>
              <Field label="Membership after that">
                <input readOnly value={`${dollars(f.membership_price_cents ?? 4900)} per month`} className={inputRO} />
              </Field>
              <Field label="Success fee per signed project">
                <input readOnly value={dollars(f.success_fee_cents ?? 50000)} className={inputRO} />
              </Field>
            </div>
            <Field label="Commercial terms (internal notes on this builder's terms)">
              <textarea value={f.commercial_terms || ""} onChange={(e) => set("commercial_terms", e.target.value)} rows={3} className={input} />
            </Field>
          </Section>

          <Section title="Admin">
            {f.id ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={status} />
                  {approved && f.active === false && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-paper-dim/15 text-paper-dim">Hidden (active is off)</span>}
                  <span className="text-paper-dim text-xs">
                    {[f.approved_at ? `Approved ${shortDate(f.approved_at)}` : null, f.joined_at ? `Joined ${shortDate(f.joined_at)}` : null, f.owner_user_id ? "Builder-managed account" : "Admin-managed profile"].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {hasStatus ? (
                  <div className="flex flex-wrap gap-2">
                    {!approved && (
                      <button type="button" onClick={() => applyStatus("builders/approve")} disabled={busy === "status"} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim disabled:opacity-60">
                        <FiCheck /> Approve
                      </button>
                    )}
                    {status !== "inactive" && (
                      <button type="button" onClick={() => applyStatus("builders/set-status", { status: "inactive" })} disabled={busy === "status"} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-stroke text-paper text-sm font-medium hover:border-red-600 hover:text-red-700 disabled:opacity-60">
                        <FiEyeOff /> Set inactive
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-paper-dim text-xs">Approve and Set inactive appear once migration 0006 is applied. Until then the Active checkbox controls visibility.</p>
                )}
                {hasStatus && !f.owner_user_id && (
                  <div className="rounded-xl border border-stroke p-4 space-y-3">
                    <div>
                      <p className="text-paper text-sm font-medium">Link portal account</p>
                      <p className="text-paper-dim text-xs mt-0.5">Give this profile to a builder account so they can log in and manage it. The builder signs up at ADUAtlas first; enter the email they used.</p>
                    </div>
                    <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                      <input type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="builder account email" aria-label="Builder account email" className="bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper text-sm" />
                      <button type="button" onClick={linkOwner} disabled={busy === "link"} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-stroke text-sm text-paper hover:border-accent whitespace-nowrap disabled:opacity-60">
                        <FiLink /> {busy === "link" ? "Linking…" : "Link account"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-paper-dim text-xs">Profiles created here go live as approved. Builder-submitted profiles arrive as pending and wait for Approve.</p>
            )}
            <Field label="Admin notes (internal)">
              <textarea value={f.admin_notes || ""} onChange={(e) => set("admin_notes", e.target.value)} rows={3} className={input} />
            </Field>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="inline-flex items-center gap-2 text-paper">
                <input type="checkbox" checked={f.active !== false} onChange={(e) => set("active", e.target.checked)} /> Active (listed once approved)
              </label>
              <label className="inline-flex items-center gap-2 text-paper">
                <input type="checkbox" checked={Boolean(f.featured)} onChange={(e) => set("featured", e.target.checked)} /> Featured on the public page
              </label>
            </div>
          </Section>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && <p className="text-sm text-paper-dim">{notice}</p>}
          <div className="flex flex-wrap gap-3">
            <button onClick={save} disabled={busy === "save"} className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim disabled:opacity-60">
              {busy === "save" ? "Saving…" : f.id ? "Save changes" : "Create builder"}
            </button>
            {f.id && (
              <button onClick={del} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stroke text-red-700 text-sm font-medium hover:border-red-600">
                <FiTrash2 /> Delete
              </button>
            )}
          </div>

          {f.id && (
            <Section title="Referral link">
              {approved && referralLink ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input readOnly value={referralLink} onFocus={(e) => e.target.select()} aria-label="Referral link" className="flex-1 bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper font-mono text-sm" />
                  <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-stroke text-sm text-paper hover:border-accent whitespace-nowrap">
                    <FiCopy /> {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : approved ? (
                <p className="text-paper-dim text-sm">Save changes to generate this builder's link.</p>
              ) : (
                <p className="text-paper-dim text-sm">The link is shown once the profile is approved.</p>
              )}
              <p className="text-paper-dim text-xs">Homeowners who arrive through this link are attributed to {f.name} when they leave an email, create an account or buy a package.</p>
            </Section>
          )}

          {f.id && (
            <Section title="Referral activity" hint="Raw event counts for this builder. No funnel stages are defined and no money moves.">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {EVENT_COUNTS.map(([k, label]) => (
                  <div key={k} className="rounded-xl border border-stroke px-3 py-2">
                    <p className="text-paper-dim text-xs">{label}</p>
                    <p className="text-paper text-lg font-semibold">{count(stats, k)}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-stroke px-3 py-2">
                  <p className="text-paper-dim text-xs">Purchase total</p>
                  <p className="text-paper text-lg font-semibold">{stats && stats.purchase_amount_cents != null ? dollars(stats.purchase_amount_cents) : "—"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-stroke p-4 space-y-3">
                <div>
                  <p className="text-paper text-sm font-medium">Mark a project signed</p>
                  <p className="text-paper-dim text-xs mt-0.5">Records a project_signed event for this builder against a homeowner account. The homeowner is looked up by account email on the server.</p>
                </div>
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <input type="email" value={signed.email} onChange={(e) => setSigned((p) => ({ ...p, email: e.target.value }))} placeholder="homeowner account email" aria-label="Homeowner account email" className="bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper text-sm" />
                  <input value={signed.note} onChange={(e) => setSigned((p) => ({ ...p, note: e.target.value }))} placeholder="Note (optional)" aria-label="Note" className="bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper text-sm" />
                  <button type="button" onClick={markSigned} disabled={busy === "signed"} className="px-4 py-2 rounded-lg border border-stroke text-sm text-paper hover:border-accent whitespace-nowrap disabled:opacity-60">
                    {busy === "signed" ? "Recording…" : "Record"}
                  </button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS = { requested: "Requested", sent: "Introduction sent", declined: "Declined" };

const AdminBuilders = () => {
  const [tab, setTab] = useState("builders");
  const [items, setItems] = useState(null);
  const [intros, setIntros] = useState(null);
  const [stats, setStats] = useState({}); // builder_id -> referral_stats row
  const [error, setError] = useState("");
  const [active, setActive] = useState(null); // builder | "new" | null
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = () =>
    Promise.all([adminGet("builders/list"), adminGet("builders/intros")])
      .then(([b, i]) => {
        setItems(b.items);
        setIntros(i.items);
        // Referral counts are a nice-to-have: if the endpoint is not available
        // yet (migration 0005 not applied) the column just shows a dash.
        return adminGet("builders/referrals")
          .then((r) => setStats(Object.fromEntries((r.items || []).map((row) => [row.builder_id, row]))))
          .catch(() => setStats({}));
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const pending = useMemo(() => (items || []).filter((b) => statusOf(b) === "pending").length, [items]);
  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items || []).filter((b) => (!statusFilter || statusOf(b) === statusFilter) && (!n || [b.name, b.state, b.city, b.contact_name, ...(b.cities || []), ...(b.service_states || [])].filter(Boolean).join(" ").toLowerCase().includes(n)));
  }, [items, q, statusFilter]);

  const updateIntro = async (id, patch) => {
    try {
      await adminPost("builders/intro-update", { id, ...patch });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const activeBuilder = active === "new" ? null : (items || []).find((b) => b.id === active?.id) || active;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05]">Builders</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-stroke overflow-hidden">
            {["builders", "intros"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium ${tab === t ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper"}`}>
                {t === "builders" ? `Profiles (${(items || []).length}${pending ? `, ${pending} pending` : ""})` : `Introductions (${(intros || []).filter((i) => i.status === "requested").length} open)`}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-xl text-paper-dim hover:text-paper border border-stroke" aria-label="Refresh">
            <FiRefreshCw />
          </button>
          {tab === "builders" && (
            <button onClick={() => setActive("new")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim">
              <FiPlus /> New builder
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>}

      {tab === "builders" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, state, city or contact" className="w-full max-w-md bg-canvas border border-stroke rounded-xl px-4 py-2.5 text-paper text-sm" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="bg-canvas border border-stroke rounded-xl px-3 py-2.5 text-paper text-sm">
              <option value="">All statuses</option>
              {Object.entries(PROFILE_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {items && visible.length === 0 && <p className="text-paper-dim text-sm">{items.length ? "No builders match that filter." : "No builders yet. Add the first profile."}</p>}
          {visible.length > 0 && (
            <div className="overflow-x-auto border border-stroke rounded-2xl">
              <table className="w-full text-sm">
                <thead className="text-paper-dim text-xs text-left">
                  <tr>
                    <th className="px-4 py-3">Builder</th>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3">Builds</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Referrals</th>
                    <th className="px-4 py-3">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => {
                    const s = statusOf(b);
                    return (
                      <tr key={b.id} onClick={() => setActive(b)} className="border-t border-stroke hover:bg-surface-1-solid cursor-pointer">
                        <td className="px-4 py-3">
                          <p className="text-paper font-medium">{b.name}</p>
                          {b.contact_name && <p className="text-paper-dim text-xs">{b.contact_name}</p>}
                        </td>
                        <td className="px-4 py-3 text-paper-dim">
                          <p>{[...(b.cities || []).slice(0, 2), b.state].join(", ")}</p>
                          {(b.service_states || []).length > 0 && <p className="text-xs">Serves {b.service_states.join(", ")}</p>}
                        </td>
                        <td className="px-4 py-3 text-paper-dim">
                          <p>{(b.specialties || []).map((x) => SPECIALTY_LABELS[x]).join(", ") || "—"}</p>
                          {((b.build_methods || []).length > 0 || b.turnkey) && <p className="text-xs">{[...(b.build_methods || []).map((m) => BUILD_METHOD_LABELS[m] || m), b.turnkey ? "Turnkey" : null].filter(Boolean).join(" · ")}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={s} />
                            {b.featured && <span className="text-paper-dim text-xs">featured</span>}
                            {s === "approved" && b.active === false && <span className="text-paper-dim text-xs">hidden</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-paper-dim whitespace-nowrap">{refSummary(stats[b.id])}</td>
                        <td className="px-4 py-3 text-paper-dim">{[(b.logo_path && "logo"), (b.photos || []).length ? `${b.photos.length} photo${b.photos.length > 1 ? "s" : ""}` : null, (b.videos || []).length ? `${b.videos.length} video${b.videos.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "intros" && (
        <>
          {intros && intros.length === 0 && <p className="text-paper-dim text-sm">No introduction requests yet.</p>}
          {intros && intros.length > 0 && (
            <div className="overflow-x-auto border border-stroke rounded-2xl">
              <table className="w-full text-sm">
                <thead className="text-paper-dim text-xs text-left">
                  <tr>
                    <th className="px-4 py-3">Homeowner</th>
                    <th className="px-4 py-3">Builder</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {intros.map((i) => (
                    <tr key={i.id} className="border-t border-stroke align-top">
                      <td className="px-4 py-3">
                        <p className="text-paper">{i.homeowner_email}</p>
                        <p className="text-paper-dim text-xs">{i.homeowner_tier} · {i.homeowner_address || "no address"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-paper">{i.builder_name}</p>
                        {i.builder_contact && <p className="text-paper-dim text-xs inline-flex items-center gap-1"><FiExternalLink /> {i.builder_contact}</p>}
                      </td>
                      <td className="px-4 py-3 text-paper-dim max-w-xs whitespace-pre-line">{i.message || "—"}</td>
                      <td className="px-4 py-3 text-paper-dim">{new Date(i.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <select value={i.status} onChange={(e) => updateIntro(i.id, { status: e.target.value })} className="bg-canvas border border-stroke rounded-lg px-2 py-1.5 text-paper text-xs">
                          {Object.entries(STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {active && <Drawer key={active === "new" ? "new" : active.id} builder={activeBuilder} stats={activeBuilder ? stats[activeBuilder.id] : null} onClose={() => setActive(null)} onChanged={load} />}
    </div>
  );
};

export default AdminBuilders;
