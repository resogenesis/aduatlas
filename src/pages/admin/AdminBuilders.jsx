import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiCopy, FiExternalLink, FiEyeOff, FiKey, FiLink, FiMail, FiPlus, FiRefreshCw, FiSend, FiShield, FiShieldOff, FiTrash2, FiUpload, FiUserX, FiX } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";
import { planById } from "../../lib/plans";
import { APPROACH_LABELS, BUILD_METHOD_LABELS, PROFILE_STATUS_LABELS, RELATIONSHIP_LABELS, SERVES_LABELS, SERVICE_TYPE_LABELS, SPECIALTY_LABELS, TURNKEY_HELP, VERIFIED_BADGE_LABEL, VERIFIED_HELP, VERIFIED_LIMITS, hasPricing, isApproachKnown, isCommercialKnown, isResidentialKnown, isTurnkeyKnown, isVerified, publicUrl } from "../../lib/builders";

// Builder database management + introduction requests (Phase 1 scope §7).
// Two kinds of listing (0007). UNCLAIMED: seeded by ADUAtlas, no owner, no
// working referral link, no analytics, no badge. CLAIMED: a 'pro' account
// owns the row, through a claim code issued here or through Link portal
// account. Claiming turns tracking on. Verified is a separate step after the
// claim and means only "profile claimed and business information verified by
// ADUAtlas". Each builder has a referral link (https://aduatlas.com/?ref=<code>)
// that resolves only for a claimed, approved profile; the page shows raw
// event counts for it. Attribution only. The terms on the record (free
// period, membership, success fee) are recorded, not billed: nothing here
// charges a card.
//
// UNKNOWN MEANS UNKNOWN (0008). Turnkey and build approach are yes, no or not
// stated. Not stated is what ADUAtlas records when the company's own material
// never said it, and no surface fills the gap with a default: the homeowner
// pages leave the row out instead.
//
// SOURCES, PUBLISHED PRICING AND WHO THEY BUILD FOR (0017, decision 2f). Three
// more things Amy maintains here, and deliberately nothing wider.
//   Sources    the pages of the company's OWN site a fact on the record came
//              from, plus the date ADUAtlas last read them. The Arizona research
//              read them for all 96 companies and there was nowhere to put them,
//              so the evidence was thrown away at import. The table row shows the
//              count, so a record standing on nothing is visible at a glance.
//   Pricing    what the COMPANY publishes about price, in its own words, with the
//              page it was published on. It is NOT the ADUAtlas terms further
//              down this drawer: those are what ADUAtlas charges the BUILDER, and
//              the two sections are labelled and styled apart on purpose, because
//              the day somebody reads one as the other is expensive.
//   Residential / commercial   three options, never a checkbox. A checkbox has
//              two states and cannot tell "they told us no" from "nobody asked",
//              which is the defect 0008 fixed for turnkey (decision 2b).
// Nothing here is derived, estimated or inferred from the ADU types, the build
// methods or anything else, a new builder starts unknown on all three, and no
// field has to be filled because it exists.
//
// THE BADGE (decision 2e) is read through isVerified, the way homeowners read it
// (checked AND still claimed), so this console never shows a badge the directory
// has already dropped. It reads "Verified on ADUAtlas" here too, from
// VERIFIED_BADGE_LABEL, with VERIFIED_HELP for what the check covers and
// VERIFIED_LIMITS for what it does not. FOUR STATES stay distinct on every row
// and in the drawer header, and none of them implies another:
//   Unclaimed           the claim pill, and no badge.
//   Claimed             the claim pill, no badge, verification still to do.
//   Verified            the claim pill and the badge.
//   Affiliate, Partner  the relationship, shown as plain text next to them. A
//                       commercial arrangement is NOT verification, and it is
//                       invisible to homeowners: relationship_type is in neither
//                       public view.
//
// CONTACT DETAILS (decision 2d, migration 0010). Email and phone are gated on the
// CLAIM, not on the homeowner's plan. An unclaimed listing's contact details are
// hidden from every homeowner, paying or not, and ADUAtlas forwards the
// introduction by hand instead. The console itself reads the builders table
// through the service role, so every contact field stays editable here whatever
// the listing state: Amy needs them to answer an introduction (decision 2f).
//
// THE TWO MAILS THAT LEAVE THIS CONSOLE (5.2, decision 8, 2h). Both go through
// /api/send-email in its admin mode, which resolves the RECIPIENT server-side
// from the record id. Neither request carries a `to`: the destination is an
// address ADUAtlas does not own, so the server reads it from the record rather
// than taking it from this page.
//   Invite to claim     offered on an UNCLAIMED listing that has a saved
//                       contact email, and recorded as invited_at. The copy
//                       offers to increase the company's visibility to
//                       homeowners looking for ADU builders and promises no
//                       leads, no traffic and no sales (5.2), and it carries no
//                       referral link, because the link comes with the claim.
//                       An unclaimed listing implies no participation (2a), so
//                       nothing here says the company has joined anything.
//   Forward to builder  relays a homeowner's introduction MESSAGE. The
//                       homeowner's name, email address and property address
//                       stay inside ADUAtlas: contact details reach a builder
//                       only if the homeowner volunteers them (decision 8). The
//                       ADUAtlas record is the system of record and the mail
//                       only notifies (2h), so the copy says ADUAtlas is
//                       relaying a message and promises the builder no portal
//                       reply that does not exist yet. Recorded as
//                       forwarded_at.
// Both need migration 0016. Where those columns are missing the action is shown
// but disabled with the reason, because a mail nothing recorded is a mail
// nobody can audit, and a second invitation would be indistinguishable from a
// first.
const REFERRAL_BASE = "https://aduatlas.com/?ref=";
// The state on a company record is typed by the admin. There is no default
// state: ADUAtlas works wherever the builders it lists work.
const STATE_RE = /^[A-Z]{2}$/;
// One tri-state vocabulary for the whole console, from lib/builders: turnkey,
// residential and commercial are the same kind of fact and read the same three
// words. "" is the absence of an answer, which is what null means in the column.
const NOT_STATED = SERVES_LABELS[""];
const TURNKEY_OPTIONS = SERVES_LABELS;
const STATUS_TONE = {
  draft: "bg-paper-dim/15 text-paper-dim",
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-accent/15 text-accent",
  inactive: "bg-red-500/15 text-red-700",
};
const PILL_TONE = {
  dim: "bg-paper-dim/15 text-paper-dim",
  accent: "bg-accent/15 text-accent",
  amber: "bg-amber-500/15 text-amber-700",
};
// Rows from before migration 0006 carry no profile_status; read `active` as
// the status so the table keeps rendering until 0006 is applied.
const statusOf = (b) => b.profile_status || (b.active === false ? "inactive" : "approved");
// Who confirmed a signed project. Same list as the RPC's check (0007).
const CONFIRMED_BY = { builder: "The builder", homeowner: "The homeowner", both: "Both" };
// The locked vocabulary: a view is a view and a click is a click. Neither is
// a lead. Conversations is the number of portal message threads homeowners have
// opened with this builder (2h), counted by builders/referrals; n/a means the
// count could not be read, never zero.
const EVENT_COUNTS = [
  ["profile_views", "Profile views"],
  ["visits", "Referral link clicks"],
  ["contacts", "Homeowner inquiries"],
  ["conversations", "Conversations"],
  ["projects_signed", "Signed projects"],
  ["emails", "Emails captured"],
  ["accounts", "Accounts created"],
  ["purchases", "Purchases"],
];
const count = (s, k) => (s && s[k] != null ? s[k] : "n/a");
const dollars = (cents) => `$${(Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const money = (s, k) => (s && s[k] != null ? dollars(s[k]) : "n/a");
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");
const today = () => new Date().toISOString().slice(0, 10);
const refSummary = (s) => {
  if (!s) return "No data";
  if (s.visits != null) return `${s.visits} clicks · ${s.profile_views} views · ${s.contacts} inquiries · ${s.projects_signed} signed`;
  return `${s.leads_count} emails · ${s.paid_count} paid`;
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

// A new builder starts with nothing stated: no state (the admin types the one
// the company is in), turnkey and build approach null until someone reads the
// company's own material and says, and 0017's three the same way: no sources
// recorded, no price established, residential and commercial both unknown. Null
// and empty here are the ABSENCE of an answer, never a stand-in for No (2b).
const EMPTY = {
  name: "", description: "", website: "", external_link: "",
  address_line: "", city: "", state: "", zip: "",
  contact_name: "", contact_email: "", contact_phone: "",
  service_states: "", cities: "", service_zips: "",
  specialties: [], build_methods: [], service_types: [], build_approach: null, turnkey: null, licensed_states: "",
  serves_residential: null, serves_commercial: null,
  pricing_note: "", pricing_source_url: "",
  source_urls: [], sources_checked_on: "",
  videos: "", commercial_terms: "", admin_notes: "", active: true, featured: false,
  relationship_type: "marketplace", external_tracking_url: "",
};
// A date column holds a day, and that day is printed as the day it holds.
// new Date("2026-09-25") is UTC midnight, which formats as the 24th anywhere west
// of Greenwich, and a provenance date that drifts by a day is one nobody can use.
const dateOnly = (v) => String(v || "").slice(0, 10);
// Empty means NOT ESTABLISHED and travels as null. An empty string would be a
// stored value, and a stored empty string is a claim that something was recorded.
const blankToNull = (v) => {
  const s = String(v ?? "").trim();
  return s || null;
};
const urlList = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);
const URL_RE = /^https?:\/\/\S+$/i;
// The 0017 limits from api/admin/_builders.js, mirrored here so this panel
// refuses what the route would refuse. The route is the authority; a save that
// comes back 400 after Amy typed six other edits is the avoidable version of the
// same answer. A pricing note is what a company publishes about price, not a
// price list, and a researched listing in the Arizona seed cites at most 7 pages.
const SOURCE_URLS_MAX = 20;
const PRICING_NOTE_MAX = 2000;
const SOURCE_URL_MAX = 300;
// The six columns migration 0017 adds. A database without it holds none of them.
const SOURCED_COLUMNS = ["source_urls", "sources_checked_on", "pricing_note", "pricing_source_url", "serves_residential", "serves_commercial"];

// Row -> form: arrays become comma lists, videos one per line. source_urls stays
// a list (the Sources panel adds and removes entries), and the checked date is
// held as the plain YYYY-MM-DD a date input wants.
const toForm = (b) => ({ ...EMPTY, ...b, cities: csv(b.cities), service_zips: csv(b.service_zips), service_states: csv(b.service_states), licensed_states: csv(b.licensed_states), source_urls: urlList(b.source_urls), sources_checked_on: dateOnly(b.sources_checked_on), videos: (b.videos || []).join("\n") });
// Form -> save body. profile_status is left out on purpose: status moves only
// through Approve / Set inactive, so a form opened before a builder submitted
// for review cannot overwrite that submission on save. The server takes only
// the fields it names, so claim, verification and audit columns cannot travel
// this way either.
// The six 0017 fields travel as their column types: source_urls a list of
// strings, sources_checked_on a YYYY-MM-DD day or null, the two pricing fields
// text or null, and serves_residential / serves_commercial true, false or null
// straight from the form, where null is "not stated" and not a missing value to
// be defaulted server-side.
const toPayload = (f, sourced = true) => {
  const payload = { ...f, cities: fromCsv(f.cities), service_zips: fromCsv(f.service_zips), service_states: fromCsvUpper(f.service_states), licensed_states: fromCsvUpper(f.licensed_states), source_urls: urlList(f.source_urls), sources_checked_on: blankToNull(dateOnly(f.sources_checked_on)), pricing_note: blankToNull(f.pricing_note), pricing_source_url: blankToNull(f.pricing_source_url), videos: String(f.videos || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean) };
  delete payload.profile_status;
  // Nothing to say and nowhere to put it: on a database without 0017 the six are
  // left out of the body altogether, so the route reports a field as unsaved only
  // where somebody actually sent one.
  if (!sourced) for (const key of SOURCED_COLUMNS) delete payload[key];
  return payload;
};
// Merge only the named keys from a server row into the form so edits typed
// but not yet saved survive a status, claim or verification click.
const pick = (b, keys) => Object.fromEntries(keys.filter((k) => b && k in b).map((k) => [k, b[k]]));

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
const smallInput = "bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper text-sm";
const ghostButton = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-stroke text-sm text-paper hover:border-accent whitespace-nowrap disabled:opacity-60";

const Section = ({ title, hint, children }) => (
  <section className="pt-5 border-t border-stroke first:pt-0 first:border-t-0 space-y-4">
    <div>
      <h3 className="text-paper text-sm font-semibold">{title}</h3>
      {hint && <p className="text-paper-dim text-xs mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

// A tri-state answer as THREE options, worded from SERVES_LABELS so every
// surface says the same thing. NEVER a checkbox: a checkbox has two states, and
// "they told us no" and "nobody ever asked" are different facts about a company
// (decision 2b). Blank selects the third option and stores null.
const TriState = ({ label, known, value, onChange, hint, disabled }) => (
  <div>
    <Field label={label}>
      <select value={known ? (value ? "yes" : "no") : ""} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "yes")} className={disabled ? inputRO : input}>
        {Object.entries(SERVES_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </Field>
    {hint && <p className="text-paper-dim text-xs mt-1">{hint}</p>}
  </div>
);

const StatusBadge = ({ status }) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[status] || STATUS_TONE.draft}`}>{PROFILE_STATUS_LABELS[status] || status}</span>;
const Pill = ({ tone = "dim", title, children }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PILL_TONE[tone]}`}>
    {children}
  </span>
);
const ClaimPill = ({ claimed }) => <Pill tone={claimed ? "accent" : "dim"}>{claimed ? "Claimed" : "Unclaimed"}</Pill>;
// Same words as the homeowner badge, from the same constant. The console is a
// different design language, so it is a pill rather than the VerifiedBadge
// component, but it is not a second badge with a second meaning.
const VerifiedPill = () => (
  <Pill tone="accent" title={`${VERIFIED_HELP}. ${VERIFIED_LIMITS}`}>
    <FiShield aria-hidden /> {VERIFIED_BADGE_LABEL}
  </Pill>
);
// The commercial relationship, shown next to the claim and badge pills so the
// two are never read as the same thing. Marketplace is the default and needs no
// pill; affiliate and partner do, because they are the states most easily
// mistaken for verification.
const RelationshipPill = ({ type }) =>
  !type || type === "marketplace" ? null : (
    <Pill title="The commercial arrangement with ADUAtlas. It is not verification and no homeowner surface shows it.">{RELATIONSHIP_LABELS[type] || type}</Pill>
  );

const Drawer = ({ builder, stats, onClose, onChanged }) => {
  const [f, setF] = useState(() => (builder ? toForm(builder) : EMPTY));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const [signed, setSigned] = useState({ email: "", confirmed_by: "", signed_on: "", note: "" });
  const [linkEmail, setLinkEmail] = useState("");
  // The source URL being typed. It is not part of the record until Add puts it
  // in the list, and the list is not saved until Save changes.
  const [sourceUrl, setSourceUrl] = useState("");
  // The claim code lives here and only here, for as long as this drawer is
  // open. Closing the drawer forgets it; the server never sends it again.
  const [issuedCode, setIssuedCode] = useState("");
  // The contact email as the SERVER has it. The invitation is mailed to the
  // saved record, so a typed-but-unsaved address must not read as the one that
  // would receive it.
  const [savedEmail, setSavedEmail] = useState(() => String(builder?.contact_email || "").trim());
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const status = statusOf(f);
  const hasStatus = f.profile_status !== undefined; // false until migration 0006 is applied
  const approved = status === "approved";
  const claimed = Boolean(f.owner_user_id);
  const verified = isVerified(f);
  // Mirrors builder_tracking_active() in 0007: the code resolves only for a
  // claimed, approved profile.
  const trackingActive = claimed && approved;
  const affiliate = f.relationship_type === "affiliate";
  const marketplace = (f.relationship_type || "marketplace") === "marketplace";
  // A row from a database without 0017 carries none of the six columns, and that
  // is not the same fact as "nothing recorded yet". The three panels below say
  // which it is and take no input, rather than accepting what Amy types and
  // dropping it on save. Read the SERVER row, not the form: EMPTY always has the
  // keys, so the form can never answer this question.
  const hasSourcedColumns = !builder?.id || "source_urls" in builder;
  const sourcedColumnsNote = "Migration 0017 is not applied to this database, so sources, published pricing and residential or commercial capability have nowhere to be stored. Nothing typed here could be saved.";
  const referralLink = f.referral_code ? `${REFERRAL_BASE}${f.referral_code}` : "";
  // The invitation (5.2). Unclaimed listings only, mailed by ADUAtlas to the
  // contact address on the saved row, and recorded as invited_at. A row from a
  // database without 0016 carries no invited_at key at all, which is not the
  // same fact as "never invited", so the action says so instead of guessing.
  const hasInvitedAt = Boolean(f.id) && "invited_at" in f;
  const typedEmail = String(f.contact_email || "").trim();
  const inviteBlocked = !hasInvitedAt
    ? "Migration 0016 is not applied: this listing reports no invited_at, so an invitation could not be recorded."
    : !savedEmail
      ? "No contact email on this listing. Add one under Contact, save, then invite."
      : typedEmail !== savedEmail
        ? `The contact email has unsaved edits. Save first: the invitation goes to the address on the saved record, ${savedEmail}.`
        : "";
  // What has already gone out, said plainly. A listing with no claim code yet is
  // named rather than blocked on, because the invitation issues the code it
  // carries; the panel above is only for handing a code over by hand.
  const inviteStatus = f.invited_at
    ? `Invited ${shortDate(f.invited_at)}${savedEmail ? ` at ${savedEmail}` : ""}. Send it again only if the company needs a reminder.`
    : `${savedEmail ? `Not invited yet. It would go to ${savedEmail}.` : "Not invited yet."}${f.claim_code_issued ? "" : " No claim code has been issued yet; the invitation issues one and carries it."}`;

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy failed. Select the text and copy it by hand.");
    }
  };

  // Provenance is a list Amy curates by hand. A source is a page on the
  // company's own site, so it has to be a URL; a duplicate is dropped rather
  // than recorded twice. Nothing here writes: Save changes does.
  const addSource = () => {
    const url = sourceUrl.trim();
    if (!url) return;
    if (!URL_RE.test(url) || url.length > SOURCE_URL_MAX) {
      setError(`A source is a full URL starting with http:// or https://, on the company's own site, up to ${SOURCE_URL_MAX} characters.`);
      return;
    }
    if ((f.source_urls || []).length >= SOURCE_URLS_MAX) {
      setError(`This record already cites ${SOURCE_URLS_MAX} pages, which is the limit. Remove one before adding another.`);
      return;
    }
    setError("");
    setF((prev) => ((prev.source_urls || []).includes(url) ? prev : { ...prev, source_urls: [...(prev.source_urls || []), url] }));
    setSourceUrl("");
  };
  const removeSource = (url) => setF((prev) => ({ ...prev, source_urls: (prev.source_urls || []).filter((u) => u !== url) }));

  const save = async () => {
    if (!String(f.name || "").trim()) {
      setError("Enter the company name.");
      return;
    }
    if (!STATE_RE.test(String(f.state || "").trim())) {
      setError("Enter the two-letter state code for this company, in capitals.");
      return;
    }
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const { builder: saved, warning } = await adminPost("builders/save", { builder: toPayload(f, hasSourcedColumns) });
      await onChanged();
      setF(toForm(saved));
      setSavedEmail(String(saved?.contact_email || "").trim());
      if (warning) setNotice(warning);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  // Approve / Set inactive / Verify / Unverify. Only the named fields are
  // merged back so edits typed into the form but not yet saved survive the
  // click.
  const applyServer = async (key, path, body, keys, done) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const { builder: b } = await adminPost(path, { id: f.id, ...body });
      setF((p) => ({ ...p, ...pick(b, keys), referral_code: b.referral_code || p.referral_code }));
      if (done) setNotice(done);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const applyStatus = (path, body) => applyServer("status", path, body, ["profile_status", "active", "approved_at"]);
  const verify = () => applyServer("verify", "builders/verify", {}, ["verified_at", "verified_by"], `${f.name} is now Verified.`);
  const unverify = () => applyServer("verify", "builders/unverify", {}, ["verified_at", "verified_by"], `Removed the Verified badge from ${f.name}.`);

  // The code is shown once, in the box below, then forgotten on close.
  // Issuing again retires the previous code, so the admin confirms that.
  const issueClaimCode = async () => {
    if (f.claim_code_issued && !window.confirm("Issue a new claim code? The previous code stops working.")) return;
    setBusy("claim");
    setError("");
    setNotice("");
    try {
      const { claim_code: code, builder: b } = await adminPost("builders/issue-claim-code", { id: f.id });
      setIssuedCode(code || "");
      setF((p) => ({ ...p, ...pick(b, ["claim_code_issued"]) }));
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  // ADUAtlas invites an unclaimed listing to claim itself. The request carries
  // the row id and no address: the server reads the contact email from the
  // record. A second invitation is possible, because a company may genuinely
  // need a reminder, and confirmed, because nothing about a reminder is
  // automatic. No claim code is shown here; this panel only sends.
  const invite = async () => {
    if (f.invited_at && !window.confirm(`${f.name} was invited ${shortDate(f.invited_at)}. Send the invitation again to ${savedEmail}?`)) return;
    setBusy("invite");
    setError("");
    setNotice("");
    try {
      const r = await adminPost("builders/invite", { id: f.id });
      setF((p) => ({ ...p, ...pick(r.builder, ["invited_at", "claim_code_issued"]) }));
      const said = [`Invitation sent to ${savedEmail}. It asks ${f.name} to claim this listing; nothing about the listing changes until they do.`];
      // The invitation carries a claim code and mints one where the listing had
      // none. That code is deliberately not shown here: it reached the company,
      // and this panel is not where a code that was never displayed appears.
      if (r.code_issued) said.push("It issued the claim code it carried, which is not shown here.");
      // The mail can leave and the stamp still fail. The route says so rather
      // than reporting a date the row does not hold.
      if (r.warning) said.push(r.warning);
      else if (!r.invited_at) said.push("The date it was recorded appears when this panel is reopened.");
      setNotice(said.join(" "));
      await onChanged();
    } catch (e) {
      // A failed send can still leave a claim code on the listing: the route mints
      // the code BEFORE it mails, so the invitation always carries a working one.
      // The listing is read back so this drawer shows the code state the server
      // holds, instead of "No code issued yet" beside a code that now exists and
      // that nobody received.
      const hadCode = Boolean(f.claim_code_issued);
      const fresh = await onChanged().catch(() => null);
      const row = Array.isArray(fresh) ? fresh.find((b) => b.id === f.id) : null;
      if (row) setF((p) => ({ ...p, ...pick(row, ["invited_at", "claim_code_issued"]) }));
      const minted = Boolean(row && !hadCode && row.claim_code_issued);
      setError(
        minted
          ? `${e.message}. A claim code was issued for this listing, but no invitation carried it, so nobody has it yet. Invite again once email is working, or use Re-issue code to hand one over yourself.`
          : e.message
      );
    } finally {
      setBusy("");
    }
  };
  const markSigned = async () => {
    const email = signed.email.trim();
    const note = signed.note.trim();
    if (!email) {
      setError("Enter the homeowner's ADUAtlas account email.");
      return;
    }
    if (!signed.confirmed_by) {
      setError("Say who confirmed the signing: the builder, the homeowner or both.");
      return;
    }
    if (!signed.signed_on) {
      setError("Enter the date the contract was signed.");
      return;
    }
    if (!note) {
      setError("Add a note saying what was signed and how it was confirmed.");
      return;
    }
    setBusy("signed");
    setError("");
    setNotice("");
    try {
      const r = await adminPost("builders/mark-project-signed", { builder_id: f.id, email, confirmed_by: signed.confirmed_by, signed_on: signed.signed_on, note });
      setSigned({ email: "", confirmed_by: "", signed_on: "", note: "" });
      // The homeowner may have arrived through a different builder's link. The
      // server sends origin_builder_name ONLY when that is another company, so
      // a name here is always worth showing: the fee attaches to whoever signed
      // the work, and the console says both names rather than leaving the
      // difference to be found later.
      const origin = r.origin_builder_name ? ` Origin builder: ${r.origin_builder_name}. The fee attaches to ${f.name}.` : "";
      // already_recorded comes from the server's "inserted" flag, the only
      // thing that separates a fresh record from the one already on file.
      if (r.already_recorded) {
        setNotice(`A signed project for that homeowner and ${f.name} was already on record. Nothing changed.${origin}`);
      } else {
        const fee = r.event?.fee_applies == null ? "" : r.event.fee_applies ? " The standard success fee applies (recorded, not billed)." : " The standard fee does not apply; this relationship follows its own terms.";
        setNotice(`Recorded a signed project for ${f.name}.${fee}${origin}`);
      }
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  // Admin half of claiming: joins an existing builder ('pro') account to this
  // profile so the builder can log in to the portal. The server matches the
  // account by email, reports only found / not found, and stamps the claim.
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
      // verified_at and verified_by come back cleared: ADUAtlas checked the
      // company that held the listing before, so the badge does not travel to
      // the new owner.
      setF((p) => ({ ...p, ...pick(b, ["owner_user_id", "claimed_at", "claim_code_issued", "verified_at", "verified_by"]) }));
      setLinkEmail("");
      setIssuedCode("");
      setNotice(`Linked a portal account to ${f.name}. The profile is now claimed.`);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  // The other half of ownership: release a claimed listing from its portal
  // account (a claim that went to the wrong account, or a company that changed
  // hands). The listing becomes unclaimed; the database clears the Verified badge
  // and the claim date on any change of owner, and the response says what the row
  // holds afterwards. A transfer is a release followed by Link portal account.
  // Conversations (0011) belong to the LISTING, not the account: a thread is
  // keyed on builder_id and owns_builder_conversation() on builders.owner_user_id,
  // so the released account loses every thread at once, the homeowner can still
  // write in it (is_conversation_homeowner is untouched), and whichever account
  // holds the listing next reads the whole history. The copy says exactly that.
  const release = async () => {
    if (!window.confirm(`Release ${f.name} from its portal account? The listing becomes unclaimed: that account can no longer edit it or read and reply to its conversations with homeowners, the referral link stops working, homeowners no longer see its email and phone, and the Verified badge is removed. The conversations stay with the listing, and the next account that claims it or is linked to it sees all of them, earlier messages included. The builder account itself is not deleted.`)) return;
    setBusy("release");
    setError("");
    setNotice("");
    try {
      const r = await adminPost("builders/unlink-owner", { id: f.id });
      setF((p) => ({ ...p, ...pick(r.builder, ["owner_user_id", "claimed_at", "claim_code_issued", "verified_at", "verified_by"]) }));
      setIssuedCode("");
      const said = [`Released ${f.name}. The listing is unclaimed again and no portal account owns it.`];
      if (r.was_verified) said.push(r.verified_cleared ? "The Verified badge was removed with the claim." : "The Verified badge is still on the record. Remove it by hand.");
      if (r.warning) said.push(r.warning);
      said.push("To give it to another company, use Link portal account below.");
      setNotice(said.join(" "));
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

  const meta = [
    f.approved_at ? `Approved ${shortDate(f.approved_at)}` : null,
    f.joined_at ? `Joined ${shortDate(f.joined_at)}` : null,
    // Claimed state comes from the OWNER, never from claimed_at on its own: if the
    // owner was removed the listing is unclaimed again, whatever date is stored.
    claimed ? (f.claimed_at ? `Claimed ${shortDate(f.claimed_at)}` : "Claimed") : null,
    verified ? `Verified ${shortDate(f.verified_at)}` : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-paper/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-surface-1-solid border-l border-stroke overflow-y-auto px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-paper text-2xl">{f.id ? f.name : "New builder"}</h2>
            {f.id && <StatusBadge status={status} />}
            {f.id && hasStatus && <ClaimPill claimed={claimed} />}
            {f.id && verified && <VerifiedPill />}
            {f.id && <RelationshipPill type={f.relationship_type} />}
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
                <input value={f.state || ""} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} className={input} placeholder="ST" />
              </Field>
              <Field label="ZIP">
                <input value={f.zip || ""} onChange={(e) => set("zip", e.target.value)} className={input} />
              </Field>
            </div>
          </Section>

          <Section title="Contact" hint="Contact name stays internal. Email and phone are shown to a homeowner on a plan only once the builder has CLAIMED this listing, and never on the public profile. While the listing is unclaimed nobody outside this console sees them, and an introduction is forwarded by hand.">
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
              <input value={f.service_states} onChange={(e) => set("service_states", e.target.value.toUpperCase())} className={input} placeholder="Two-letter codes, e.g. ST, ST" />
            </Field>
            <Field label="Cities / areas served (comma separated)">
              <input value={f.cities} onChange={(e) => set("cities", e.target.value)} className={input} placeholder="City, City, City" />
            </Field>
            <Field label="ZIP codes or prefixes served (optional, comma separated)">
              <input value={f.service_zips} onChange={(e) => set("service_zips", e.target.value)} className={input} placeholder="Prefix or full ZIP, e.g. 123, 12345" />
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
            <div className="grid sm:grid-cols-2 gap-4 items-start">
              <div>
                <Field label="Build approach">
                  <select value={isApproachKnown(f) ? f.build_approach : ""} onChange={(e) => set("build_approach", e.target.value || null)} className={input}>
                    <option value="">{NOT_STATED}</option>
                    {Object.entries(APPROACH_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-paper-dim text-xs mt-1">Leave this at {NOT_STATED} unless the company's own material says which it is. The profile then leaves the row out rather than printing a guess.</p>
              </div>
              <div>
                <Field label="Turnkey">
                  <select value={isTurnkeyKnown(f) ? (f.turnkey ? "yes" : "no") : ""} onChange={(e) => set("turnkey", e.target.value === "" ? null : e.target.value === "yes")} className={input}>
                    {Object.entries(TURNKEY_OPTIONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-paper-dim text-xs mt-1">{TURNKEY_HELP} {NOT_STATED} means the company never said, and the profile shows no turnkey row at all.</p>
              </div>
            </div>
            <div>
              <p className="text-paper-dim text-xs mb-2">Who they build for</p>
              <div className="grid sm:grid-cols-2 gap-4 items-start">
                <TriState
                  label="Residential work"
                  known={isResidentialKnown(f)}
                  value={f.serves_residential}
                  onChange={(v) => set("serves_residential", v)}
                  disabled={!hasSourcedColumns}
                  hint={`Houses and homeowners. ${NOT_STATED} means the company's own material never said it.`}
                />
                <TriState
                  label="Commercial work"
                  known={isCommercialKnown(f)}
                  value={f.serves_commercial}
                  onChange={(v) => set("serves_commercial", v)}
                  disabled={!hasSourcedColumns}
                  hint={`Commercial or multi-unit work. ${NOT_STATED} is the honest answer for most seeded listings.`}
                />
              </div>
              <p className="text-paper-dim text-xs mt-2">
                Three answers, not a checkbox: No is the company telling us they do not do that work, {NOT_STATED} is nobody having asked them. Leave either at {NOT_STATED} unless the company's own material says, and never work one out from the ADU types or build methods above. Recorded on the record in this pass; no homeowner or public page reads it yet.
              </p>
              {!hasSourcedColumns && <p className="text-paper-dim text-xs mt-1">{sourcedColumnsNote}</p>}
            </div>
            <Field label="Licensed in (two-letter codes, comma separated; separate from service area)">
              <input value={f.licensed_states} onChange={(e) => set("licensed_states", e.target.value.toUpperCase())} className={input} placeholder="ST, ST" />
            </Field>
          </Section>

          {/* WHAT THE COMPANY CHARGES A HOMEOWNER. The recorded ADUAtlas terms
              ($49 a month, $500 a signed project) are a different fact about a
              different pair of parties and sit in their own section further down,
              under their own name. Both say which is which in their heading and
              their hint, and this one is boxed and tinted so the two are never
              skimmed as one. */}
          <Section title="Pricing the company publishes" hint="What THIS COMPANY charges a HOMEOWNER, in the company's own words. Not ADUAtlas's fees to the builder: those are further down, under ADUAtlas terms with this builder. Recorded on the record in this pass; no homeowner or public page reads it yet.">
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 space-y-4">
              <p className="text-paper text-xs">
                Record only a price the company itself publishes: a starting price, a per-square-foot figure, a package price, in their words. Never an estimate, never a figure worked out from the way they build, never a range carried over from another company. Leave it empty where they publish nothing: empty means no price was established, and nothing anywhere may turn that into "contact for pricing" or a figure of its own.
              </p>
              <Field label="What the company publishes about price">
                <textarea value={f.pricing_note || ""} onChange={(e) => set("pricing_note", e.target.value)} disabled={!hasSourcedColumns} maxLength={PRICING_NOTE_MAX} rows={3} className={hasSourcedColumns ? input : inputRO} placeholder="The company's own words, with the figure exactly as they publish it" />
              </Field>
              <Field label="The company's own page that price is published on">
                <input value={f.pricing_source_url || ""} onChange={(e) => set("pricing_source_url", e.target.value)} disabled={!hasSourcedColumns} maxLength={SOURCE_URL_MAX} className={hasSourcedColumns ? input : inputRO} placeholder="https://" />
              </Field>
              <p className="text-paper-dim text-xs">
                {hasPricing(f)
                  ? "A price is established on this record, from the company's own material. Clear the text to go back to no price established; there is no way to record a price the company did not publish, and there should not be."
                  : "No price established, which is the right answer for a company that publishes none. Nothing is inferred from its build methods and no surface invents a figure."}
              </p>
              <p className="text-paper-dim text-xs">
                Not to be confused with ADUAtlas terms with this builder, below: that is what ADUAtlas charges the COMPANY, {dollars(f.membership_price_cents ?? 4900)} a month after the free period and {dollars(f.success_fee_cents ?? 50000)} a signed project.
              </p>
              {!hasSourcedColumns && <p className="text-paper-dim text-xs">{sourcedColumnsNote}</p>}
            </div>
          </Section>

          {/* Provenance for a builder fact (decision 2l applied to a company
              record). The seed research read these pages for every company in the
              Arizona market; before this panel existed the schema had nowhere to
              keep them and the evidence was dropped at import. */}
          <Section title="Sources" hint="Where the facts on this record came from: pages of the company's OWN site that were read. Directories, aggregators and lead-generation sites are not sources. Internal provenance: no homeowner or public page reads it.">
            {(f.source_urls || []).length === 0 ? (
              <p className="text-paper-dim text-xs">No sources recorded. Nothing on this record has evidence behind it yet, and the Sources column on the list says so.</p>
            ) : (
              <ul className="space-y-2">
                {(f.source_urls || []).map((u) => (
                  <li key={u} className="flex items-start justify-between gap-2 rounded-lg border border-stroke px-3 py-2">
                    <a href={u} target="_blank" rel="noreferrer" className="text-accent text-xs break-all inline-flex items-center gap-1">
                      <FiExternalLink aria-hidden /> {u}
                    </a>
                    <button type="button" onClick={() => removeSource(u)} className="text-paper-dim hover:text-red-700 text-sm leading-none px-1" aria-label={`Remove source ${u}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid sm:grid-cols-[1fr_auto] gap-2">
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSource();
                  }
                }}
                disabled={!hasSourcedColumns}
                maxLength={SOURCE_URL_MAX}
                placeholder="https:// page on the company's own site"
                aria-label="Source URL"
                className={hasSourcedColumns ? smallInput : `${smallInput} opacity-70`}
              />
              <button type="button" onClick={addSource} disabled={!hasSourcedColumns} className={ghostButton}>
                <FiPlus aria-hidden /> Add source
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 items-start">
              <div>
                <Field label="Sources last checked">
                  <input type="date" value={f.sources_checked_on || ""} max={today()} onChange={(e) => set("sources_checked_on", e.target.value)} disabled={!hasSourcedColumns} className={hasSourcedColumns ? input : inputRO} />
                </Field>
                <p className="text-paper-dim text-xs mt-1">Empty means ADUAtlas has never recorded a check, which is not the same as checking and finding nothing had changed.</p>
              </div>
            </div>
            <p className="text-paper-dim text-xs">
              {(f.source_urls || []).length} of {SOURCE_URLS_MAX} pages cited. Sources are part of the record and save with Save changes, like every other field in this panel.
            </p>
            {!hasSourcedColumns && <p className="text-paper-dim text-xs">{sourcedColumnsNote}</p>}
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

          <Section title="Relationship" hint="How ADUAtlas works with this builder. Marketplace follows the standard terms below. Affiliates and partners follow their own agreement, and the standard success fee does not apply to them.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Relationship type">
                <select value={f.relationship_type || "marketplace"} onChange={(e) => set("relationship_type", e.target.value)} className={input}>
                  {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              {affiliate && (
                <Field label="Affiliate's own tracking link">
                  <input value={f.external_tracking_url || ""} onChange={(e) => set("external_tracking_url", e.target.value)} className={input} placeholder="https://" />
                </Field>
              )}
            </div>
            {affiliate && <p className="text-paper-dim text-xs">When this link is set, the builder's portal shows it in place of the ADUAtlas referral link and click counts come from the partner's program. Homeowners never see it.</p>}
          </Section>

          {/* WHAT ADUATLAS CHARGES THE BUILDER. Kept plainly apart from Pricing
              the company publishes, above, which is what the builder charges a
              homeowner. Two money facts about two different pairs of parties, and
              neither heading leaves it to be worked out. */}
          <Section title="ADUAtlas terms with this builder" hint={marketplace ? "What ADUAtlas charges the COMPANY, not what the company charges a homeowner (that is Pricing the company publishes, above). Recorded terms, not billed. Nothing here charges a card." : "What ADUAtlas charges the COMPANY, not what the company charges a homeowner (that is Pricing the company publishes, above). Standard terms shown for reference only. This relationship follows its own agreement; record it under commercial terms. Nothing here charges a card."}>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Free period">
                <input readOnly value={`${f.intro_days ?? 90} days`} className={inputRO} />
              </Field>
              <Field label="Membership after that">
                <input readOnly value={`${dollars(f.membership_price_cents ?? 4900)} per month`} className={inputRO} />
              </Field>
              <Field label="Success fee per signed project">
                <input readOnly value={marketplace ? dollars(f.success_fee_cents ?? 50000) : "Own terms"} className={inputRO} />
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
                  {hasStatus && <ClaimPill claimed={claimed} />}
                  {verified && <VerifiedPill />}
                  <RelationshipPill type={f.relationship_type} />
                  {approved && f.active === false && <Pill>Hidden (active is off)</Pill>}
                  {meta.length > 0 && <span className="text-paper-dim text-xs">{meta.join(" · ")}</span>}
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

                {hasStatus && (
                  <div className="rounded-xl border border-stroke p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-paper text-sm font-medium inline-flex items-center gap-2">
                          <FiShield aria-hidden /> {VERIFIED_BADGE_LABEL} badge
                        </p>
                        <p className="text-paper-dim text-xs mt-0.5">{VERIFIED_HELP}. {VERIFIED_LIMITS} It is never called Certified, and an affiliate or partner arrangement does not make a company verified.</p>
                      </div>
                      {verified ? (
                        <button type="button" onClick={unverify} disabled={busy === "verify"} className={ghostButton}>
                          <FiShieldOff /> {busy === "verify" ? "Updating…" : "Remove Verified"}
                        </button>
                      ) : (
                        <button type="button" onClick={verify} disabled={busy === "verify" || !claimed} className={ghostButton}>
                          <FiShield /> {busy === "verify" ? "Updating…" : "Mark Verified"}
                        </button>
                      )}
                    </div>
                    <p className="text-paper-dim text-xs">
                      {verified ? `Verified ${shortDate(f.verified_at)}. Homeowners see the badge on the listing card and the profile.` : claimed ? "Claimed. Check the business information, then grant the badge." : "Verification opens once the profile is claimed. An unclaimed listing has nobody behind it yet."}
                    </p>
                  </div>
                )}

                {hasStatus && claimed && (
                  <div className="rounded-xl border border-stroke p-4 space-y-3">
                    <div>
                      <p className="text-paper text-sm font-medium inline-flex items-center gap-2">
                        <FiUserX aria-hidden /> Release this listing
                      </p>
                      <p className="text-paper-dim text-xs mt-0.5">For a claim that went to the wrong account, or a company that changed hands. Releasing makes the listing unclaimed again: the portal account can no longer edit it, the referral link stops working, homeowners no longer see its email and phone, and the Verified badge is removed, because verification belongs to the owner who earned it. Conversations with homeowners stay with the listing, not the account: the released account can no longer read or reply to them, homeowners can still write in them but nobody can answer until the listing has an owner again, and the next account that claims it or is linked to it sees all of them, earlier messages included. The builder account is not deleted. To transfer the listing, release it, then link the new owner's account.</p>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={release} disabled={busy === "release"} className={ghostButton}>
                        <FiUserX /> {busy === "release" ? "Releasing…" : "Release listing"}
                      </button>
                    </div>
                  </div>
                )}

                {hasStatus && !claimed && (
                  <div className="rounded-xl border border-stroke p-4 space-y-3">
                    <div>
                      <p className="text-paper text-sm font-medium inline-flex items-center gap-2">
                        <FiKey aria-hidden /> Claim code
                      </p>
                      <p className="text-paper-dim text-xs mt-0.5">The builder creates an account at ADUAtlas and enters this code to claim this profile, which turns tracking on. The invitation below carries the code and issues one where this listing has none, so use this panel only to hand a code over yourself. The code is shown once, right after it is issued.</p>
                    </div>
                    {issuedCode ? (
                      <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 space-y-2">
                        <p className="text-paper text-xs font-medium">Copy it now. It is not shown again after you close this panel.</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input readOnly value={issuedCode} onFocus={(e) => e.target.select()} aria-label="Claim code" className="flex-1 bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper font-mono text-lg tracking-[0.3em]" />
                          <button type="button" onClick={() => copy(issuedCode, "claim")} className={ghostButton}>
                            <FiCopy /> {copied === "claim" ? "Copied" : "Copy code"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-paper-dim text-xs">{f.claim_code_issued ? "Code issued. It is waiting to be used." : "No code issued yet."}</span>
                        <button type="button" onClick={issueClaimCode} disabled={busy === "claim"} className={ghostButton}>
                          <FiKey /> {busy === "claim" ? "Issuing…" : f.claim_code_issued ? "Re-issue code" : "Issue claim code"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {hasStatus && !claimed && (
                  <div className="rounded-xl border border-stroke p-4 space-y-3">
                    <div>
                      <p className="text-paper text-sm font-medium inline-flex items-center gap-2">
                        <FiMail aria-hidden /> Invite to claim
                      </p>
                      <p className="text-paper-dim text-xs mt-0.5">Emails the ADUAtlas invitation to the contact address on this listing: what ADUAtlas is building, what claiming the listing gives the company, the claim code and the terms. It offers to increase their visibility to homeowners looking for ADU builders and promises no leads, no traffic and no sales, and it carries no referral link, because the link comes with the claim. Nothing about this listing changes until the company claims it.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-paper-dim text-xs">{inviteStatus}</span>
                      <button type="button" onClick={invite} disabled={Boolean(inviteBlocked) || busy === "invite"} className={ghostButton}>
                        <FiSend /> {busy === "invite" ? "Sending…" : f.invited_at ? "Invite again" : "Invite to claim"}
                      </button>
                    </div>
                    {inviteBlocked && <p className="text-paper-dim text-xs">{inviteBlocked}</p>}
                  </div>
                )}

                {hasStatus && !claimed && (
                  <div className="rounded-xl border border-stroke p-4 space-y-3">
                    <div>
                      <p className="text-paper text-sm font-medium">Link portal account</p>
                      <p className="text-paper-dim text-xs mt-0.5">The other way to claim: give this profile to a builder account directly. The builder signs up at ADUAtlas first; enter the email they used. This marks the profile claimed.</p>
                    </div>
                    <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                      <input type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="builder account email" aria-label="Builder account email" className={smallInput} />
                      <button type="button" onClick={linkOwner} disabled={busy === "link"} className={ghostButton}>
                        <FiLink /> {busy === "link" ? "Linking…" : "Link account"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-paper-dim text-xs">Profiles created here go live as approved and unclaimed. Builder-submitted profiles arrive as pending and wait for Approve.</p>
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
            <Section title="Referral link" hint="Resolves only for a claimed, approved profile. An unclaimed listing has no working link, and no invitation should carry one.">
              {trackingActive && referralLink ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input readOnly value={referralLink} onFocus={(e) => e.target.select()} aria-label="Referral link" className="flex-1 bg-canvas border border-stroke rounded-lg px-3 py-2 text-paper font-mono text-sm" />
                  <button type="button" onClick={() => copy(referralLink, "link")} className={ghostButton}>
                    <FiCopy /> {copied === "link" ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : trackingActive ? (
                <p className="text-paper-dim text-sm">Save changes to generate this builder's link.</p>
              ) : !hasStatus ? (
                <p className="text-paper-dim text-sm">The link appears once migration 0006 is applied.</p>
              ) : !claimed ? (
                <p className="text-paper-dim text-sm">Unclaimed listing. Tracking is off, and the link starts working when the builder claims the profile.</p>
              ) : (
                <p className="text-paper-dim text-sm">Claimed. The link starts working once the profile is approved.</p>
              )}
              {affiliate && f.external_tracking_url && (
                <div className="rounded-xl border border-stroke px-3 py-2">
                  <p className="text-paper-dim text-xs mb-1">Affiliate's own tracking link</p>
                  <a href={f.external_tracking_url} target="_blank" rel="noreferrer" className="text-accent text-sm break-all inline-flex items-center gap-1">
                    <FiExternalLink aria-hidden /> {f.external_tracking_url}
                  </a>
                  <p className="text-paper-dim text-xs mt-1">Clicks on this link are counted by the partner's program, not by ADUAtlas.</p>
                </div>
              )}
              <p className="text-paper-dim text-xs">Homeowners who arrive through the ADUAtlas link are attributed to {f.name} when they leave an email, create an account or buy a package. Attribution runs only while the profile is claimed and approved.</p>
            </Section>
          )}

          {f.id && (
            <Section title="Referral activity" hint={claimed ? "Raw event counts for this builder. No funnel stages are defined and no money moves." : "Profile views and homeowner inquiries are recorded for any approved listing. Link clicks, emails, accounts and purchases start with the claim."}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {EVENT_COUNTS.map(([k, label]) => (
                  <div key={k} className="rounded-xl border border-stroke px-3 py-2">
                    <p className="text-paper-dim text-xs">{label}</p>
                    <p className="text-paper text-lg font-semibold">{count(stats, k)}</p>
                    {k === "conversations" && <p className="text-paper-dim text-[11px]">Message threads homeowners opened with this builder.</p>}
                  </div>
                ))}
                <div className="rounded-xl border border-stroke px-3 py-2">
                  <p className="text-paper-dim text-xs">Purchases, gross</p>
                  <p className="text-paper text-lg font-semibold">{money(stats, "purchase_amount_cents")}</p>
                </div>
                <div className="rounded-xl border border-stroke px-3 py-2">
                  <p className="text-paper-dim text-xs">Purchases, net after refunds</p>
                  <p className="text-paper text-lg font-semibold">{money(stats, "net_amount_cents")}</p>
                </div>
              </div>
              {claimed ? (
                <div className="rounded-xl border border-stroke p-4 space-y-3">
                  <div>
                    <p className="text-paper text-sm font-medium">Mark a project signed</p>
                    <p className="text-paper-dim text-xs mt-0.5">Records a project_signed event naming {f.name} as the signing builder. The homeowner is looked up by account email on the server, and the builder whose link first brought them to ADUAtlas is recorded separately. The note is required, because a recorded fee needs the evidence behind it. One record per homeowner and builder; a repeat changes nothing.</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input type="email" value={signed.email} onChange={(e) => setSigned((p) => ({ ...p, email: e.target.value }))} placeholder="homeowner account email" aria-label="Homeowner account email" className={smallInput} />
                    <select value={signed.confirmed_by} onChange={(e) => setSigned((p) => ({ ...p, confirmed_by: e.target.value }))} aria-label="Who confirmed the signing" className={smallInput}>
                      <option value="">Who confirmed the signing</option>
                      {Object.entries(CONFIRMED_BY).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <input type="date" value={signed.signed_on} max={today()} onChange={(e) => setSigned((p) => ({ ...p, signed_on: e.target.value }))} aria-label="Date signed" className={smallInput} />
                    <input value={signed.note} onChange={(e) => setSigned((p) => ({ ...p, note: e.target.value }))} placeholder="What was signed and how it was confirmed" aria-label="Note" className={smallInput} />
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={markSigned} disabled={busy === "signed"} className={ghostButton}>
                      {busy === "signed" ? "Recording…" : "Record signed project"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-paper-dim text-xs">A signed project can only be recorded for a claimed listing. This panel opens once a builder account owns this profile.</p>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS = { requested: "Requested", sent: "Introduction sent", declined: "Declined" };
// What the status control offers (contract C2). Introduction sent means ADUAtlas
// actually forwarded the homeowner's message, so only Forward to builder records
// it: the option is shown only on a row that is already sent, and never offered
// as a choice. A forwarded introduction cannot go back to Requested, because the
// builder has the message. The server refuses both anyway.
const statusChoices = (i) => Object.entries(STATUS).filter(([k]) => k !== "sent" || i.status === "sent");
const statusDisabled = (i, k) => k === "sent" || (k === "requested" && Boolean(i.forwarded_at));
// The homeowner's plan by its NAME (the stored ids predate the names: 'roadmap' is
// Golden, 'report' is Platinum). A plan that is no longer live says so.
const introPlan = (i) => {
  if (!i.homeowner_tier) return "No plan";
  const name = planById(i.homeowner_tier)?.name || i.homeowner_tier;
  return i.homeowner_plan_live === false ? `${name}, not active` : name;
};
// The builder's own contact email, the address a forward would reach. A payload
// that names it outright wins; the older list collapses email, phone and website
// into one builder_contact string, where only an address carries "@". This is
// for the button state only: the server reads the address from the record.
const introBuilderEmail = (i) => {
  if ("builder_contact_email" in i) return String(i.builder_contact_email || "").trim();
  const contact = String(i.builder_contact || "").trim();
  return contact.includes("@") ? contact : "";
};
// Why a forward cannot be sent, in plain words, or "" when it can. A forward
// needs an address, and the route refuses one it cannot record (0016 stamps
// forwarded_at) with a message of its own, which the banner above shows.
const forwardBlocked = (i) =>
  i.status === "declined"
    ? "Declined introductions are not forwarded. Set it back to Requested to forward it."
    : introBuilderEmail(i)
      ? ""
      : "This builder's listing has no contact email. Add one on the builder profile first.";
// Listing filter on top of the status filter.
const KIND_FILTERS = {
  claimed: ["Claimed", (b) => Boolean(b.owner_user_id)],
  unclaimed: ["Unclaimed", (b) => !b.owner_user_id],
  verified: ["Verified", (b) => isVerified(b)],
  code_issued: ["Claim code issued", (b) => Boolean(b.claim_code_issued)],
  affiliate: ["Affiliate", (b) => b.relationship_type === "affiliate"],
  partner: ["Partner", (b) => b.relationship_type === "partner"],
  // The records ADUAtlas researched and never wrote the evidence down for. The
  // Array.isArray guard keeps a database without 0017 out of this filter: no
  // column is not the same fact as no sources.
  no_sources: ["No sources recorded", (b) => Array.isArray(b.source_urls) && b.source_urls.length === 0],
};

const AdminBuilders = () => {
  const [tab, setTab] = useState("builders");
  const [items, setItems] = useState(null);
  const [intros, setIntros] = useState(null);
  const [stats, setStats] = useState({}); // builder_id -> referral_stats row
  const [error, setError] = useState("");
  const [active, setActive] = useState(null); // builder | "new" | null
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [forwarding, setForwarding] = useState(""); // intro id mid-forward

  // Resolves to the fresh builder list (null when the read failed), so a drawer
  // can read its own row back after a call that failed part-way.
  const load = () =>
    Promise.all([adminGet("builders/list"), adminGet("builders/intros")])
      .then(([b, i]) => {
        setItems(b.items);
        setIntros(i.items);
        // Referral counts are a nice-to-have: if the endpoint is not available
        // yet (migration 0005 not applied) the column just says so.
        return adminGet("builders/referrals")
          .then((r) => setStats(Object.fromEntries((r.items || []).map((row) => [row.builder_id, row]))))
          .catch(() => setStats({}))
          .then(() => b.items);
      })
      .catch((e) => {
        setError(e.message);
        return null;
      });
  useEffect(() => {
    load();
  }, []);

  const pending = useMemo(() => (items || []).filter((b) => statusOf(b) === "pending").length, [items]);
  const claimedCount = useMemo(() => (items || []).filter((b) => b.owner_user_id).length, [items]);
  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    const kind = KIND_FILTERS[kindFilter]?.[1];
    return (items || []).filter((b) => (!statusFilter || statusOf(b) === statusFilter) && (!kind || kind(b)) && (!n || [b.name, b.state, b.city, b.contact_name, ...(b.cities || []), ...(b.service_states || [])].filter(Boolean).join(" ").toLowerCase().includes(n)));
  }, [items, q, statusFilter, kindFilter]);

  // ADUAtlas relays the homeowner's MESSAGE to the builder (decision 8, 2h).
  // The request carries the introduction id and nothing else: the server reads
  // the builder's address from the record, and the homeowner's name, email and
  // property address never leave ADUAtlas. The server stamps forwarded_at and
  // moves the row to Introduction sent.
  const forwardIntro = async (id) => {
    setForwarding(id);
    setError("");
    try {
      await adminPost("builders/intro-forward", { id });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setForwarding("");
    }
  };

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
          {items && items.length > 0 && <p className="text-paper-dim text-sm mt-2">{claimedCount} of {items.length} listings claimed. Tracking runs only for claimed, approved profiles.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Filter by listing kind" className="bg-canvas border border-stroke rounded-xl px-3 py-2.5 text-paper text-sm">
              <option value="">All listings</option>
              {Object.entries(KIND_FILTERS).map(([k, [label]]) => (
                <option key={k} value={k}>
                  {label}
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
                    <th className="px-4 py-3">Sources</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Listing</th>
                    <th className="px-4 py-3">Activity</th>
                    <th className="px-4 py-3">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => {
                    const s = statusOf(b);
                    const hasStatus = b.profile_status !== undefined;
                    const rel = b.relationship_type && b.relationship_type !== "marketplace" ? RELATIONSHIP_LABELS[b.relationship_type] || b.relationship_type : null;
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
                          <p>{(b.specialties || []).map((x) => SPECIALTY_LABELS[x]).join(", ") || "Not set"}</p>
                          {((b.build_methods || []).length > 0 || b.turnkey === true) && <p className="text-xs">{[...(b.build_methods || []).map((m) => BUILD_METHOD_LABELS[m] || m), b.turnkey === true ? "Turnkey" : null].filter(Boolean).join(" · ")}</p>}
                        </td>
                        {/* Provenance at a glance (0017). A record with nothing
                            behind it is called out rather than left blank, and a
                            database without the column says n/a, because "no
                            column" is not the fact "no sources". */}
                        <td className="px-4 py-3 text-paper-dim whitespace-nowrap">
                          {!Array.isArray(b.source_urls) ? (
                            <span className="text-xs">n/a</span>
                          ) : b.source_urls.length === 0 ? (
                            <span className="text-xs text-amber-700">No sources</span>
                          ) : (
                            <p>
                              {b.source_urls.length} source{b.source_urls.length === 1 ? "" : "s"}
                            </p>
                          )}
                          {b.sources_checked_on && <p className="text-xs">checked {dateOnly(b.sources_checked_on)}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={s} />
                            {b.featured && <span className="text-paper-dim text-xs">featured</span>}
                            {s === "approved" && b.active === false && <span className="text-paper-dim text-xs">hidden</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {hasStatus ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <ClaimPill claimed={Boolean(b.owner_user_id)} />
                              {isVerified(b) && <VerifiedPill />}
                              {!b.owner_user_id && b.claim_code_issued && <span className="text-paper-dim text-xs">code issued</span>}
                              {!b.owner_user_id && b.invited_at && <span className="text-paper-dim text-xs">invited {shortDate(b.invited_at)}</span>}
                              {rel && (
                                <span title="The commercial arrangement with ADUAtlas. It is not verification." className="text-paper-dim text-xs">
                                  {rel}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-paper-dim text-xs">n/a</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-paper-dim whitespace-nowrap">{refSummary(stats[b.id])}</td>
                        <td className="px-4 py-3 text-paper-dim">{[(b.logo_path && "logo"), (b.photos || []).length ? `${b.photos.length} photo${b.photos.length > 1 ? "s" : ""}` : null, (b.videos || []).length ? `${b.videos.length} video${b.videos.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || "None"}</td>
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
          <p className="text-paper-dim text-sm mb-4 max-w-3xl">The homeowner always writes first, and this is where they asked ADUAtlas for an introduction. Forwarding sends the builder the homeowner's message and nothing that identifies them: no name, no email address, no property address. ADUAtlas is relaying a message, not signing the company up to anything, and the builder replies to ADUAtlas. The homeowner's email in this table is for you, and it is not in the mail.</p>
          <p className="text-paper-dim text-xs mb-4 max-w-3xl">Introduction sent is recorded only when Forward to builder actually mails the builder, so it is not a status you can choose. If you reach the builder another way, leave the introduction as Requested: the homeowner is told an introduction was sent only when one was.</p>
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
                    <th className="px-4 py-3">Forward</th>
                  </tr>
                </thead>
                <tbody>
                  {intros.map((i) => {
                    const blocked = forwardBlocked(i);
                    return (
                      <tr key={i.id} className="border-t border-stroke align-top">
                        <td className="px-4 py-3">
                          <p className="text-paper">{i.homeowner_email}</p>
                          <p className="text-paper-dim text-xs">{introPlan(i)} · {i.homeowner_address || "no address"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-paper">{i.builder_name}</p>
                          {i.builder_contact && <p className="text-paper-dim text-xs inline-flex items-center gap-1"><FiExternalLink /> {i.builder_contact}</p>}
                        </td>
                        <td className="px-4 py-3 text-paper-dim max-w-xs whitespace-pre-line">{i.message || "No message"}</td>
                        <td className="px-4 py-3 text-paper-dim">{new Date(i.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <select value={i.status} onChange={(e) => updateIntro(i.id, { status: e.target.value })} aria-label="Introduction status" className="bg-canvas border border-stroke rounded-lg px-2 py-1.5 text-paper text-xs">
                            {statusChoices(i).map(([k, v]) => (
                              <option key={k} value={k} disabled={statusDisabled(i, k)}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {i.forwarded_at ? (
                            <span className="text-paper-dim text-xs whitespace-nowrap">Forwarded {shortDate(i.forwarded_at)}</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => forwardIntro(i.id)} disabled={Boolean(blocked) || forwarding === i.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stroke text-xs text-paper hover:border-accent whitespace-nowrap disabled:opacity-60">
                                <FiSend aria-hidden /> {forwarding === i.id ? "Sending…" : "Forward to builder"}
                              </button>
                              {blocked && <p className="text-paper-dim text-xs mt-1 max-w-[15rem]">{blocked}</p>}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
