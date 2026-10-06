import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiAlertTriangle, FiArrowLeft, FiArrowRight, FiCheckCircle, FiClock, FiExternalLink, FiHelpCircle, FiInfo, FiSearch } from "react-icons/fi";
import * as regulatory from "../lib/regulatory";
import {
  ENTITY_STATE,
  FIELD_STATE,
  PROVISION_DATE_KEYS,
  PROVISION_TOPIC_LABELS,
  RECORD_VERIFICATION,
  RECORD_VERIFICATION_COPY,
  RESOURCE_KIND_LABELS,
  SOURCE_TYPE_LABELS,
  attributionsFor,
  checkedDateWording,
  fetchCoverage,
  fetchEntity,
  fetchJurisdiction,
  fetchJurisdictions,
  fetchProvisions,
  fetchResources,
  fetchStates,
  fetchTopicCoverage,
  isIndexable,
  verificationStatusOf,
} from "../lib/regulatory";
import { setHead, setRobots } from "../lib/head";
import { stateCodeFromParam } from "../lib/usStates";

// ONE jurisdiction's page in ADU Rules and Resources (Phase 1 spec, decisions
// 2l and 2m). This is the hard surface of the feature and the one most able to
// mislead, so the rules it follows are written down here rather than left to
// whoever edits it next.
//
// THE LEVELS ARE DISTINCT SOURCED ANSWERS AND ARE NEVER MERGED (2m, "Display
// never fabricates"). A homeowner reading Phoenix sees Arizona, Maricopa County
// and Phoenix as separate blocks, each carrying its own rules, its own sources
// and its own dates, and then property-specific as NOT DETERMINED. Where two
// levels say different things about the same topic the page shows both, side by
// side, attributed, and says outright that ADUAtlas does not decide which one
// applies. There is no merged "the answer for your city" anywhere on this page,
// because there is no honest way to compute one.
//
// GEOGRAPHY IS NOT AUTHORITY (2m). The breadcrumb and the level blocks are
// geography and display. Containment grants nothing: a state account has no
// standing over a city's record and a county none over its cities. This page
// never reads a permission out of the hierarchy, and it never says or implies
// that a higher level "governs" what is published beneath it. All it does is
// show what each government publishes, separately.
//
// THREE FIELD STATES, NEVER BLURRED (2b applied to regulation, 2l). Verified
// from source, source did not state, and not yet researched are three visibly
// different things here: a filled accent chip, a plain outlined chip, and a
// dashed muted chip, each with its own words. A field nobody has researched is
// never rendered as a zero, an em dash or an empty row that reads like "none",
// and a value is NEVER invented to make a record look complete.
//
// FOUR DATES, NEVER COLLAPSED (2m, "Dates are not one field"). Effective date
// is when the rule legally took effect. Source checked is when ADUAtlas last
// looked at the government source. Record updated is when ADUAtlas last changed
// its own row. Superseded or repealed marks a rule that is no longer current.
// "Verified January 2025" and "effective January 2026" mean opposite things, so
// they are rendered in different columns, with different emphasis, each with the
// sentence that says what it means. A superseded rule is moved out of the
// current list and labelled, never silently dropped and never left looking live.
//
// PROVENANCE STATEMENTS THAT ARE NOT THE SAME STATEMENT (2m, 2t). "Source:
// Official government website" says where the rule was read, and comes from the
// view's source_is_official_government, never from guessing at a host name.
// "Provided by <entity>" says a government account ADUAtlas verified supplied it,
// and comes from the view's provided_by_entity_name. "Compiled by ADUAtlas" is
// said only when the view's supplied_by is aduatlas_research, and a government
// row whose account is no longer verified says so in its own sentence rather than
// reading as ADUAtlas research. When the row does not say who supplied it, the
// page says nothing about it. regulatory.attributionsFor() is the one reader.
// Partnership status is never read on this page.
//
// WHO CHECKED IT (0012's verification_status) is not WHAT WE KNOW (the field
// state). Only a row ADUAtlas checked against its source earns the "Verified from
// source" check mark and the words "ADUAtlas last checked the source". An
// unchecked row says so, and a disputed row says another official source
// disagrees and that ADUAtlas shows it rather than choosing.
//
// THE RECORD IS LOOKED UP BY (STATE, SLUG), the key the database makes unique. The
// state segment of the url is resolved to its code (src/lib/usStates.js) and a
// segment that names no state renders "missing". A slug alone is only unique
// inside its state, so it is never enough to pick a record (DEF-06).
//
// THE BADGE IS "VERIFIED GOVERNMENT ACCOUNT", WITH THE ENTITY NAME BENEATH IT,
// and it means identity, not legal correctness. The builder badge ("Verified on
// ADUAtlas", exported by BuilderProfile.jsx) is NEVER used on this page and is
// deliberately not imported here. An UNCLAIMED entity carries a provenance note
// that says ADUAtlas compiled the record from public sources and that the
// government does not take part; a CLAIMED but unverified entity says the
// authority behind the claim has not been checked. Claiming never reads as
// verification.
//
// THREE CONCEPTS KEPT APART (2m). The regulatory database says what governments
// currently publish. Property feasibility says what appears to apply to a
// particular parcel. A permit determination is a jurisdiction approving a real
// project. The scope notice near the top and the not-determined block near the
// bottom exist to keep those three from collapsing into each other in a
// reader's head.
//
// UNPUBLISHED ROWS. The database is the boundary: RLS decides what an anonymous
// reader may select. isShowable() below is defence in depth on top of that, not
// instead of it: a row whose own status says draft, submitted, pending, rejected
// or archived is dropped client-side too, so a schema that ever over-shares
// cannot turn this page into a preview of unreviewed work.
//
// COLUMN NAMES. The structural readers below (idOf, nameOf, levelOf and
// friends) accept a few spellings for the same concept because this page and
// src/lib/regulatory.js were first written in parallel. The FACT readers do not:
// dates, attribution, verification and entity state are read from the public
// views' own columns and nowhere else, because a tolerant reader that picks up a
// neighbouring column is how a page ends up printing a different fact under the
// label (DEF-02, DEF-05, DEF-11). A fact that cannot be read is reported as not
// recorded rather than guessed at.

// ── Tolerant row readers ────────────────────────────────────────────────────
// First defined value wins; undefined and null both count as absent so a real
// false or 0 is never skipped over.
const pick = (row, keys) => {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

// fetch* may hand back an array, or a wrapper around one. Anything else is an
// empty list: a page that cannot read its data says so, it does not improvise.
const asRows = (result) => {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  for (const key of ["data", "rows", "states", "jurisdictions", "provisions", "resources", "items"]) {
    if (Array.isArray(result[key])) return result[key];
  }
  return [];
};

// The single-row twin of asRows. { ok: false } is a failure, not a record.
const asRow = (result) => {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  if (result.ok === false) return null;
  for (const key of ["data", "row", "jurisdiction", "entity", "record"]) {
    const value = result[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return "id" in result || "slug" in result || "name" in result ? result : null;
};

const idOf = (row) => pick(row, ["id", "jurisdiction_id", "uuid"]);
const nameOf = (row) => pick(row, ["official_name", "name", "jurisdiction_name", "display_name", "title"]);
// The place, not the institution: "Arizona" rather than "State of Arizona".
const placeNameOf = (row) => pick(row, ["name", "official_name", "jurisdiction_name", "display_name"]);
const parentIdOf = (row) => pick(row, ["parent_id", "parent_jurisdiction_id", "parent"]);
const stateCodeOf = (row) => {
  const raw = pick(row, ["state_code", "state", "state_abbr", "code"]);
  return typeof raw === "string" && raw.length <= 2 ? raw.toUpperCase() : typeof raw === "string" ? raw : "";
};
const levelOf = (row) => String(pick(row, ["type", "jurisdiction_type", "level", "kind"]) || "").toLowerCase();

const LEVEL_LABELS = {
  country: "Country",
  state: "State",
  territory: "Territory",
  district: "Federal district",
  county: "County",
  parish: "Parish",
  borough: "Borough",
  city: "City",
  town: "Town",
  township: "Township",
  village: "Village",
  municipality: "Municipality",
  local: "Local authority",
  local_authority: "Local authority",
  other: "Local authority",
};

const humanize = (key) =>
  String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

const levelLabel = (row) => {
  const level = levelOf(row);
  return LEVEL_LABELS[level] || (level ? humanize(level) : "Jurisdiction");
};

// ── Urls ────────────────────────────────────────────────────────────────────
// Every href on this page is government-supplied or admin-entered text, so it
// is sanitised before it reaches the DOM (2l, security): http and https only, a
// bare domain is promoted to https, and anything else (javascript:, data:, a
// relative path that would read as a page on aduatlas.com) returns null and the
// link is simply not rendered.
const safeHref = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }
  if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/|\?|$)/i.test(value)) return `https://${value}`;
  return null;
};

const hostOf = (href) => {
  try {
    return new URL(href).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// ── Dates ───────────────────────────────────────────────────────────────────
// Dates are rendered as a month and a year where the day carries no meaning to
// a homeowner, and never reformatted into something the record did not say.
const fmtDate = (raw) => {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return typeof raw === "string" ? raw : null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

// Each date from its own column, named once in regulatory.PROVISION_DATE_KEYS.
// No fallback to another kind of date: updated_at moves on an internal note and a
// verification timestamp is not a source check, so either one under these labels
// would be a different fact. A column that is empty prints "Not recorded".
const datesOf = (row) => ({
  effective: fmtDate(row?.[PROVISION_DATE_KEYS.effective]),
  checked: fmtDate(row?.[PROVISION_DATE_KEYS.checked]),
  published: fmtDate(row?.[PROVISION_DATE_KEYS.recordUpdated]),
  superseded: fmtDate(row?.[PROVISION_DATE_KEYS.superseded]),
});

const isSuperseded = (provision) => {
  const dates = datesOf(provision);
  if (dates.superseded) return true;
  const status = String(pick(provision, ["review_status", "status", "lifecycle_status"]) || "").toLowerCase();
  return /supersed|repeal|historic|retire/.test(status);
};

// ── The three field states ──────────────────────────────────────────────────
// FIELD_STATE is the schema package's enum. Its VALUES are read first, so the
// database's own spelling wins; the substring pass behind it is what keeps this
// page honest if the enum is spelled differently than expected. A value that
// maps to none of the three is reported as "status not recorded", never as
// verified.
const canonicalState = (text) => {
  const value = String(text || "").toLowerCase();
  if (!value) return null;
  // Order matters: "not_yet_researched" and "source_did_not_state" are checked
  // before anything that merely contains "verified", and an explicit
  // "unverified" or "not_verified" is NOT one of the three states, so it falls
  // through to null and renders as "status not recorded".
  if (/research/.test(value)) return "not_researched";
  if (/(did_not_state|did not state|not_stated|not stated|unstated|silent|no_statement|not_addressed|not addressed)/.test(value)) return "not_stated";
  if (/verif/.test(value) && !/(un|not[_ ]|no[_ ])verif/.test(value)) return "verified";
  return null;
};

const FIELD_STATE_LOOKUP = (() => {
  const map = new Map();
  const source = FIELD_STATE && typeof FIELD_STATE === "object" ? FIELD_STATE : {};
  const entries = Array.isArray(source) ? source.map((v) => [v, v]) : Object.entries(source);
  for (const [key, value] of entries) {
    const canonical = canonicalState(key) || canonicalState(value);
    if (canonical && typeof value === "string") map.set(value.toLowerCase(), canonical);
  }
  return map;
})();

// The field state only. verification_status is a different axis (who checked
// it, not what we know) and is never read here as a stand-in for this one.
const fieldStateOf = (provision) => {
  const raw = pick(provision, ["field_state", "value_state", "field_status", "value_status"]);
  const fromEnum = typeof raw === "string" ? FIELD_STATE_LOOKUP.get(raw.toLowerCase()) : null;
  if (fromEnum) return fromEnum;
  return canonicalState(raw);
};

// The two axes together decide a record's chips and its one explanatory
// sentence. Three field states x three verification statuses, plus an unknown
// status, which never earns the check mark and never claims "not checked".
//
//   verified   + source_checked   "Verified from source" (the check mark)
//   verified   + unverified       "From source, not yet checked by ADUAtlas"
//   verified   + disputed         "Disputed", and the disagreement sentence
//   verified   + unknown          "From source"
//   not_stated + source_checked   "Source did not state"
//   not_stated + unverified       "Source did not state" + "Not yet checked by ADUAtlas"
//   not_stated + disputed         "Source did not state" + "Disputed"
//
// A resource that ADUAtlas checked (or whose status is unknown) shows no chip at
// all, as before: the link is the record.
const statusFor = (state, verification, { resource = false } = {}) => {
  if (state === "verified") {
    if (verification === RECORD_VERIFICATION.CHECKED) return { chips: resource ? [] : ["verified"], sentence: null };
    if (verification === RECORD_VERIFICATION.UNCHECKED) return { chips: ["unchecked_value"], sentence: RECORD_VERIFICATION_COPY.uncheckedSentence };
    if (verification === RECORD_VERIFICATION.DISPUTED) return { chips: ["disputed"], sentence: RECORD_VERIFICATION_COPY.disputedSentence };
    return { chips: resource ? [] : ["from_source"], sentence: null };
  }
  if (state === "not_stated") {
    if (verification === RECORD_VERIFICATION.UNCHECKED) return { chips: ["not_stated", "unchecked"], sentence: RECORD_VERIFICATION_COPY.uncheckedSentence };
    if (verification === RECORD_VERIFICATION.DISPUTED) return { chips: ["not_stated", "disputed"], sentence: RECORD_VERIFICATION_COPY.disputedSentence };
    return { chips: ["not_stated"], sentence: null };
  }
  return { chips: [state], sentence: null };
};

// A row whose own status says it is not published is not rendered, whatever the
// database handed over. Absent status means published: the view that fed this
// page is the definition of public, exactly as it is for a builder profile.
const isShowable = (provision) => {
  const status = String(pick(provision, ["review_status", "publication_status", "status", "state"]) || "").toLowerCase();
  if (!status) return true;
  return !/(draft|submitted|pending|in_review|under_review|rejected|declined|archived|deleted|withdrawn)/.test(status);
};

// ── Provision content ───────────────────────────────────────────────────────
const topicKeyOf = (provision) => String(pick(provision, ["topic", "category", "topic_key", "provision_topic", "field_key"]) || "");

const topicLabelOf = (provision) => {
  const key = topicKeyOf(provision);
  const label = PROVISION_TOPIC_LABELS?.[key];
  return label || pick(provision, ["topic_label", "label", "title"]) || (key ? humanize(key) : "Requirement");
};

const valueOf = (provision) => {
  // A rule's value lives in TYPED columns: value_text, or a number with its unit,
  // or a yes/no, plus an optional qualifier. regulatory.provisionValue() is the one
  // renderer for them. This used to read text columns only, so a verified rule
  // stored as a number or a yes/no printed "No value recorded" under a "Verified
  // from source" chip, and a rule's qualifier never appeared at all (found
  // 2026-09-26). The text-only path below stays as the fallback for older shapes.
  const typed = typeof regulatory.provisionValue === "function" ? regulatory.provisionValue(provision) : null;
  if (typed && typed.known && typed.text) {
    return typed.qualifier ? `${typed.text}\n${typed.qualifier}` : typed.text;
  }
  const value = pick(provision, ["rule_value", "value", "value_text", "rule_text", "text", "requirement", "body"]);
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return "";
};

const sourceTypeLabelOf = (provision) => {
  const key = String(pick(provision, ["source_type", "source_kind"]) || "");
  if (!key) return "";
  return SOURCE_TYPE_LABELS?.[key] || humanize(key);
};

// The entity's participation state, from government_entities_public.entity_state
// and nothing else. null when the row does not say, which is shown as nothing
// rather than as "unclaimed".
const entityStateOf = (entity) => {
  const value = entity?.entity_state;
  return Object.values(ENTITY_STATE).includes(value) ? value : null;
};

// ── Small shared pieces, exported so the state and index pages say the same
// things in the same words ─────────────────────────────────────────────────

// The legend for the chips. It exists so a homeowner learns the difference
// once, on any of the three surfaces, instead of guessing at a chip. Every
// sentence here has to be true of every card that carries the chip beside it,
// which is why "Verified from source" is now said only of rows ADUAtlas checked
// and "Source did not state" no longer claims that ADUAtlas did the checking.
export const ThreeStateLegend = ({ className = "" }) => (
  <div className={`bg-canvas border border-stroke rounded-3xl p-5 sm:p-6 ${className}`} data-legend="rules">
    <h2 className="font-display text-paper text-lg mb-3">How to read this page</h2>
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <li>
        <FieldStateChip state="verified" />
        <p className="text-paper-dim text-xs leading-relaxed mt-2">ADUAtlas read this in the government source linked beside it, on the date shown.</p>
      </li>
      <li>
        <VerificationChip kind="unchecked_value" />
        <p className="text-paper-dim text-xs leading-relaxed mt-2">This was recorded from the source linked beside it. ADUAtlas has not checked it against that source yet.</p>
      </li>
      <li>
        <VerificationChip kind="disputed" />
        <p className="text-paper-dim text-xs leading-relaxed mt-2">Another official source disagrees with this record. ADUAtlas shows it rather than choosing between them.</p>
      </li>
      <li>
        <FieldStateChip state="not_stated" />
        <p className="text-paper-dim text-xs leading-relaxed mt-2">The source does not address this. That is not the same as the answer being no.</p>
      </li>
      <li>
        <FieldStateChip state="not_researched" />
        <p className="text-paper-dim text-xs leading-relaxed mt-2">Nobody has researched this yet. We would rather tell you that than fill the gap with a guess.</p>
      </li>
    </ul>
  </div>
);

// The boundary between the three concepts, in one block, in the same words on
// every surface of the feature (2m).
export const ConceptsApartNotice = ({ className = "" }) => (
  <div className={`bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8 ${className}`}>
    <h2 className="font-display text-paper text-xl sm:text-2xl mb-4">Three different questions</h2>
    <dl className="grid md:grid-cols-3 gap-5">
      <div>
        <dt className="text-paper font-semibold text-sm mb-1.5">What the rules say</dt>
        <dd className="text-paper-dim text-sm leading-relaxed">This is that page. It records what state, county and local governments publish about ADUs, with a link to the source.</dd>
      </div>
      <div>
        <dt className="text-paper font-semibold text-sm mb-1.5">What applies to your property</dt>
        <dd className="text-paper-dim text-sm leading-relaxed">A feasibility study looks at one parcel: its zoning, overlays, easements, utilities and setbacks. Rules on this page are not that answer.</dd>
      </div>
      <div>
        <dt className="text-paper font-semibold text-sm mb-1.5">Whether you may build</dt>
        <dd className="text-paper-dim text-sm leading-relaxed">Only your jurisdiction decides that, by approving a permit for a real project. Nothing on ADUAtlas is an approval.</dd>
      </div>
    </dl>
  </div>
);

// The scope statement for a rules page. Deliberately near the top: it is the
// sentence that keeps a published rule from reading as permission to build.
export const ScopeNotice = ({ where, className = "" }) => (
  <div className={`bg-canvas border border-stroke rounded-3xl p-5 sm:p-6 flex items-start gap-3 ${className}`}>
    <FiInfo className="text-paper-dim mt-0.5 shrink-0" aria-hidden />
    <p className="text-paper-dim text-sm leading-relaxed">
      These are the rules published by {where}, as recorded from the sources linked below. Each rule says whether ADUAtlas has checked it. This is <span className="text-paper font-semibold">not a determination about your property</span>. What you can actually build on one parcel depends on its zoning, overlays, easements, utilities, setbacks and how your planning department reads them, and only a permit decision settles it.
    </p>
  </div>
);

// The three field states, as three visibly different chips. Same component
// everywhere, so "verified" can never be styled like "not researched".
export const FieldStateChip = ({ state }) => {
  if (state === "verified")
    return (
      <span data-chip="verified" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent text-accent-fg text-xs font-semibold">
        <FiCheckCircle aria-hidden /> Verified from source
      </span>
    );
  if (state === "not_stated")
    return (
      <span data-chip="not_stated" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-canvas border border-stroke text-paper text-xs font-medium">
        <FiHelpCircle aria-hidden /> Source did not state
      </span>
    );
  if (state === "not_researched")
    return (
      <span data-chip="not_researched" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-stroke text-paper-dim text-xs font-medium">
        <FiSearch aria-hidden /> Not yet researched
      </span>
    );
  return (
    <span data-chip="unknown" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-stroke text-paper-dim text-xs font-medium">
      <FiHelpCircle aria-hidden /> Verification status not recorded
    </span>
  );
};

// Who checked it, as its own chip. Never the accent colour and never a check
// mark: those belong to a row ADUAtlas checked. "Disputed" is the loudest of
// them on purpose.
export const VerificationChip = ({ kind }) => {
  if (kind === "unchecked_value" || kind === "unchecked")
    return (
      <span data-chip="unchecked" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-stroke text-paper text-xs font-medium">
        <FiClock aria-hidden /> {kind === "unchecked_value" ? RECORD_VERIFICATION_COPY.uncheckedValueChip : RECORD_VERIFICATION_COPY.uncheckedChip}
      </span>
    );
  if (kind === "disputed")
    return (
      <span data-chip="disputed" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-700 text-xs font-semibold">
        <FiAlertTriangle aria-hidden /> {RECORD_VERIFICATION_COPY.disputedChip}
      </span>
    );
  if (kind === "from_source")
    return (
      <span data-chip="from_source" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-canvas border border-stroke text-paper text-xs font-medium">
        <FiInfo aria-hidden /> From source
      </span>
    );
  return null;
};

const StatusChip = ({ kind }) =>
  ["unchecked_value", "unchecked", "disputed", "from_source"].includes(kind) ? <VerificationChip kind={kind} /> : <FieldStateChip state={kind} />;

// The four dates, as labelled facts. Each one carries the sentence that says
// what it means, because the whole failure mode here is a reader taking
// "checked in 2025" for "in force since 2025". The source date is only called
// "ADUAtlas last checked the source" on a row ADUAtlas checked.
const DateFacts = ({ provision, verification }) => {
  const dates = datesOf(provision);
  const checked = checkedDateWording(verification);
  const rows = [
    { key: "effective", label: "Took legal effect", value: dates.effective, help: "the date the rule itself applies from", strong: true },
    { key: "checked", label: checked.label, value: dates.checked, help: checked.help },
    { key: "published", label: "ADUAtlas record updated", value: dates.published, help: "when we last changed our own record" },
  ];
  return (
    <dl className="grid sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-stroke">
      {rows.map((row) => (
        <div key={row.key} data-date={row.key}>
          <dt className="text-paper-dim text-[0.7rem] uppercase tracking-wide">{row.label}</dt>
          <dd className={row.strong ? "text-paper text-sm font-semibold mt-0.5" : "text-paper-dim text-sm mt-0.5"}>{row.value || "Not recorded"}</dd>
          <p className="text-paper-dim text-[0.7rem] leading-snug mt-0.5">{row.help}</p>
        </div>
      ))}
    </dl>
  );
};

// Who supplied the row, as one line, from regulatory.attributionsFor(). The
// official-source statement is rendered with the source link instead.
const SupplierLine = ({ item, small = false }) => {
  if (!item) return null;
  return (
    <p data-attribution={item.kind} className={`${item.kind === "participation" ? "text-paper" : "text-paper-dim"} ${small ? "text-[0.7rem]" : "text-xs"}`}>
      {item.label}
      {item.kind === "participation" ? "." : ""}
      {item.detail && <span className="block text-paper-dim">{item.detail}</span>}
    </p>
  );
};

// One sourced rule. Everything a reader needs to check it themselves is on the
// card: which government, the value or the absence of one, who checked it, the
// source and its type, who supplied it, and the dates.
export const ProvisionCard = ({ provision, jurisdictionName, levelText }) => {
  const state = fieldStateOf(provision);
  const verification = verificationStatusOf(provision);
  const status = statusFor(state, verification);
  const value = valueOf(provision);
  const notes = String(pick(provision, ["notes", "note", "detail", "restrictions"]) || "").trim();
  const href = safeHref(pick(provision, ["source_url", "official_source_url", "source_link"]));
  const host = href ? hostOf(href) : "";
  const sourceTitle = String(pick(provision, ["source_document_title", "source_title", "document_title"]) || "").trim();
  // T4-09 (RC4 rehearsal): the section of the source the rule is in, as the
  // government published it and ADUAtlas approved it. Carried by
  // regulatory_provisions_public but never printed, so a homeowner lost where in
  // the code to look. Read from its own column only, and omitted when unrecorded.
  const citation = String(provision?.source_citation ?? "").trim();
  const sourceType = sourceTypeLabelOf(provision);
  const attributions = attributionsFor(provision, { sourceAbove: Boolean(href) });
  const official = attributions.find((item) => item.kind === "source");
  const supplier = attributions.find((item) => item.kind !== "source");
  const superseded = isSuperseded(provision);
  const supersededOn = datesOf(provision).superseded;
  const disputed = verification === RECORD_VERIFICATION.DISPUTED;

  return (
    <li
      id={pick(provision, ["id"]) ? `rule-${pick(provision, ["id"])}` : undefined}
      data-record="provision"
      data-provision-id={pick(provision, ["id"]) || undefined}
      data-field-state={pick(provision, ["field_state"]) || "unknown"}
      data-verification-status={verification || "unknown"}
      className={`scroll-mt-24 bg-canvas border rounded-2xl p-5 ${superseded ? "border-dashed border-stroke" : disputed ? "border-amber-500/40" : "border-stroke"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="text-paper font-semibold text-base">{topicLabelOf(provision)}</h4>
        <span className="flex flex-wrap gap-1.5" data-chips>
          {status.chips.map((kind) => (
            <StatusChip key={kind} kind={kind} />
          ))}
        </span>
      </div>

      {/* The value, or the honest absence of one. A rule nobody has researched
          and a rule the source is silent on both print a sentence, never a
          blank that reads like "none". */}
      {value ? (
        <p className="text-paper text-sm sm:text-base leading-relaxed mt-2 whitespace-pre-line">{value}</p>
      ) : state === "not_stated" ? (
        <p className="text-paper-dim text-sm leading-relaxed mt-2">
          {verification === RECORD_VERIFICATION.CHECKED ? "The source ADUAtlas checked does not address this." : "The source on record does not address this."} Ask {jurisdictionName} directly before you assume either answer.
        </p>
      ) : state === "not_researched" ? (
        <p className="text-paper-dim text-sm leading-relaxed mt-2">ADUAtlas has not researched this yet.</p>
      ) : (
        <p className="text-paper-dim text-sm leading-relaxed mt-2">No value recorded.</p>
      )}

      {/* Who checked it, in one sentence, when the answer is not "ADUAtlas did". */}
      {status.sentence && (
        <p data-verification-note={verification || "unknown"} className={`text-xs leading-relaxed mt-2 ${disputed ? "text-amber-700" : "text-paper-dim"}`}>
          {status.sentence}
          {disputed ? ` Confirm with ${jurisdictionName} before you rely on it.` : ""}
        </p>
      )}

      {notes && <p className="text-paper-dim text-sm leading-relaxed mt-2">{notes}</p>}

      {superseded && (
        <p className="text-paper text-xs mt-3 inline-flex items-start gap-1.5">
          <FiAlertTriangle className="mt-0.5 shrink-0" aria-hidden />
          <span>No longer current. {supersededOn ? `Superseded or repealed ${supersededOn}.` : "Recorded as superseded or repealed."} It is kept here so you can see what changed.</span>
        </p>
      )}

      {/* Which government this rule belongs to. Repeated on every card, because
          a card read on its own must never be mistaken for the city's rule
          when it is the state's. */}
      <p className="text-paper-dim text-xs mt-3">
        {levelText ? `${levelText} requirement · ` : ""}
        {jurisdictionName}
      </p>

      {/* SOURCE, and separately WHO SUPPLIED IT. Different statements (2m, 2t):
          reading a government website is not the government taking part in
          ADUAtlas, and a government account is not ADUAtlas research. */}
      <div className="mt-3 pt-3 border-t border-stroke space-y-1.5">
        {state === "not_researched" ? (
          <p className="text-paper-dim text-xs">Nothing has been checked yet, so there is no source to link.</p>
        ) : href ? (
          <p className="text-xs" data-attribution="source-link">
            <span className="text-paper-dim">{official ? `${official.label}. ` : "Source: "}</span>
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent font-medium inline-flex items-center gap-1 break-all">
              {sourceTitle || host || "Source document"} <FiExternalLink aria-hidden className="shrink-0" />
            </a>
            {sourceTitle && host && <span className="text-paper-dim"> · {host}</span>}
          </p>
        ) : official ? (
          <p className="text-paper-dim text-xs" data-attribution="source-link">{official.label}.</p>
        ) : (
          <p className="text-paper-dim text-xs">Source: not recorded. Treat this as unverified until we can link it.</p>
        )}
        {state !== "not_researched" && citation && (
          <p className="text-paper-dim text-xs" data-provision-field="citation">
            Citation: {citation}
            {/[.!?]$/.test(citation) ? "" : "."}
          </p>
        )}
        {state !== "not_researched" && sourceType && <p className="text-paper-dim text-xs">Source type: {sourceType}.</p>}
        {state !== "not_researched" && <SupplierLine item={supplier} />}
      </div>

      <DateFacts provision={provision} verification={verification} />
    </li>
  );
};

// Official links and contacts, first class alongside the rules (2m: the feature
// is Rules AND Resources). Same axes as a rule: who checked it, where it was
// read, who supplied it.
export const ResourceList = ({ resources, jurisdictionName }) => {
  if (!resources || resources.length === 0) return null;
  return (
    <div className="mt-6">
      <h4 className="text-paper font-semibold text-sm mb-3">Official links and contacts from {jurisdictionName}</h4>
      <ul className="grid sm:grid-cols-2 gap-3">
        {resources.map((resource, index) => {
          const kindKey = String(pick(resource, ["kind", "resource_kind", "type", "resource_type"]) || "");
          const kind = RESOURCE_KIND_LABELS?.[kindKey] || (kindKey ? humanize(kindKey) : "Official resource");
          const title = String(pick(resource, ["title", "label", "name"]) || "").trim();
          const href = safeHref(pick(resource, ["url", "resource_url", "link"]));
          const email = String(pick(resource, ["email", "contact_email"]) || "").trim();
          const phone = String(pick(resource, ["phone", "contact_phone"]) || "").trim();
          // Published by the government and approved by ADUAtlas, and carried by
          // government_resources_public, but never printed: a homeowner lost the
          // department to ask for and the notes written for them.
          const department = String(pick(resource, ["department_name"]) || "").trim();
          const notes = String(pick(resource, ["notes"]) || "").trim();
          // T4-09 (RC4 rehearsal): the person or desk to ask for, and their title,
          // dropped the same way. Each from its own column; a part nobody recorded
          // is left out rather than filled in.
          const contact = [resource?.contact_name, resource?.contact_title]
            .map((part) => String(part ?? "").trim())
            .filter(Boolean)
            .join(", ");
          // The source-checked date from its own column only (DEF-05).
          const checked = fmtDate(resource?.[PROVISION_DATE_KEYS.checked]);
          const state = fieldStateOf(resource);
          const verification = verificationStatusOf(resource);
          const status = statusFor(state, verification, { resource: true });
          const byAduatlas = verification === RECORD_VERIFICATION.CHECKED;
          const attributions = attributionsFor(resource);
          const official = attributions.find((item) => item.kind === "source");
          const supplierRaw = attributions.find((item) => item.kind !== "source");
          // The shared "provided by" sentence is written about a rule. On a
          // resource it says the same thing about a resource.
          const supplier =
            supplierRaw?.detail && /\bthe rule\b/.test(supplierRaw.detail)
              ? { ...supplierRaw, detail: supplierRaw.detail.replace(/\bthe rule\b/g, "this resource") }
              : supplierRaw;
          const disputed = verification === RECORD_VERIFICATION.DISPUTED;
          const key = pick(resource, ["id"]) || `${kindKey}-${index}`;
          return (
            <li
              key={key}
              data-record="resource"
              data-resource-id={pick(resource, ["id"]) || undefined}
              data-field-state={pick(resource, ["field_state"]) || "unknown"}
              data-verification-status={verification || "unknown"}
              className={`bg-canvas border rounded-2xl p-4 ${disputed ? "border-amber-500/40" : "border-stroke"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-paper-dim text-[0.7rem] uppercase tracking-wide">{kind}</p>
                {status.chips.length > 0 && (
                  <span className="flex flex-wrap gap-1.5" data-chips>
                    {status.chips.map((chip) => (
                      <StatusChip key={chip} kind={chip} />
                    ))}
                  </span>
                )}
              </div>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent font-medium text-sm inline-flex items-center gap-1 mt-1 break-all">
                  {title || hostOf(href)} <FiExternalLink aria-hidden className="shrink-0" />
                </a>
              ) : state === "not_researched" ? (
                <p className="text-paper-dim text-sm mt-1">ADUAtlas has not looked for this yet.</p>
              ) : state === "not_stated" ? (
                <p className="text-paper-dim text-sm mt-1">
                  {byAduatlas ? `We checked and ${jurisdictionName} does not publish one that we could find.` : `The source on record says ${jurisdictionName} does not publish one.`}
                </p>
              ) : (
                <p className="text-paper text-sm font-medium mt-1">{title || "Recorded without a link"}</p>
              )}
              {department && (
                <p className="text-paper-dim text-xs mt-1" data-resource-field="department">
                  {department}
                </p>
              )}
              {contact && (
                <p className="text-paper-dim text-xs mt-1" data-resource-field="contact">
                  Contact: {contact}
                </p>
              )}
              {email && (
                <p className="text-paper-dim text-xs mt-1">
                  <a href={`mailto:${email}`} className="text-accent break-all">{email}</a>
                </p>
              )}
              {phone && (
                <p className="text-paper-dim text-xs mt-1">
                  <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="text-accent">{phone}</a>
                </p>
              )}
              {notes && (
                <p className="text-paper text-xs leading-relaxed mt-2 whitespace-pre-line" data-resource-field="notes">
                  {notes}
                </p>
              )}
              {status.sentence && (
                <p data-verification-note={verification || "unknown"} className={`text-xs leading-relaxed mt-2 ${disputed ? "text-amber-700" : "text-paper-dim"}`}>
                  {status.sentence}
                </p>
              )}
              <p className="text-paper-dim text-[0.7rem] mt-2" data-date="checked">
                {checked
                  ? byAduatlas
                    ? `ADUAtlas last checked this ${checked}.`
                    : `Source read on ${checked}.${verification === RECORD_VERIFICATION.UNCHECKED ? " ADUAtlas has not checked it yet." : ""}`
                  : state === "not_researched"
                    ? "Nothing checked yet."
                    : "Source date not recorded."}
              </p>
              {state !== "not_researched" && official && (
                <p className="text-paper-dim text-[0.7rem]" data-attribution="source-link">{official.label}.</p>
              )}
              {state !== "not_researched" && <SupplierLine item={supplier} small />}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// The government participation layer, as a homeowner sees it. Three states, and
// only one of them is a badge (2m). The builder badge never appears here. The
// state comes from government_entities_public.entity_state and the website from
// its official_website_url; nothing else is read for either (DEF-11). A claimed
// entity, pending or withdrawn, is never described as one that never claimed.
export const GovernmentEntityCard = ({ entity, jurisdictionName }) => {
  if (!entity) return null;
  const name = nameOf(entity) || jurisdictionName;
  const state = entityStateOf(entity);
  const website = safeHref(pick(entity, ["official_website_url"]));
  const typeKey = String(pick(entity, ["entity_type"]) || "");

  return (
    <div className="bg-canvas border border-stroke rounded-2xl p-5 mt-6" data-entity-state={state || "unknown"}>
      {state === ENTITY_STATE.VERIFIED ? (
        <>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent text-accent-fg text-xs font-semibold">
            <FiCheckCircle aria-hidden /> Verified Government Account
          </span>
          <p className="text-paper font-semibold text-sm mt-2">{name}</p>
          <p className="text-paper-dim text-xs leading-relaxed mt-2">
            ADUAtlas confirmed that the account holder is authorised to represent {name}. That is an identity check and nothing more: ADUAtlas has not verified that the information here is legally correct, and this is not legal advice.
          </p>
        </>
      ) : state === ENTITY_STATE.CLAIMED ? (
        <>
          <p className="text-paper font-semibold text-sm">{name}</p>
          <p className="text-paper-dim text-xs leading-relaxed mt-2">
            Someone has claimed this government profile. Their authority to represent {name} is not currently verified by ADUAtlas, so the profile carries no badge.
          </p>
        </>
      ) : state === ENTITY_STATE.UNCLAIMED ? (
        <>
          <p className="text-paper font-semibold text-sm">{name}</p>
          <p className="text-paper-dim text-xs leading-relaxed mt-2">
            ADUAtlas compiled this record from public government sources. {name} has not claimed a profile here and does not take part in ADUAtlas. Being listed is not a partnership, an endorsement or a review by the government.
          </p>
        </>
      ) : (
        <p className="text-paper font-semibold text-sm">{name}</p>
      )}
      {typeKey && <p className="text-paper-dim text-xs mt-2">Government type: {humanize(typeKey)}.</p>}
      {website && (
        <p className="mt-2">
          <a href={website} target="_blank" rel="noopener noreferrer" className="text-accent text-xs font-medium inline-flex items-center gap-1 break-all">
            {hostOf(website)} <FiExternalLink aria-hidden className="shrink-0" />
          </a>
        </p>
      )}
    </div>
  );
};

// The topics nobody has researched for one government, BY NAME, from
// jurisdiction_topic_coverage (2l, DEF-15). Without this a partly researched page
// shows its rules and silently omits the rest, and a homeowner cannot tell "no
// rule" from "not researched". `topics` is null when the read failed, which is
// said rather than hidden.
export const UnresearchedTopics = ({ topics, name }) => {
  if (topics === null) {
    return (
      <p className="text-paper-dim text-xs leading-relaxed mt-6" data-unresearched-topics="unavailable">
        We could not load which topics are not yet researched for {name}. A topic with no rule shown here may simply not be researched yet.
      </p>
    );
  }
  const open = (topics || []).filter((topic) => topic?.field_state === FIELD_STATE.UNRESEARCHED);
  if (open.length === 0) return null;
  return (
    <div className="mt-6" data-unresearched-topics="list">
      <h4 className="text-paper font-semibold text-sm mb-2">We have not researched these topics for {name} yet.</h4>
      <p className="text-paper-dim text-xs leading-relaxed mb-3">
        No rule is shown for them because ADUAtlas has not looked, not because {name} has none. Ask the planning or zoning department about any of them.
      </p>
      <ul className="flex flex-wrap gap-2">
        {open.map((topic) => (
          <li
            key={topic.topic_key}
            data-topic-key={topic.topic_key}
            data-topic-state="not_yet_researched"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-stroke text-paper-dim text-xs"
          >
            <FiSearch aria-hidden /> {topic.topic_label || PROVISION_TOPIC_LABELS?.[topic.topic_key] || humanize(topic.topic_key)}
          </li>
        ))}
      </ul>
    </div>
  );
};

// What an unresearched place says. The wording is 2l's, near enough to the
// letter, and it is the same sentence wherever the gap appears.
//
// T4-08 (RC4 rehearsal): unless the jurisdiction carries its own public note.
// The console's "Note shown on the public page" (jurisdictions.research_note)
// promises homeowners see it here in place of the standard sentence that
// requirements are not verified yet, and until now no page rendered it. It is
// written by an admin for homeowners and shown as written.
export const NotResearchedNotice = ({ name, scope = "jurisdiction", note = "", className = "" }) => {
  const publicNote = String(note ?? "").trim();
  return (
    <div className={`bg-canvas border border-dashed border-stroke rounded-3xl p-6 ${className}`} data-empty-state={publicNote ? "jurisdiction-note" : "standard"}>
      {publicNote ? (
        <p className="text-paper text-sm leading-relaxed whitespace-pre-line" data-public-note>
          {publicNote}
        </p>
      ) : (
        <>
          <p className="text-paper font-semibold text-sm mb-2">We have not verified ADU requirements for {name} yet.</p>
          <p className="text-paper-dim text-sm leading-relaxed">
            We would rather say that than show you something we have not read in an official source. Check with your local planning or zoning department for current requirements
            {scope === "state" ? ", and with the state agency that publishes ADU law where you are." : "."}
          </p>
        </>
      )}
      <p className="text-paper-dim text-sm leading-relaxed mt-3">
        ADUAtlas adds jurisdictions as we research them, in the places our homeowners are, so this page may be filled in later. Nothing is ever filled in to make our coverage look complete.
      </p>
    </div>
  );
};

// One level of government, as its own answer. The heading names the government
// and the level, the rules under it are that government's rules, and nothing
// from another level is mixed in (2m).
const LevelSection = ({ jurisdiction, provisions, resources, topics, entity, isTarget }) => {
  const name = nameOf(jurisdiction) || "This jurisdiction";
  const label = levelLabel(jurisdiction);
  const rows = (provisions || []).filter(isShowable);
  const current = rows.filter((p) => !isSuperseded(p));
  const historical = rows.filter(isSuperseded);
  const empty = current.length === 0 && historical.length === 0 && (!resources || resources.length === 0);

  return (
    <section
      aria-label={`${label} level: ${name}`}
      data-level={isTarget ? "target" : levelOf(jurisdiction) || "level"}
      data-jurisdiction-id={idOf(jurisdiction) || undefined}
      className={`rounded-3xl p-6 sm:p-8 border ${isTarget ? "bg-surface-1-solid border-stroke" : "bg-canvas border-stroke"}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <h3 className="font-display text-paper text-2xl">{name}</h3>
        <span className="text-paper-dim text-xs uppercase tracking-wide">{label} level</span>
      </div>
      <p className="text-paper-dim text-sm leading-relaxed mb-5">
        {isTarget
          ? `What ${name} itself publishes about ADUs.`
          : `${label} requirements that ${name} publishes. They are recorded separately from local ordinances and ADUAtlas does not merge the two.`}
      </p>

      {empty ? (
        <NotResearchedNotice name={name} scope={levelOf(jurisdiction) === "state" ? "state" : "jurisdiction"} note={jurisdiction?.research_note} />
      ) : (
        <>
          {current.length > 0 ? (
            <ul className="grid gap-4">
              {current.map((provision, index) => (
                <ProvisionCard
                  key={pick(provision, ["id"]) || `${topicKeyOf(provision)}-${index}`}
                  provision={provision}
                  jurisdictionName={name}
                  levelText={label}
                />
              ))}
            </ul>
          ) : (
            <p className="text-paper-dim text-sm leading-relaxed">No current rules are recorded for {name}. The links and the superseded records below are what we hold.</p>
          )}

          {historical.length > 0 && (
            <div className="mt-6">
              <h4 className="text-paper font-semibold text-sm mb-3">No longer current</h4>
              <p className="text-paper-dim text-xs leading-relaxed mb-3">Kept so a change is visible rather than silently replaced. Do not rely on these.</p>
              <ul className="grid gap-4">
                {historical.map((provision, index) => (
                  <ProvisionCard
                    key={pick(provision, ["id"]) || `old-${topicKeyOf(provision)}-${index}`}
                    provision={provision}
                    jurisdictionName={name}
                    levelText={label}
                  />
                ))}
              </ul>
            </div>
          )}

          <UnresearchedTopics topics={topics} name={name} />

          <ResourceList resources={resources} jurisdictionName={name} />
        </>
      )}

      <GovernmentEntityCard entity={entity} jurisdictionName={name} />
    </section>
  );
};

// ── At a glance ─────────────────────────────────────────────────────────────
// The six questions a homeowner asks first, answered ONLY from the published
// rules on this page, word for word. It is a view, never a second content layer:
// nothing here is written, summarised or inferred, so a rule changes in one
// place. Each level answers for itself, labelled, side by side, exactly as in
// the level sections below (2m: nothing merged, nothing inherited). A question
// no level has answered says so. Every answer links to its full rule and source.
const GLANCE = [
  ["adu_allowed", "Can I build an ADU?"],
  ["number_allowed", "How many?"],
  ["max_size", "Maximum size"],
  ["height_limit", "Maximum height"],
  ["owner_occupancy_required", "Owner occupancy"],
  ["short_term_rental_allowed", "Short-term rental"],
];

const glanceRows = (chain) =>
  GLANCE.map(([topic, question]) => ({
    topic,
    question,
    answers: chain
      .map((level) => {
        const provision = (level.provisions || []).find((p) => isShowable(p) && !isSuperseded(p) && topicKeyOf(p) === topic);
        return provision ? { level, provision } : null;
      })
      .filter(Boolean)
      // the place itself first, then the governments above it
      .sort((a, b) => Number(b.level.isTarget) - Number(a.level.isTarget)),
  }));

const AtAGlance = ({ chain, name }) => {
  const rows = glanceRows(chain);
  if (!rows.some((row) => row.answers.length)) return null;
  return (
    <section aria-label="At a glance" data-at-a-glance className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
      <h2 className="font-display text-paper text-2xl">At a glance</h2>
      <p className="text-paper-dim text-sm leading-relaxed mt-2 mb-5">
        Taken word for word from the published rules below, with the government each one comes from. These are rules for all of {name}, not a determination about your parcel.
      </p>
      <dl className="grid gap-4">
        {rows.map((row) => (
          <div key={row.topic} data-glance-topic={row.topic} className="grid sm:grid-cols-[12rem_1fr] gap-x-6 gap-y-1 border-t border-stroke pt-4">
            <dt className="text-paper font-semibold text-sm">{row.question}</dt>
            <dd className="grid gap-3 min-w-0">
              {row.answers.length === 0 ? (
                <p className="text-paper-dim text-sm">No published rule yet.</p>
              ) : (
                row.answers.map(({ level, provision }) => {
                  const state = fieldStateOf(provision);
                  const status = statusFor(state, verificationStatusOf(provision));
                  const value = state === "verified" ? valueOf(provision) : "";
                  const id = pick(provision, ["id"]);
                  return (
                    <div key={id || idOf(level.jurisdiction)} className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-paper-dim text-xs uppercase tracking-wide">{placeNameOf(level.jurisdiction) || nameOf(level.jurisdiction)}</span>
                        {status.chips.map((kind) => (
                          <StatusChip key={kind} kind={kind} />
                        ))}
                      </div>
                      {value ? (
                        <p className="text-paper text-sm leading-relaxed whitespace-pre-line line-clamp-3 break-words">{value}</p>
                      ) : (
                        <p className="text-paper-dim text-sm">{state === "not_stated" ? "The source does not address this." : "No value recorded."}</p>
                      )}
                      {id && (
                        <a href={`#rule-${id}`} className="tap-target text-accent text-xs font-medium inline-flex items-center gap-1 mt-1">
                          Full rule and source <FiArrowRight aria-hidden />
                        </a>
                      )}
                    </div>
                  );
                })
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6 pt-5 border-t border-stroke">
        <Link to="/feasibility" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
          Check my property <FiArrowRight aria-hidden />
        </Link>
        <p className="text-paper-dim text-xs leading-relaxed">See what these rules mean for one address: zoning, lot size, setbacks and what could stop the project.</p>
      </div>
    </section>
  );
};

// Where two levels say something about the same topic. Both are shown, both
// attributed, and ADUAtlas does not pick a winner (2m).
const ConflictNotice = ({ conflicts }) => {
  if (conflicts.length === 0) return null;
  return (
    <section aria-label="Where levels of government differ" className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
      <h2 className="font-display text-paper text-xl sm:text-2xl mb-2">More than one level of government addresses the same thing</h2>
      <p className="text-paper-dim text-sm leading-relaxed mb-5">
        State law, a county ordinance and a local ordinance can each speak to the same topic, and they do not always say the same thing. ADUAtlas shows you each answer with its source instead of merging them into one. Which one governs your project is a question for your planning department, and sometimes for a lawyer.
      </p>
      <ul className="grid gap-4">
        {conflicts.map((conflict) => (
          <li key={conflict.topic} className="bg-surface-1-solid border border-stroke rounded-2xl p-4">
            <p className="text-paper font-semibold text-sm mb-2">{conflict.label}</p>
            <ul className="grid sm:grid-cols-2 gap-3">
              {conflict.entries.map((entry, index) => (
                <li key={`${conflict.topic}-${index}`} className="bg-canvas border border-stroke rounded-xl p-3">
                  <p className="text-paper-dim text-[0.7rem] uppercase tracking-wide">{entry.levelText} · {entry.jurisdictionName}</p>
                  <p className="text-paper text-sm mt-1">{entry.value}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ── Data assembly ───────────────────────────────────────────────────────────
// fetchProvisions and fetchResources are called per jurisdiction. Either one
// may legitimately answer with the ancestors' rows as well (that is what the
// contract's group-by-level helper is for), so rows are bucketed by the
// jurisdiction_id they carry, deduplicated by id, and only the levels that are
// still missing are fetched again. Neither shape produces a duplicated card and
// neither shape silently loses a level.
const bucketByJurisdiction = (rows, buckets) => {
  for (const row of rows) {
    const key = String(pick(row, ["jurisdiction_id", "jurisdiction"]) || "");
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, new Map());
    const bucket = buckets.get(key);
    const id = String(pick(row, ["id"]) || `${topicKeyOf(row)}-${bucket.size}`);
    if (!bucket.has(id)) bucket.set(id, row);
  }
};

const groupByLevelHelper =
  regulatory.groupProvisionsByLevel ||
  regulatory.groupByLevel ||
  null;

// The contract promises a grouping helper but not its name, so it is resolved
// off the module namespace and used when it is there. It is a convenience for
// ORDERING, never the thing that decides which rules belong to which
// government: that is the jurisdiction_id on each row, above.
const orderLevels = (chain) => {
  if (typeof groupByLevelHelper !== "function") return chain;
  try {
    const grouped = groupByLevelHelper(chain.map((level) => level.jurisdiction));
    const order = (Array.isArray(grouped) ? grouped : Object.values(grouped || {})).flat().map((row) => String(idOf(row) ?? ""));
    if (order.length !== chain.length) return chain;
    const byId = new Map(chain.map((level) => [String(level.id), level]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean);
    return ordered.length === chain.length ? ordered : chain;
  } catch {
    return chain;
  }
};

const LEVEL_RANK = { country: 0, state: 1, territory: 1, district: 1, county: 2, parish: 2, borough: 2 };
const rankOf = (jurisdiction) => (LEVEL_RANK[levelOf(jurisdiction)] ?? 3);

// Which topics more than one level of government answers DIFFERENTLY. Computed
// on every render rather than memoised: the lists are a handful of rows, and
// nothing here is worth a stale answer about whose rule a homeowner is reading.
const conflictsIn = (chain) => {
  const byTopic = new Map();
  for (const level of chain) {
    const name = nameOf(level.jurisdiction);
    const label = levelLabel(level.jurisdiction);
    for (const provision of level.provisions) {
      if (!isShowable(provision) || isSuperseded(provision)) continue;
      const topic = topicKeyOf(provision);
      const value = valueOf(provision);
      if (!topic || !value) continue;
      if (!byTopic.has(topic)) byTopic.set(topic, { topic, label: topicLabelOf(provision), entries: [] });
      byTopic.get(topic).entries.push({ levelText: label, jurisdictionName: name, value });
    }
  }
  return [...byTopic.values()].filter((group) => {
    if (group.entries.length < 2) return false;
    const distinct = new Set(group.entries.map((entry) => entry.value.replace(/\s+/g, " ").trim().toLowerCase()));
    return distinct.size > 1;
  });
};

const STATE_LEVELS = ["state", "federal_district", "territory"];

const RulesJurisdiction = () => {
  const { stateCode = "", slug = "" } = useParams();
  // The state segment, resolved to its two-letter code: "mo", "MO" and
  // "missouri" are the same state; anything else names none and is "missing".
  const code = stateCodeFromParam(stateCode);
  const routeKey = `${String(stateCode).toLowerCase()}/${slug}`;
  const [loaded, setLoaded] = useState(null);

  // One state object, stamped with the route it was loaded for, and read
  // through a staleness check at render time rather than reset inside the
  // effect. Two reasons: resetting state synchronously in an effect cascades
  // renders, and a stamped result cannot be shown under the wrong heading. When
  // a homeowner moves from one city to another, this page says "loading", never
  // the previous city's rules beneath the new city's name. A segment that names
  // no state is "missing" without a read: there is nothing to look up.
  const EMPTY_VIEW = { key: routeKey, target: null, chain: [], coverage: null };
  const view = !code
    ? { ...EMPTY_VIEW, status: "missing" }
    : loaded && loaded.key === routeKey
      ? loaded
      : { ...EMPTY_VIEW, status: "loading" };
  const { status, target, chain, coverage } = view;

  useEffect(() => {
    if (!code) return undefined;
    let live = true;

    const run = async () => {
      // 1. The jurisdiction itself, by (state, slug): the key the database
      //    makes unique. A slug alone is shared across states (two Springfields)
      //    and is never used to pick a record (DEF-06).
      const found = await fetchJurisdiction({ stateCode: code, slug });
      if (!live) return;
      if (!found?.ok) {
        setLoaded({ key: routeKey, status: "error", target: null, chain: [], coverage: null });
        return;
      }
      const record = found.jurisdiction && stateCodeOf(found.jurisdiction) === code ? found.jurisdiction : null;
      if (!record) {
        setLoaded({ key: routeKey, status: "missing", target: null, chain: [], coverage: null });
        return;
      }

      // 2. The ancestors, for DISPLAY. Resolved out of the state's own list of
      //    jurisdictions plus the state rows, which is all the geography this
      //    page needs. Containment is never read as permission. The record's
      //    coverage comes with them: it decides whether the page asks to be
      //    indexed, and the database decides that, not this page (2l).
      const [siblings, states, coverageRow] = await Promise.all([
        fetchJurisdictions(code).then(asRows).catch(() => []),
        fetchStates().then(asRows).catch(() => []),
        fetchCoverage(idOf(record))
          .then((result) => (result?.ok ? result.coverage : null))
          .catch(() => null),
      ]);
      if (!live) return;

      const byId = new Map();
      for (const row of [...states, ...siblings, record]) {
        const id = idOf(row);
        if (id !== undefined) byId.set(String(id), row);
      }

      const ancestors = [];
      const seen = new Set([String(idOf(record))]);
      let cursor = record;
      for (let hop = 0; hop < 6; hop += 1) {
        const parentId = parentIdOf(cursor);
        if (parentId === undefined) break;
        const key = String(typeof parentId === "object" ? idOf(parentId) : parentId);
        if (!key || seen.has(key)) break;
        const parent = byId.get(key) || (typeof parentId === "object" ? parentId : null);
        if (!parent) break;
        seen.add(key);
        // The country level carries no ADU rules and only adds noise.
        if (levelOf(parent) !== "country") ancestors.push(parent);
        cursor = parent;
      }

      // A state row that the parent chain did not reach (a record seeded
      // without a parent, for instance) is still shown, because a homeowner
      // reading a city must see the state requirements that exist.
      if (levelOf(record) !== "state" && !ancestors.some((row) => levelOf(row) === "state")) {
        const stateRow = states.find((row) => stateCodeOf(row) === code && levelOf(row) === "state") || states.find((row) => stateCodeOf(row) === code);
        if (stateRow && String(idOf(stateRow)) !== String(idOf(record))) ancestors.push(stateRow);
      }

      const levels = [...ancestors.sort((a, b) => rankOf(a) - rankOf(b)), record].filter((row, index, list) => list.findIndex((other) => String(idOf(other)) === String(idOf(row))) === index);

      // 3. Rules, resources, topic coverage and the government entity, per level.
      const provisionBuckets = new Map();
      const resourceBuckets = new Map();
      const fetchedFor = new Set();
      const entities = new Map();
      const topicsFor = new Map();

      const loadLevel = async (jurisdiction) => {
        const id = idOf(jurisdiction);
        if (id === undefined) return;
        const key = String(id);
        if (fetchedFor.has(key)) return;
        fetchedFor.add(key);
        const [provisions, resources, entity, topics] = await Promise.all([
          fetchProvisions(id).then(asRows).catch(() => []),
          fetchResources(id).then(asRows).catch(() => []),
          fetchEntity(id).then(asRow).catch(() => null),
          fetchTopicCoverage(id)
            .then((result) => (result?.ok ? result.topics || [] : null))
            .catch(() => null),
        ]);
        bucketByJurisdiction(provisions, provisionBuckets);
        bucketByJurisdiction(resources, resourceBuckets);
        // Rows that arrived without a jurisdiction_id belong to the level we
        // asked about; assuming anything else would move a rule between
        // governments, which is the one mistake this page may not make.
        const orphanProvisions = provisions.filter((row) => !pick(row, ["jurisdiction_id", "jurisdiction"]));
        const orphanResources = resources.filter((row) => !pick(row, ["jurisdiction_id", "jurisdiction"]));
        if (orphanProvisions.length) bucketByJurisdiction(orphanProvisions.map((row) => ({ ...row, jurisdiction_id: id })), provisionBuckets);
        if (orphanResources.length) bucketByJurisdiction(orphanResources.map((row) => ({ ...row, jurisdiction_id: id })), resourceBuckets);
        if (entity) entities.set(key, entity);
        topicsFor.set(key, topics);
      };

      // The target level first, then the ancestors that its answer did not
      // already cover.
      await loadLevel(record);
      if (!live) return;
      await Promise.all(levels.filter((row) => !provisionBuckets.has(String(idOf(row))) || !fetchedFor.has(String(idOf(row)))).map(loadLevel));
      if (!live) return;

      const assembled = levels.map((jurisdiction) => {
        const key = String(idOf(jurisdiction));
        return {
          id: key,
          jurisdiction,
          provisions: [...(provisionBuckets.get(key)?.values() || [])],
          resources: [...(resourceBuckets.get(key)?.values() || [])],
          topics: topicsFor.has(key) ? topicsFor.get(key) : null,
          entity: entities.get(key) || null,
          isTarget: key === String(idOf(record)),
        };
      });

      setLoaded({ key: routeKey, status: "ready", target: record, chain: orderLevels(assembled), coverage: coverageRow });
    };

    run().catch(() => {
      if (live) setLoaded({ key: routeKey, status: "error", target: null, chain: [], coverage: null });
    });
    return () => {
      live = false;
    };
  }, [routeKey, slug, code]);

  // The head, once the record is in: the jurisdiction and its state in the
  // title, a description that promises exactly what the page holds, and the
  // record's OWN canonical url, /rules/<code>/<slug>, whichever spelling of the
  // state the visitor typed. A state-level record reached through this route
  // canonicalises to its state page.
  useEffect(() => {
    if (status !== "ready" || !target) return;
    const name = nameOf(target) || "Jurisdiction";
    const recordCode = stateCodeOf(target) || code;
    const recordSlug = pick(target, ["slug"]) || slug;
    const checked = chain.reduce(
      (total, level) =>
        total +
        level.provisions.filter(
          (p) => isShowable(p) && !isSuperseded(p) && fieldStateOf(p) === "verified" && verificationStatusOf(p) === RECORD_VERIFICATION.CHECKED,
        ).length,
      0,
    );
    setHead({
      title: `ADU rules in ${name}${recordCode ? `, ${recordCode}` : ""} · ADUAtlas`,
      description: checked
        ? `What ${name} and the state and county above it publish about ADUs: ${checked} requirement${checked === 1 ? "" : "s"} ADUAtlas checked in official sources, each with its link, its source type and the date it was checked.`
        : `What ADUAtlas holds about ADU requirements in ${name}, with the official sources behind it. Where we have not researched something, the page says so instead of guessing.`,
      path: STATE_LEVELS.includes(levelOf(target))
        ? `/rules/${recordCode.toLowerCase()}`
        : `/rules/${recordCode.toLowerCase()}/${recordSlug}`,
    });
  }, [status, target, chain, slug, code]);

  // Indexing (2l, DEF-03). A page asks to be indexed only when
  // jurisdiction_coverage_public says it carries enough verified content. A thin
  // page, a missing or unpublished record, a url naming no state and a failed
  // read all ask not to be; an unreadable coverage row counts as not indexable.
  const noindex = status === "missing" || status === "error" || (status === "ready" && !isIndexable(coverage));
  useEffect(() => {
    if (!noindex) return undefined;
    setRobots("noindex");
    return () => setRobots(null);
  }, [noindex]);

  const conflicts = conflictsIn(chain);

  // Links back to the state use the resolved code, never the raw segment.
  const stateSegment = String(code || "").toLowerCase();

  if (status === "loading") return <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-20 text-paper-dim text-sm">Loading…</div>;

  if (status === "error")
    return (
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl py-20">
        <h1 className="font-display text-paper text-3xl mb-3">We could not load this page</h1>
        <p className="text-paper-dim text-sm leading-relaxed mb-6">
          Something went wrong reading our regulatory records. Nothing is shown rather than something unverified. Please try again, and check with your local planning or zoning department in the meantime.
        </p>
        <Link to="/rules" className="text-accent font-medium text-sm inline-flex items-center gap-1">
          <FiArrowLeft aria-hidden /> All states
        </Link>
      </div>
    );

  if (status === "missing" || !target)
    return (
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl py-20">
        <h1 className="font-display text-paper text-3xl mb-3">We do not have a published record for this jurisdiction</h1>
        <p className="text-paper-dim text-sm leading-relaxed mb-6">
          ADUAtlas supports all fifty states, and we research jurisdictions one at a time. There is no published record at this address. Check with your local planning or zoning department for current requirements.
        </p>
        <div className="flex flex-wrap gap-4">
          {stateSegment && (
            <Link to={`/rules/${stateSegment}`} className="text-accent font-medium text-sm inline-flex items-center gap-1">
              <FiArrowLeft aria-hidden /> Jurisdictions we have in this state
            </Link>
          )}
          <Link to="/rules" className="text-accent font-medium text-sm inline-flex items-center gap-1">
            All states
          </Link>
        </div>
      </div>
    );

  const name = nameOf(target) || "This jurisdiction";
  const label = levelLabel(target);
  const website = safeHref(pick(target, ["website_url", "official_website", "website", "official_url"]));
  // The county in the trail is an ANCESTOR; a county page does not list itself
  // twice.
  const county = chain.find((level) => !level.isTarget && ["county", "parish", "borough"].includes(levelOf(level.jurisdiction)));
  const stateLevel = chain.find((level) => levelOf(level.jurisdiction) === "state");
  const anythingHeld = chain.some((level) => level.provisions.filter(isShowable).length > 0 || level.resources.length > 0);
  // The invitation to claim the profile is for a government that has not
  // claimed it. A claimed or verified entity is not asked again, and an entity
  // whose state cannot be read is not asked either (DEF-11).
  const targetEntity = chain.find((level) => level.isTarget)?.entity || null;
  const invitesClaim = !targetEntity || entityStateOf(targetEntity) === ENTITY_STATE.UNCLAIMED;
  // T4-06 (RC4a, Richard's decision): claiming happens IN the product. The
  // invitation opens /gov/claim with this record preselected; a signed-out
  // visitor signs in first and comes back to it. Email stays as the fallback.
  // A claim is still only a request: verification and its requirements are
  // unchanged (claim_government_entity, 0012/0014).
  // The in-app link needs an entity to claim. With none recorded here (or none
  // readable), /gov/claim could only say there is nothing to claim, so the
  // primary action is the email that asks ADUAtlas to add the profile, which a
  // claim can never create.
  const claimInApp = Boolean(targetEntity) && entityStateOf(targetEntity) === ENTITY_STATE.UNCLAIMED;
  const claimHref = `/gov/claim?${new URLSearchParams({
    ...(code ? { state: code } : {}),
    ...(idOf(target) ? { jurisdiction: String(idOf(target)) } : {}),
    ...(targetEntity && idOf(targetEntity) ? { entity: String(idOf(targetEntity)) } : {}),
  }).toString()}`;
  // Mail subjects carry the state, so reports about two places with the same
  // name can be told apart.
  const placeLabel = `${name}${code ? `, ${code}` : ""}`;

  return (
    <div>
      <section className="bg-surface-1-solid border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl py-12 sm:py-16">
          {/* Breadcrumb: geography and display only. The line beneath it says
              so, because a hierarchy on screen invites a reader to assume an
              authority that ADUAtlas does not give it (2m). */}
          <nav aria-label="Where this is" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-paper-dim mb-4">
            <Link to="/rules" className="tap-target hover:text-paper">ADU rules</Link>
            <span aria-hidden>/</span>
            {stateLevel ? (
              <>
                <Link to={`/rules/${stateSegment}`} className="tap-target hover:text-paper">{placeNameOf(stateLevel.jurisdiction)}</Link>
                <span aria-hidden>/</span>
              </>
            ) : stateSegment ? (
              <>
                <Link to={`/rules/${stateSegment}`} className="tap-target hover:text-paper">{stateSegment.toUpperCase()}</Link>
                <span aria-hidden>/</span>
              </>
            ) : null}
            {county && (
              <>
                <span>{placeNameOf(county.jurisdiction)}</span>
                <span aria-hidden>/</span>
              </>
            )}
            <span className="text-paper">{name}</span>
          </nav>

          <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05]">{name}</h1>
          <p className="text-paper-dim text-sm mt-3">
            {label} level{stateLevel ? ` · ${placeNameOf(stateLevel.jurisdiction)}` : ""}
          </p>
          <p className="text-paper-dim text-xs leading-relaxed mt-3 max-w-2xl">
            That trail is geography, not authority. A state, a county and a city each publish their own rules on ADUAtlas, and being inside one of them gives no government control over another's record here.
          </p>
          {website && (
            <p className="mt-4">
              <a href={website} target="_blank" rel="noopener noreferrer" className="text-accent font-medium text-sm inline-flex items-center gap-1 break-all">
                Official website <FiExternalLink aria-hidden />
              </a>
            </p>
          )}
        </div>
      </section>

      <section className="container mx-auto px-5 sm:px-8 max-w-5xl py-10 sm:py-14 grid gap-6">
        <AtAGlance chain={chain} name={placeNameOf(target) || name} />
        {anythingHeld && <ScopeNotice where={`${name} and the governments above it`} />}
        {anythingHeld && <ThreeStateLegend />}

        {!anythingHeld && <NotResearchedNotice name={name} note={target?.research_note} />}

        {/* One block per level, in geographic order, each one its own sourced
            answer. Nothing is merged, nothing is inherited, nothing is
            inferred from containment. */}
        {chain.map((level) => (
          <LevelSection
            key={level.id}
            jurisdiction={level.jurisdiction}
            provisions={level.provisions}
            resources={level.resources}
            topics={level.topics}
            entity={level.entity}
            isTarget={level.isTarget}
          />
        ))}

        <ConflictNotice conflicts={conflicts} />

        {/* Property-specific: NOT DETERMINED. This block is not decoration. It
            is the fourth level of the answer and it is deliberately as loud as
            the three above it (2m). */}
        <section aria-label="Your property" className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
            <h3 className="font-display text-paper text-2xl">Your property</h3>
            <span className="text-paper-dim text-xs uppercase tracking-wide">Not determined</span>
          </div>
          <p className="text-paper-dim text-sm leading-relaxed">
            ADUAtlas has made no finding about any particular parcel on this page, and the rules above do not tell you what you can build. Your lot's zoning district, overlays, easements, utility connections, existing structures, setbacks and your planning department's reading of all of it decide that. A feasibility study is how ADUAtlas looks at one property; a permit decision from {name} is the only thing that settles it.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <Link to="/feasibility-study" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press">
              How a feasibility study works <FiArrowRight aria-hidden />
            </Link>
            <Link to="/course-outline" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition press">
              Learn the process first
            </Link>
          </div>
        </section>

        <ConceptsApartNotice />

        <div className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-8">
          <h2 className="font-display text-paper text-xl mb-3">Something out of date, or missing?</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-4">
            ADU law changes, and a page is only as current as the date beside each rule. If you find a rule that has changed, tell us and we will check the source again.
          </p>
          {invitesClaim && (
            <p className="text-paper-dim text-sm leading-relaxed mb-4">
              If you work for {name} and want to keep this record accurate, ADUAtlas offers free government accounts. A claim is not verification: we confirm that you are authorised to represent the entity before anything is attributed to it, and ADUAtlas reviews and publishes what you submit.
            </p>
          )}
          {/* items-center: the tap-target links are 44px tall on a touch screen,
              and a stretched sibling would otherwise sit with its text at the
              top of the row (R3-30, T4-22). */}
          <div className="flex flex-wrap items-center gap-4">
            <a href={`mailto:hello@aduatlas.com?subject=${encodeURIComponent(`Correction: ${placeLabel}`)}`} className="tap-target text-accent font-medium text-sm">
              Report a correction
            </a>
            {claimInApp && (
              <Link to={claimHref} className="tap-target text-accent font-medium text-sm">
                Claim this government profile
              </Link>
            )}
            {claimInApp && (
              <a href={`mailto:hello@aduatlas.com?subject=${encodeURIComponent(`Government account: ${placeLabel}`)}`} className="tap-target text-paper-dim hover:text-paper font-medium text-sm">
                Questions about a government account? Write to us
              </a>
            )}
            {invitesClaim && !claimInApp && (
              <a href={`mailto:hello@aduatlas.com?subject=${encodeURIComponent(`Government account: ${placeLabel}`)}`} className="tap-target text-accent font-medium text-sm">
                Ask ADUAtlas to add this government profile
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default RulesJurisdiction;
