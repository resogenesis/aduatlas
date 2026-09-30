// /api/admin/regulatory/* — ADU Rules and Resources for the admin console
// (decisions 2l and 2m). Dispatched by api/admin/[...action].js so the Vercel
// function count does not move. Service role + requireAdmin on every route.
//
//   GET  regulatory/meta                     vocabularies, the fifty states, coverage counts
//   GET  regulatory/jurisdictions[?state=AZ][?q=]   state index, one state's jurisdictions, or a search
//   GET  regulatory/jurisdiction?id=...      one record + provisions + resources + entity + memberships
//   POST regulatory/jurisdiction-save  { jurisdiction }
//   POST regulatory/provision-save     { provision }
//   POST regulatory/provision-retire   { id, action: supersede, superseded_date, note? } | { id, action: retract, reason }
//   POST regulatory/resource-save      { resource }
//   POST regulatory/resource-retire    { id, action: supersede, superseded_date } | { id, action: retract, reason }
//   GET  regulatory/entities[?claim_status=] government entities + membership counts
//   POST regulatory/entity-save        { entity }
//   POST regulatory/entity-invite      { id, email?, note? }   NOT AVAILABLE, see below
//   POST regulatory/membership-verify  { id, checked, method?, note? }
//   POST regulatory/membership-revoke  { id, reason }
//   GET  regulatory/submissions[?status=]    the review queue
//   GET  regulatory/submission?id=...        what was submitted beside what ADUAtlas publishes
//   POST regulatory/submission-publish { id, source_checked_date, verification_status?, note?, acknowledge_authority_mismatch? }
//                                      the date and the status are ADUAtlas's and come from
//                                      the admin; the submission's own copies are ignored
//   POST regulatory/submission-decline { id, reason }
//   GET  regulatory/versions?target_kind=&target_id=   history, read only
//
// and the government and partnership administration of 2p, whose routes are
// listed above their own section further down this file (gov-*).
//
// THE SCHEMA IS MIGRATION 0012 AND 0014, AND THIS MODULE SPEAKS IT.
// An earlier draft of this file was written against a schema that was never
// migrated, so every write it attempted named columns the database does not
// have: `type` for jurisdiction_type, `is_published` for published_at,
// `topic` for topic_key, `kind` for resource_type, `notes` for admin_note or
// research_note, `superseded_date` for superseded_or_repealed_date,
// `published_updated_date` for record_published_at, `claim_status` for a state
// the database derives, `verified_by` for verified_by_app_user_id, `user_id`
// for government_user_id, `target_kind`/`target_id` for a submission's kind and
// its two target columns, and a claim-code column set that does not exist at
// all. Every one of those names is now the name 0012 defines. The vocabularies
// below are 0012's CHECK constraints and its regulatory_topics seed, not a
// parallel list.
//
// WHAT THE DATABASE OWNS AND THIS MODULE NEVER WRITES:
//   regulatory_provisions.is_published    generated from review_status, the
//   government_resources.is_published     supersession date and the retraction.
//   record_published_at                   stamped by the guard triggers when a
//                                         record is published and its content
//                                         actually changed.
//   first_published_at                    stamped once, never moved.
//   jurisdictions.path, state_code        derived from the immediate parent.
//   government_entities.verified_at       stamped where verification happens.
//   a stored claim_status                 the three states of 2m are derived
//                                         from claimed_at and
//                                         verification_status, exactly as
//                                         government_entity_state() derives
//                                         them, and never stored twice.
//   a stored coverage_status              coverage is counted from the published
//                                         rows every time it is asked for, so it
//                                         cannot drift from the data (2l).
//
// PUBLICATION GOES THROUGH THE SERVICE-ROLE-ONLY admin_* RPCs, NEVER A DIRECT
// WRITE. admin_publish_provision() supersedes the rule it replaces and KEEPS it,
// which is the whole of "history is never overwritten" and is also the only way
// past regulatory_provisions_current_uidx. admin_publish_resource() does the
// same for a resource, and admin_review_submission() moves a submission's review
// fields without touching what was submitted. Those functions also write the
// audit row that no API role may insert, and each takes the acting admin's id
// because "the service key did it" is not an answer to who did it. A save here
// therefore writes a DRAFT and then asks the database to publish it.
//
// AMY'S SCOPE IS FIVE THINGS (2f) and this module is three of them: regulatory
// resources, government entity claims, and reviewing and publishing government
// submissions. 2p widens the third one by exactly the partnership administration
// it names -- review a claim, verify or reject identity, grant explicit
// jurisdiction authority, activate, suspend and reactivate a partnership, control
// whether sponsored resident access is live, and see link and code status -- and
// not one step further into general site administration. There is no general
// administration here and none is to be added.
//
// AUTHORITY IS EXPLICIT, NEVER GEOGRAPHIC (2m). The only source of authority is a
// live row in government_jurisdiction_grants naming ONE entity and ONE
// jurisdiction, matched by equality. An earlier draft of this file compared a
// submission's jurisdiction with government_entities.jurisdiction_id, which 0012
// calls "the most tempting shortcut in the schema" and which no policy reads:
// an entity's own seat is not authority. authority_mismatch is now computed from
// the grant rows, and jurisdictions.parent_id is read for DISPLAY only.
//
// THREE FIELD STATES, NEVER BLURRED (2b applied to regulation): every provision
// and every resource carries field_state = verified_from_source /
// source_did_not_state / not_yet_researched. not_yet_researched is the DEFAULT
// for anything new, so nobody is nudged into inventing a value. The server
// enforces the same combinations the database constrains:
//   verified_from_source  requires a value, a source URL, a source type and a
//                         source checked date. A claim never loses its source.
//   source_did_not_state  carries no value, and DOES carry a source URL and a
//                         checked date: "we read the ordinance on this date and
//                         it says nothing" is knowledge, not absence.
//   not_yet_researched    carries no value, no source and no dates at all.
//
// FOUR DATES, NEVER ONE (2m). effective_date is when the rule legally took
// effect; source_checked_date is when ADUAtlas last looked at the source;
// record_published_at is when ADUAtlas last changed its own record, and the
// DATABASE stamps it so a client cannot pick it; superseded_or_repealed_date is
// when the rule was repealed or superseded. "Verified January 2025" and
// "effective January 2026" are different facts and this module never lets one
// stand in for the other.
//
// CLAIMING NEVER VERIFIES (2m). Only membership-verify does that, through
// admin_verify_government_membership(), and it requires a written record of what
// was checked. The three states of 2m are derived, so a revocation is visible
// the moment it is recorded.
//
// THERE IS NO CLAIM-CODE INVITATION IN THIS SCHEMA. 0012 claims an entity through
// claim_government_entity(), which takes no code, and it has no column for an
// invited address, an invitation note, a claim code or the date one was issued.
// entity-invite therefore records nothing and says so plainly (501) rather than
// writing columns that do not exist or repurposing claim_note into an invitation
// log. Adding the invitation record is a migration, and this module does not own
// migrations.
//
// HISTORY IS NEVER OVERWRITTEN (2m). The database appends a version row on every
// insert and update of a provision or a resource; this module additionally
// appends an api_snapshot of the state BEFORE its own edit, with the operator's
// note, through the regulatory_versions compatibility view 0012 created for it.
// There is no hard delete in this module: a rule that no longer applies is
// superseded or retracted, never erased, and a rejected submission is retained
// with its reason.
//
// VERIFICATION MEANS IDENTITY, NOT LEGAL CORRECTNESS. The words this module
// returns for a verified entity are "Verified Government Account" with the
// entity name. They are never the builder's "Verified on ADUAtlas".
//
// WHAT THE CONSOLE STILL CALLS THINGS. src/pages/admin/AdminRegulatory.jsx was
// written against the same unmigrated draft, so it sends and reads `topic`,
// `kind`, `type`, `title`, `contact_phone`, `contact_email`, `notes`,
// `superseded_date` and `is_published`. Every write below reads BOTH spellings
// and stores only the column 0012 defines, and every row that leaves here
// carries the console's spelling beside the real one. Two aliases go further
// because the console hardcodes a default the schema never had: a jurisdiction
// type of "city" is stored as `municipality`, and an entity type of
// "city_government" as `city`. No other value is translated: an unrecognised one
// is refused with the list the database accepts, because coercing a typo into a
// default is the silent default 2b forbids.
//
// Vocabularies are duplicated here rather than imported from
// src/lib/regulatory.js, for the reason api/admin/_studies.js gives for
// BRIEF_FIELDS: that module is browser code and reaches for import.meta.env.
// The server has to validate every write anyway, so these lists are the
// authority for writes and GET regulatory/meta hands the same lists to the
// console so the two cannot drift apart unseen.
import { requireAdmin, readBody } from "../_admin.js";

// ── Vocabularies: 0012's CHECK constraints and its regulatory_topics seed ────
export const FIELD_STATE = {
  VERIFIED: "verified_from_source",
  NOT_STATED: "source_did_not_state",
  NOT_RESEARCHED: "not_yet_researched",
};
const FIELD_STATES = Object.values(FIELD_STATE);
const FIELD_STATE_LABELS = {
  verified_from_source: "Verified from source",
  source_did_not_state: "Source did not state",
  not_yet_researched: "Not yet researched",
};

// jurisdictions.jurisdiction_type. Geography only. A country row is the root of
// the tree; it is not a permission level and nothing reads it as one.
const JURISDICTION_TYPES = [
  "country", "state", "federal_district", "territory",
  "county", "municipality", "tribal", "special_district", "other",
];
const JURISDICTION_TYPE_LABELS = {
  country: "Country",
  state: "State",
  federal_district: "Federal district",
  territory: "Territory",
  county: "County",
  municipality: "Municipality",
  tribal: "Tribal government",
  special_district: "Special district",
  other: "Other local authority",
};
// The console's hardcoded default is "city". 0012 models every city, town,
// township, village and borough as one row type, so these are spellings of the
// same thing rather than a decision about what to store.
const JURISDICTION_TYPE_ALIASES = {
  city: "municipality",
  town: "municipality",
  township: "municipality",
  village: "municipality",
  borough: "municipality",
  municipal: "municipality",
};
// state, federal_district and territory are the national level: they hang off
// the country row and carry their own two-letter code.
const STATE_LEVEL_TYPES = ["state", "federal_district", "territory"];

// regulatory_topics.key, as 0012 seeds it. The foreign key on
// regulatory_provisions.topic_key is the real boundary; this list is here so a
// typo is a 400 with the options rather than a foreign-key violation, and so
// GET meta can answer before the table has been read.
const TOPIC_KEYS = [
  "adu_allowed", "detached_allowed", "attached_allowed", "conversion_allowed", "jadu_allowed",
  "number_allowed", "zoning_districts",
  "max_size", "max_size_share", "min_size", "min_lot_size", "max_lot_coverage",
  "height_limit", "stories_allowed", "setback_front", "setback_side", "setback_rear",
  "separation_required",
  "parking_required", "parking_exemptions",
  "owner_occupancy_required", "short_term_rental_allowed", "separate_sale_allowed",
  "deed_restriction_required",
  "permit_type", "review_timeline", "design_standards_apply", "preapproved_plans",
  "utility_connection", "fire_sprinklers_required",
  "permit_fees", "impact_fees", "other_restrictions",
];
const TOPIC_LABELS = {
  adu_allowed: "ADUs allowed",
  detached_allowed: "Detached ADU allowed",
  attached_allowed: "Attached ADU allowed",
  conversion_allowed: "Garage or interior conversion",
  jadu_allowed: "Junior ADU allowed",
  number_allowed: "How many allowed",
  zoning_districts: "Zoning districts",
  max_size: "Maximum ADU size",
  max_size_share: "Maximum share of the house",
  min_size: "Minimum ADU size",
  min_lot_size: "Minimum lot size",
  max_lot_coverage: "Maximum lot coverage",
  height_limit: "Height limit",
  stories_allowed: "Stories allowed",
  setback_front: "Front setback",
  setback_side: "Side setback",
  setback_rear: "Rear setback",
  separation_required: "Separation from the house",
  parking_required: "Parking required",
  parking_exemptions: "Parking exemptions",
  owner_occupancy_required: "Owner occupancy required",
  short_term_rental_allowed: "Short-term rental allowed",
  separate_sale_allowed: "Separate sale allowed",
  deed_restriction_required: "Deed restriction required",
  permit_type: "Permit type",
  review_timeline: "Review timeline",
  design_standards_apply: "Design standards apply",
  preapproved_plans: "Pre-approved plans offered",
  utility_connection: "Utility connection",
  fire_sprinklers_required: "Fire sprinklers required",
  permit_fees: "Permit fees",
  impact_fees: "Impact or capacity fees",
  other_restrictions: "Other restrictions",
};

// Where the rule was read, as 0012 constrains it. A blog, a lead generation
// site, builder marketing or an AI summary is not on this list and cannot be
// stored as a source (2l).
const SOURCE_TYPES = [
  "state_statute", "state_agency", "county_code", "city_code", "municipal_ordinance",
  "planning_department", "building_department", "official_permit_system", "other_official",
];
const SOURCE_TYPE_LABELS = {
  state_statute: "State statute",
  state_agency: "State agency",
  county_code: "County code",
  city_code: "City code",
  municipal_ordinance: "Municipal ordinance",
  planning_department: "Planning department",
  building_department: "Building department",
  official_permit_system: "Official permit system",
  other_official: "Other official government source",
};

// government_resources.resource_type, as 0012 constrains it.
const RESOURCE_TYPES = [
  "official_adu_page", "planning_zoning_page", "ordinance", "permit_application",
  "application_portal", "zoning_map", "planning_department", "building_department",
  "adu_contact", "adu_handbook", "fee_schedule", "design_standards", "preapproved_plans",
  "faq", "other",
];
const RESOURCE_TYPE_LABELS = {
  official_adu_page: "Official ADU page",
  planning_zoning_page: "Planning or zoning page",
  ordinance: "Ordinance",
  permit_application: "Permit or application",
  application_portal: "Application portal",
  zoning_map: "Zoning map",
  planning_department: "Planning department",
  building_department: "Building department",
  adu_contact: "ADU contact person",
  adu_handbook: "ADU handbook",
  fee_schedule: "Fee schedule",
  design_standards: "Design standards",
  preapproved_plans: "Pre-approved plans",
  faq: "FAQ",
  other: "Other official resource",
};

// government_entities.entity_type, as 0012 constrains it.
const ENTITY_TYPES = ["city", "county", "state", "state_agency", "regional", "tribal", "special_district", "other"];
const ENTITY_TYPE_LABELS = {
  city: "City",
  county: "County",
  state: "State",
  state_agency: "State agency",
  regional: "Regional body",
  tribal: "Tribal government",
  special_district: "Special district",
  other: "Other government body",
};
// The console hardcodes "city_government" as the default for a new entity.
const ENTITY_TYPE_ALIASES = { city_government: "city", county_government: "county" };

// A login is never synonymous with a government. One entity may have several
// people, and one of them may read while another submits. No role here
// publishes: publication is ADUAtlas's (2m).
const MEMBERSHIP_ROLES = ["viewer", "contributor", "administrator"];
const MEMBERSHIP_ROLE_LABELS = {
  viewer: "Read only",
  contributor: "Submits updates",
  administrator: "Manages this entity's members",
};
const MEMBERSHIP_STATUSES = ["pending", "verified", "revoked", "rejected"];
const MEMBERSHIP_STATUS_LABELS = {
  pending: "Claimed, authority not verified",
  verified: "Verified representative",
  revoked: "Revoked",
  rejected: "Claim rejected",
};

// The three states of 2m. DERIVED from claimed_at and verification_status,
// exactly as government_entity_state() derives them. Never a stored column.
const CLAIM_STATUSES = ["unclaimed", "claimed", "verified"];
const CLAIM_STATUS_LABELS = {
  unclaimed: "Unclaimed",
  claimed: "Claimed, not verified",
  verified: "Verified Government Account",
};

// regulatory_provisions.review_status and government_resources.review_status.
const REVIEW_STATUSES = ["draft", "in_review", "published", "superseded", "retracted", "rejected"];
const REVIEW_STATUS_LABELS = {
  draft: "Draft, not public",
  in_review: "In review",
  published: "Published",
  superseded: "Superseded or repealed",
  retracted: "Retracted by ADUAtlas",
  rejected: "Rejected",
};
// What a save may ASK for. Superseding and retracting are the retire routes,
// because each one owes the database a date or a reason, and a published record
// never moves back to a draft.
const SAVEABLE_REVIEW_STATUSES = ["draft", "in_review", "published"];

// Per-record source verification, the third concept of 2p (iii). It is not an
// account state and not a partnership state.
const RECORD_VERIFICATION_STATUSES = ["unverified", "source_checked", "disputed"];
const RECORD_VERIFICATION_STATUS_LABELS = {
  unverified: "Not checked",
  source_checked: "Source checked",
  disputed: "Disputed",
};

const SUPPLIED_BY = ["aduatlas_research", "government_account"];
const SUPPLIED_BY_LABELS = {
  aduatlas_research: "Researched by ADUAtlas from an official source",
  government_account: "Provided by verified government account",
};

// regulatory_submissions.status, as 0012 constrains it. ACCEPTED IS NOT
// PUBLISHED: 0012 keeps resulting_provision_id null on an accepted submission
// that has not been published yet, and this module publishes and then records
// the acceptance.
const SUBMISSION_STATUSES = ["submitted", "in_review", "accepted", "partially_accepted", "rejected", "withdrawn"];
const SUBMISSION_STATUS_LABELS = {
  submitted: "Waiting on review",
  in_review: "In review",
  accepted: "Accepted",
  partially_accepted: "Partly accepted",
  rejected: "Declined",
  withdrawn: "Withdrawn by the government",
};
// The statuses a review may still act on.
const SUBMISSION_OPEN_STATUSES = ["submitted", "in_review"];

const TARGET_KINDS = ["provision", "resource"];

// The fifty states plus DC and the territories ADUAtlas will accept, so the
// console can show which of them have no jurisdiction record yet. Coverage is
// transparent; nothing here creates a record to make the map look full.
const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

// ── Small validators ────────────────────────────────────────────────────────
const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (v, max) => {
  const s = v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};
// REFUSE, NEVER CUT, for anything a homeowner reads. text() trims to a column's
// limit, which is harmless for a stray space and wrong for a rule: a condition
// cut off at character 2000 is a DIFFERENT rule, published under a "Verified
// from source" chip. The rule and resource builders check every public field
// against the same limits first and refuse with the limit named, so text() only
// ever trims whitespace for them. (Found 2026-09-26; data integrity, 2t.)
const overLimit = (pairs) => {
  for (const [label, value, max] of pairs) {
    const s = value == null ? "" : String(value).trim();
    if (s.length > max) {
      return `${label} is ${s.length} characters and the limit is ${max}. Shorten it; it would otherwise be cut off mid-sentence.`;
    }
  }
  return null;
};
// null when empty, false when present but not an absolute http(s) URL. An
// editable URL that cannot be opened is a broken promise on a homeowner page,
// so a bare "phoenix.gov" is rejected rather than stored.
const link = (v) => {
  const s = text(v, 500);
  if (!s) return null;
  return URL_RE.test(s) ? s : false;
};
const email = (v) => {
  const s = text(v, 200);
  if (!s) return null;
  return EMAIL_RE.test(s) ? s.toLowerCase() : false;
};
const date = (v) => {
  const s = text(v, 10);
  if (!s) return null;
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return false;
  return s;
};
const number = (v) => {
  const s = text(v, 40);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : false;
};
const integer = (v) => {
  const n = number(v);
  if (n === null || n === false) return n;
  return Number.isInteger(n) ? n : false;
};
// A boolean has no spare falsy sentinel, so an invalid value is the string
// "invalid" rather than false. null means "nothing was sent".
const tri = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return "invalid";
};
const oneOf = (v, allow, aliases) => {
  const s = text(v, 60);
  if (!s) return null;
  const mapped = aliases?.[s] || s;
  return allow.includes(mapped) ? mapped : false;
};
// oneOf with a default for "nothing was sent". Never write
// `oneOf(v, allow) || fallback`: oneOf returns false for an invalid value and
// `false || fallback` would turn a typo into a default, which is the silent
// default 2b forbids. pick keeps the false.
const pick = (v, allow, fallback, aliases) => {
  const s = text(v, 60);
  if (!s) return fallback;
  const mapped = aliases?.[s] || s;
  return allow.includes(mapped) ? mapped : false;
};
const uuid = (v) => {
  const s = text(v, 40);
  if (!s) return null;
  return UUID_RE.test(s) ? s : false;
};
const stateCode = (v) => {
  const s = text(v, 2);
  if (!s) return null;
  const up = s.toUpperCase();
  return US_STATES[up] ? up : false;
};
const domainList = (v) => {
  const raw = Array.isArray(v) ? v : String(v || "").split(/[\s,]+/);
  const out = [];
  for (const entry of raw) {
    const d = String(entry || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d) continue;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return false;
    if (!out.includes(d)) out.push(d);
  }
  return out;
};
const slugify = (s) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
// Today as the database's current_date sees it (UTC), for the date checks that
// mirror a database guard so the refusal can be said in words before anything
// is written.
const todayUtc = () => new Date().toISOString().slice(0, 10);
// "Nothing was sent" for a vocabulary field: absent, null or an empty string.
// An EDIT that sends nothing for a field keeps what is stored; it does not reset
// it to the default a NEW record starts with.
const notSent = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// Read a field under whichever key the caller used, schema spelling first. It is
// presence-based on purpose: an empty string is a request to clear a column and
// must not fall through to the next alias.
const field = (obj, ...keys) => {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
};
// An entity's website under either spelling (see entitySave). undefined when
// neither was sent, { conflict: true } when both were sent, they disagree, and
// neither is what the record already holds.
const resolveWebsite = (e, before) => {
  const official = field(e, "official_website_url");
  const alias = field(e, "website_url");
  if (official === undefined) return alias;
  if (alias === undefined) return official;
  const a = text(official, 500);
  const b = text(alias, 500);
  if (a === b) return official;
  const stored = text(before?.official_website_url, 500);
  if (a === stored) return alias;
  if (b === stored) return official;
  return { conflict: true };
};

// The keys a caller sent that this schema has no column for. Reported rather
// than dropped in silence: something Amy typed and lost without being told is
// worse than a warning.
const unsupported = (obj, keys) =>
  keys.filter((k) => {
    const v = field(obj, k);
    return v !== undefined && v !== null && v !== "" && v !== false;
  });
const unsupportedWarning = (keys, why) =>
  keys.length ? `Saved, but this schema has no column for: ${keys.join(", ")}. ${why}` : undefined;

// ── Error handling ──────────────────────────────────────────────────────────
// 42703 / 42P01 / 42883 are Postgres (column, relation, function missing);
// PGRST20x are PostgREST's schema-cache versions of the same. Migrations 0012
// and 0014 carry this feature, so a missing table means one is not applied yet.
const isNotMigrated = (error) => ["42703", "42P01", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code);
const fail = (res, error) =>
  res.status(500).json({
    error: isNotMigrated(error) ? `Migration 0012 is not applied yet (${error.message})` : error.message,
  });
// A guard trigger, a CHECK constraint or a foreign key refusing a write is not a
// server fault: it is the database stating the rule, and its own words are the
// most useful thing the console can show.
//   42501 a guard refused it ("only ADUAtlas publishes", "a published record is
//         never deleted")
//   23514 a CHECK refused it (the three field states, the four dates, "active
//         requires verified identity")
//   23502 a not-null column was left empty
//   23503 a foreign key has nothing to point at (an unknown topic_key)
//   22P02 / 22007 a malformed value reached the database
const refused = (error) => ["42501", "23514", "23502", "23503", "22P02", "22007"].includes(error?.code);
const dbFail = (res, error) => {
  if (error?.code === "42501") return res.status(403).json({ error: error.message });
  if (refused(error)) return res.status(400).json({ error: error.message });
  return fail(res, error);
};
// The column names the schema package owns, extracted from whichever dialect
// of "that column does not exist" came back.
const missingColumn = (error) => {
  const m = /column "([^"]+)"/.exec(error?.message || "") || /'([^']+)' column/.exec(error?.message || "");
  return m ? m[1] : null;
};
// Columns that may be dropped and retried if the DEPLOYED database is behind the
// repository (2j: a green repository is not evidence about production).
// ANNOTATION ONLY, and every one of them exists in 0012. Everything else — the
// field state, the source, the four dates, the review status, the identity of a
// record, the provenance — fails LOUDLY, because a provision that quietly lost
// its source URL is exactly the failure 2l forbids.
const DROPPABLE = [
  "admin_note", "research_note", "notes", "claim_note", "source_citation",
  "contact_title", "department_name", "address", "hours", "sort_order",
];

// insert or update one row, retrying without a droppable column the deployed
// schema does not have yet. Returns { data, error, dropped: [...] }.
const writeRow = async (ctx, table, row, id) => {
  let payload = { ...row };
  const dropped = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const q = id
      ? ctx.svc.from(table).update(payload).eq("id", id).select("*").maybeSingle()
      : ctx.svc.from(table).insert(payload).select("*").maybeSingle();
    const { data, error } = await q;
    if (!error) {
      if (!data) return { data: null, error: { message: `no ${table} row matched that id`, code: "PGRST116" }, dropped };
      return { data, error: null, dropped };
    }
    const col = missingColumn(error);
    if (col && DROPPABLE.includes(col) && col in payload) {
      dropped.push(col);
      payload = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== col));
      continue;
    }
    return { data: null, error, dropped };
  }
  return { data: null, error: { message: "too many missing columns; apply migrations 0012 and 0014" }, dropped };
};
// History is the guarantee, so a failure to record it is not swallowed. If the
// state BEFORE a change cannot be kept, the change does not happen; if the
// state AFTER it cannot be recorded, the response says so instead of implying a
// history that is not there.
const historyLost = (res, error) =>
  res.status(500).json({
    error: `nothing was changed: the version before this edit could not be recorded, and an edit that loses the previous version is not allowed (${error.message || error})`,
  });
const versionWarning = (error) =>
  error ? `Saved, but this change was NOT added to the version history (${error.message || error}). Check migration 0012 before relying on the history.` : undefined;
const joinWarnings = (...parts) => parts.filter(Boolean).join(" ") || undefined;

const droppedWarning = (dropped) =>
  dropped.length
    ? `Saved, but the deployed database has no column for: ${dropped.join(", ")}. Those notes were not stored. Apply migration 0012.`
    : undefined;

// ── History that is never overwritten ───────────────────────────────────────
// regulatory_versions is 0012's compatibility VIEW over
// regulatory_record_versions: target_kind/target_id/version/snapshot are the
// console's spelling of record_type/record_id/version_no/snapshot, and
// created_by is actor_app_user_id. SELECT and INSERT for service_role only;
// nothing in this module updates or deletes a version, and no API role could.
const appendVersion = async (ctx, { target_kind, target_id, snapshot, change_note, source, submission_id }) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: last } = await ctx.svc
      .from("regulatory_versions")
      .select("version")
      .eq("target_kind", target_kind)
      .eq("target_id", target_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (last?.version || 0) + 1;
    const { data, error } = await ctx.svc
      .from("regulatory_versions")
      .insert({
        target_kind,
        target_id,
        version,
        snapshot,
        change_note: change_note || null,
        source: source || "admin",
        submission_id: submission_id || null,
        created_by: ctx.row.id,
      })
      .select("id, version")
      .maybeSingle();
    // 23505 is the database's own version trigger and this snapshot numbering
    // the same version at once. Read the head again and retry rather than
    // losing one of the two rows.
    if (!error) return { version: data, error: null };
    if (error.code !== "23505") return { version: null, error };
  }
  return { version: null, error: { message: "could not append a version row" } };
};

// ── Presentation ────────────────────────────────────────────────────────────
// Every row that leaves this module carries the column names 0012 defines AND
// the names src/pages/admin/AdminRegulatory.jsx reads, so the console keeps
// rendering while the database keeps one spelling.
const asDay = (v) => (v ? String(v).slice(0, 10) : null);

const presentJurisdiction = (row) =>
  row
    ? {
        ...row,
        type: row.jurisdiction_type ?? null,
        is_published: row.published_at != null,
        notes: row.research_note ?? null,
      }
    : null;

const presentProvision = (row) =>
  row
    ? {
        ...row,
        topic: row.topic_key ?? null,
        notes: row.admin_note ?? null,
        superseded_date: row.superseded_or_repealed_date ?? null,
        // The date ADUAtlas last changed its own record. The database stamps it.
        published_updated_date: asDay(row.record_published_at),
      }
    : null;

const presentResource = (row) =>
  row
    ? {
        ...row,
        kind: row.resource_type ?? null,
        title: row.label ?? null,
        contact_phone: row.phone ?? null,
        contact_email: row.email ?? null,
        // The console's "Internal note" is admin_note. government_resources.notes
        // is a PUBLIC column: it is in government_resources_public, so it travels
        // under its own name and is never written from the internal-note field.
        notes: row.admin_note ?? null,
        public_notes: row.notes ?? null,
        superseded_date: row.superseded_or_repealed_date ?? null,
        published_updated_date: asDay(row.record_published_at),
      }
    : null;

// The three states of 2m, from the entity's own stored columns, computed exactly
// as government_entity_state() computes them. Claiming never produces
// verification, so "claimed" never reads as "verified".
const claimStatusOf = (e) => {
  if (!e) return "unclaimed";
  if (e.verification_status === "verified") return "verified";
  if (e.claimed_at) return "claimed";
  return "unclaimed";
};
const presentEntity = (row) =>
  row
    ? {
        ...row,
        website_url: row.official_website_url ?? null,
        claim_status: claimStatusOf(row),
        // 0012 has no claim-code invitation. The field stays so the console does
        // not read undefined, and it is always false: see entity-invite below.
        claim_code_issued: false,
      }
    : null;

const membershipIsLive = (m) => !m.revoked_at && m.status !== "revoked" && m.status !== "rejected";
const isVerifiedMembership = (m) => membershipIsLive(m) && m.status === "verified" && Boolean(m.verified_at);

// A membership is a PERSON (2m). Amy judges a claim against the work email and
// the job title, and against the entity's official domains, which are EVIDENCE
// and never a verification (2o). The join is
// government_memberships.government_user_id -> government_users.user_id ->
// users.email; there is no user_id column on a membership.
const withPeople = async (ctx, rows) => {
  const govIds = [...new Set((rows || []).map((m) => m.government_user_id).filter(Boolean))];
  if (!govIds.length) return rows || [];
  const { data: people } = await ctx.svc
    .from("government_users")
    .select("id, user_id, full_name, job_title, work_email, phone")
    .in("id", govIds);
  const userIds = [...new Set((people || []).map((p) => p.user_id).filter(Boolean))];
  const { data: users } = userIds.length ? await ctx.svc.from("users").select("id, email").in("id", userIds) : { data: [] };
  const byUser = Object.fromEntries((users || []).map((u) => [u.id, u]));
  const byGov = Object.fromEntries((people || []).map((p) => [p.id, { ...p, account_email: byUser[p.user_id]?.email || null }]));
  return (rows || []).map((m) => ({ ...m, person: byGov[m.government_user_id] || null }));
};

// The console's spelling for a membership, beside 0012's.
const presentMembership = (m) => ({
  ...m,
  role: m.membership_role ?? null,
  user_id: m.person?.user_id ?? null,
  user_email: m.person?.account_email ?? m.person?.work_email ?? null,
  user_name: m.person?.full_name ?? null,
});

// The claim status the memberships that exist RIGHT NOW imply. Shown beside the
// entity's own state so a stale verification can never quietly outrank the
// people who actually represent it.
const deriveClaimStatus = (memberships) => {
  const live = (memberships || []).filter(membershipIsLive);
  if (live.some(isVerifiedMembership)) return "verified";
  if (live.length > 0) return "claimed";
  return "unclaimed";
};

// The entity as it stands now, read back rather than assumed. There is nothing
// to recompute and nothing to write: claim_status is derived, and
// admin_verify_government_membership() has already moved whatever it moves.
const reloadEntity = async (ctx, entityId) => {
  const { data: entity, error } = await ctx.svc.from("government_entities").select("*").eq("id", entityId).maybeSingle();
  if (error) return { error };
  const { data: memberships } = await ctx.svc
    .from("government_memberships")
    .select("id, status, verified_at, revoked_at")
    .eq("entity_id", entityId);
  return {
    entity: presentEntity(entity),
    claim_status: claimStatusOf(entity),
    derived_claim_status: deriveClaimStatus(memberships),
  };
};

// ── Explicit authority, never geographic (2m) ───────────────────────────────
// The ONLY source of authority is a live row in government_jurisdiction_grants
// naming one entity and one jurisdiction, matched by EQUALITY. This module never
// reads jurisdictions.parent_id or government_entities.jurisdiction_id to decide
// whether an entity may speak for a record.
const liveGrantIndex = async (ctx, entityIds) => {
  const ids = [...new Set((entityIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await ctx.svc
    .from("government_jurisdiction_grants")
    .select("id, entity_id, jurisdiction_id, may_submit, revoked_at")
    .in("entity_id", ids)
    .is("revoked_at", null)
    .limit(5000);
  const index = new Map();
  for (const g of data || []) index.set(`${g.entity_id}:${g.jurisdiction_id}`, g);
  return index;
};
const hasSubmitGrant = (index, entityId, jurisdictionId) => {
  const g = index.get(`${entityId}:${jurisdictionId}`);
  return Boolean(g && g.may_submit);
};

// The state-level jurisdiction rows. 0012 seeds all fifty states and DC, so this
// is nationwide on day one.
const stateLevelJurisdictions = async (ctx) => {
  const { data, error } = await ctx.svc
    .from("jurisdictions")
    .select("*")
    .in("jurisdiction_type", STATE_LEVEL_TYPES)
    .order("name");
  if (error) return { data: null, error };
  return { data: (data || []).map(presentJurisdiction), error: null };
};

// ── meta ────────────────────────────────────────────────────────────────────
// Vocabularies first and unconditionally, so the console renders and says what
// is wrong even on a database without 0012.
const meta = async (req, res, ctx) => {
  const vocab = {
    field_states: FIELD_STATES,
    field_state_labels: FIELD_STATE_LABELS,
    default_field_state: FIELD_STATE.NOT_RESEARCHED,
    jurisdiction_types: JURISDICTION_TYPES,
    jurisdiction_type_labels: JURISDICTION_TYPE_LABELS,
    state_level_types: STATE_LEVEL_TYPES,
    provision_topics: TOPIC_KEYS,
    provision_topic_labels: TOPIC_LABELS,
    source_types: SOURCE_TYPES,
    source_type_labels: SOURCE_TYPE_LABELS,
    resource_kinds: RESOURCE_TYPES,
    resource_kind_labels: RESOURCE_TYPE_LABELS,
    resource_types: RESOURCE_TYPES,
    resource_type_labels: RESOURCE_TYPE_LABELS,
    entity_types: ENTITY_TYPES,
    entity_type_labels: ENTITY_TYPE_LABELS,
    membership_roles: MEMBERSHIP_ROLES,
    membership_role_labels: MEMBERSHIP_ROLE_LABELS,
    membership_statuses: MEMBERSHIP_STATUSES,
    membership_status_labels: MEMBERSHIP_STATUS_LABELS,
    claim_statuses: CLAIM_STATUSES,
    claim_status_labels: CLAIM_STATUS_LABELS,
    review_statuses: SAVEABLE_REVIEW_STATUSES,
    all_review_statuses: REVIEW_STATUSES,
    review_status_labels: REVIEW_STATUS_LABELS,
    record_verification_statuses: RECORD_VERIFICATION_STATUSES,
    record_verification_status_labels: RECORD_VERIFICATION_STATUS_LABELS,
    supplied_by: SUPPLIED_BY,
    supplied_by_labels: SUPPLIED_BY_LABELS,
    submission_statuses: SUBMISSION_STATUSES,
    submission_status_labels: SUBMISSION_STATUS_LABELS,
    us_states: US_STATES,
    // There is no invitation record in this schema; the console's claim-code
    // button has nothing to write. See entity-invite.
    claim_invitations_supported: false,
  };

  // The topics table IS the vocabulary: LEFT JOINing it against the published
  // provisions is what turns "not yet researched" into a queryable state. Read
  // it so the console offers what the database will actually accept.
  const { data: topics } = await ctx.svc
    .from("regulatory_topics")
    .select("key, category, label, question, value_kind, value_unit, sort_order")
    .order("sort_order");
  if (topics?.length) {
    vocab.provision_topics = topics.map((t) => t.key);
    vocab.provision_topic_labels = Object.fromEntries(topics.map((t) => [t.key, t.label]));
    vocab.provision_topic_details = topics;
  }

  const { data: states, error } = await stateLevelJurisdictions(ctx);
  if (error) {
    return res.status(200).json({
      ...vocab,
      schema_ready: false,
      schema_error: isNotMigrated(error) ? "Migration 0012 is not applied yet." : error.message,
      states: [],
      coverage: null,
    });
  }

  // Coverage, counted rather than claimed. Head counts only; no row bodies.
  const count = async (table, build) => {
    const { count: n } = await build(ctx.svc.from(table).select("id", { count: "exact", head: true }));
    return n || 0;
  };
  const coverage = {
    jurisdictions: await count("jurisdictions", (q) => q),
    jurisdictions_published: await count("jurisdictions", (q) => q.not("published_at", "is", null)),
    states_with_records: new Set((states || []).map((s) => s.state_code).filter(Boolean)).size,
    states_expected: Object.keys(US_STATES).length,
    provisions: await count("regulatory_provisions", (q) => q),
    // is_published is generated from the review status, the supersession date and
    // the retraction, so this is what the public can actually see.
    provisions_published: await count("regulatory_provisions", (q) => q.eq("is_published", true)),
    resources: await count("government_resources", (q) => q),
    resources_published: await count("government_resources", (q) => q.eq("is_published", true)),
    entities: await count("government_entities", (q) => q),
    // Identity, and identity only. The partnership count lives on gov-meta,
    // because a verified account and an education partner are two different
    // facts and one number cannot carry both (2p).
    entities_verified: await count("government_entities", (q) => q.eq("verification_status", "verified")),
    submissions_waiting: await count("regulatory_submissions", (q) => q.in("status", SUBMISSION_OPEN_STATUSES)),
  };
  res.status(200).json({ ...vocab, schema_ready: true, states: states || [], coverage });
};

// ── Jurisdictions ───────────────────────────────────────────────────────────
// Coverage is DERIVED, never stored (2l). 0012 deliberately has no
// coverage_status column: a stored flag is the thing that drifts from the data
// and starts making a page look researched when it is not. These three words
// come from the published rows, with no invented threshold:
//   researched      every tracked topic has a published answer
//   in_progress     at least one published answer, and not all of them
//   not_researched  nothing published at all
const coverageStatus = (answeredTopics, topicsTracked) => {
  if (!answeredTopics) return "not_researched";
  if (topicsTracked && answeredTopics >= topicsTracked) return "researched";
  return "in_progress";
};

const jurisdictions = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const state = url.searchParams.get("state");
  const q = (url.searchParams.get("q") || "").trim();

  const COLUMNS =
    "id, jurisdiction_type, parent_id, name, official_name, slug, state_code, path, county_fips, place_fips, published_at, research_note, created_at, updated_at";
  let query = ctx.svc.from("jurisdictions").select(COLUMNS);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`).limit(100);
  else if (state) {
    const code = stateCode(state);
    if (!code) return res.status(400).json({ error: "state must be a two-letter state code" });
    query = query.eq("state_code", code).limit(1000);
  } else query = query.in("jurisdiction_type", STATE_LEVEL_TYPES).limit(100);

  const { data, error } = await query.order("jurisdiction_type").order("name");
  if (error) return fail(res, error);

  const { count: topicsTracked } = await ctx.svc.from("regulatory_topics").select("key", { count: "exact", head: true });

  const ids = (data || []).map((j) => j.id);
  const counts = {};
  const entitiesByJurisdiction = {};
  const answered = {};
  const blank = () => ({ provisions: 0, published: 0, verified_fields: 0, resources: 0, resources_published: 0, submissions_waiting: 0 });
  const bump = (id, key) => {
    counts[id] = counts[id] || blank();
    counts[id][key] += 1;
  };
  if (ids.length) {
    const { data: provs } = await ctx.svc
      .from("regulatory_provisions")
      .select("id, jurisdiction_id, topic_key, review_status, field_state, is_published")
      .in("jurisdiction_id", ids);
    for (const p of provs || []) {
      bump(p.jurisdiction_id, "provisions");
      if (p.is_published) {
        bump(p.jurisdiction_id, "published");
        (answered[p.jurisdiction_id] = answered[p.jurisdiction_id] || new Set()).add(p.topic_key);
      }
      if (p.field_state === FIELD_STATE.VERIFIED) bump(p.jurisdiction_id, "verified_fields");
    }
    const { data: resList } = await ctx.svc
      .from("government_resources")
      .select("id, jurisdiction_id, is_published")
      .in("jurisdiction_id", ids);
    for (const r of resList || []) {
      bump(r.jurisdiction_id, "resources");
      if (r.is_published) bump(r.jurisdiction_id, "resources_published");
    }
    const { data: subs } = await ctx.svc
      .from("regulatory_submissions")
      .select("id, jurisdiction_id, status")
      .in("jurisdiction_id", ids)
      .in("status", SUBMISSION_OPEN_STATUSES);
    for (const s of subs || []) bump(s.jurisdiction_id, "submissions_waiting");
    // An entity's seat is not unique in 0012 (the index on jurisdiction_id is
    // not a unique one), so this is a list and the console reads the first.
    const { data: entityRows } = await ctx.svc.from("government_entities").select("*").in("jurisdiction_id", ids);
    for (const e of entityRows || []) (entitiesByJurisdiction[e.jurisdiction_id] = entitiesByJurisdiction[e.jurisdiction_id] || []).push(presentEntity(e));
  }

  res.status(200).json({
    items: (data || []).map((j) => {
      const c = counts[j.id] || blank();
      const mine = entitiesByJurisdiction[j.id] || [];
      return {
        ...presentJurisdiction(j),
        counts: c,
        topics_tracked: topicsTracked || 0,
        topics_answered: answered[j.id]?.size || 0,
        // Derived every time it is asked for, never stored.
        coverage_status: coverageStatus(answered[j.id]?.size || 0, topicsTracked || 0),
        entity: mine[0] || null,
        entities: mine,
      };
    }),
  });
};

const jurisdiction = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const id = uuid(url.searchParams.get("id"));
  if (!id) return res.status(400).json({ error: "id required" });

  const { data: row, error } = await ctx.svc.from("jurisdictions").select("*").eq("id", id).maybeSingle();
  if (error) return fail(res, error);
  if (!row) return res.status(404).json({ error: "jurisdiction not found" });

  // The parent is fetched for DISPLAY: a homeowner reading Phoenix needs
  // Arizona and Maricopa County shown as distinct sourced answers. It is not
  // read as authority anywhere in this module.
  const { data: parent } = row.parent_id
    ? await ctx.svc.from("jurisdictions").select("id, name, jurisdiction_type, slug, state_code, path, published_at").eq("id", row.parent_id).maybeSingle()
    : { data: null };
  const { data: children } = await ctx.svc
    .from("jurisdictions")
    .select("id, name, jurisdiction_type, slug, state_code, path, published_at, research_note")
    .eq("parent_id", id)
    .order("name")
    .limit(500);
  const { data: provisions } = await ctx.svc
    .from("regulatory_provisions")
    .select("*")
    .eq("jurisdiction_id", id)
    .order("topic_key");
  const { data: resources } = await ctx.svc
    .from("government_resources")
    .select("*")
    .eq("jurisdiction_id", id)
    .order("resource_type");
  const { data: entityRows } = await ctx.svc
    .from("government_entities")
    .select("*")
    .eq("jurisdiction_id", id)
    .order("created_at")
    .limit(50);
  const entityRow = (entityRows || [])[0] || null;

  let memberships = [];
  if (entityRow) {
    const { data: rows } = await ctx.svc
      .from("government_memberships")
      .select("*")
      .eq("entity_id", entityRow.id)
      .order("requested_at");
    memberships = (await withPeople(ctx, rows || [])).map(presentMembership);
  }
  const { data: submissions } = await ctx.svc
    .from("regulatory_submissions")
    .select("id, status, kind, topic_key, resource_type, target_provision_id, target_resource_id, resulting_provision_id, resulting_resource_id, entity_id, submitted_at, created_at, reviewed_at")
    .eq("jurisdiction_id", id)
    .order("submitted_at", { ascending: false })
    .limit(50);

  res.status(200).json({
    jurisdiction: presentJurisdiction(row),
    parent: presentJurisdiction(parent) || null,
    children: (children || []).map(presentJurisdiction),
    provisions: (provisions || []).map(presentProvision),
    resources: (resources || []).map(presentResource),
    entity: presentEntity(entityRow),
    entities: (entityRows || []).map(presentEntity),
    memberships,
    submissions: (submissions || []).map(presentSubmission),
  });
};

const jurisdictionSave = async (req, res, ctx) => {
  const body = readBody(req);
  const j = body.jurisdiction || body;
  const id = j.id ? uuid(j.id) : null;
  if (j.id && !id) return res.status(400).json({ error: "id is not a valid record id" });

  let before = null;
  if (id) {
    const { data, error } = await ctx.svc.from("jurisdictions").select("*").eq("id", id).maybeSingle();
    if (error) return fail(res, error);
    if (!data) return res.status(404).json({ error: "jurisdiction not found" });
    before = data;
  }

  const jurisdiction_type = oneOf(field(j, "jurisdiction_type", "type"), JURISDICTION_TYPES, JURISDICTION_TYPE_ALIASES);
  if (!jurisdiction_type) {
    return res.status(400).json({ error: `jurisdiction_type must be one of: ${JURISDICTION_TYPES.join(", ")}` });
  }
  const name = text(j.name, 160);
  if (!name) return res.status(400).json({ error: "name required" });
  const code = stateCode(j.state_code);
  if (code === false) return res.status(400).json({ error: "state_code must be a US state, DC or territory code" });
  const parent_id = uuid(j.parent_id);
  if (parent_id === false) return res.status(400).json({ error: "parent_id is not a valid record id" });
  if (parent_id && parent_id === id) return res.status(400).json({ error: "a jurisdiction cannot be its own parent" });
  // jurisdictions_country_is_root: the country row is the only one with no
  // parent, and every other row hangs off exactly one.
  if (jurisdiction_type === "country" && parent_id) {
    return res.status(400).json({ error: "the country row is the root of the tree and has no parent" });
  }
  if (jurisdiction_type !== "country" && !parent_id) {
    return res.status(400).json({ error: "every jurisdiction below country level sits inside a parent record. That is geography for the breadcrumb; it grants nobody any authority." });
  }
  // jurisdictions_state_level_has_code. Below the state level the code is
  // inherited from the immediate parent by jurisdictions_derive_placement(), so
  // it is not sent from here: the trigger fires only when parent_id, slug or
  // jurisdiction_type change, and writing the column by hand could put a city in
  // the wrong state between two of those.
  const stateLevel = STATE_LEVEL_TYPES.includes(jurisdiction_type);
  if (stateLevel && !code) {
    return res.status(400).json({ error: "a state, federal district or territory carries its own two-letter code" });
  }

  const slugSource = text(j.slug, 80) || name;
  const slug = slugify(slugSource);
  if (!slug) return res.status(400).json({ error: "the URL slug cannot be empty; give the record a name in letters and numbers" });

  // published_at is a timestamp, not a flag. Publishing keeps the time it was
  // FIRST published rather than moving it on every save, and unpublishing clears
  // it. Publication is not the same thing as indexability: see
  // jurisdiction_coverage_public.is_indexable (2l).
  const publishFlag = tri(field(j, "is_published", "published"));
  if (publishFlag === "invalid") return res.status(400).json({ error: "is_published must be true or false" });
  let published_at = before?.published_at ?? null;
  const explicit = field(j, "published_at");
  if (explicit !== undefined) {
    const d = text(explicit, 40);
    if (d && Number.isNaN(Date.parse(d))) return res.status(400).json({ error: "published_at must be a date or timestamp" });
    published_at = d ? new Date(d).toISOString() : null;
  } else if (publishFlag === true) {
    published_at = before?.published_at || new Date().toISOString();
  } else if (publishFlag === false) {
    published_at = null;
  }

  const row = {
    jurisdiction_type,
    name,
    slug,
    official_name: text(j.official_name, 200),
    parent_id,
    published_at,
    // A jurisdiction-specific sentence for a page with little or nothing
    // verified. The GENERIC sentence is product copy in src/lib/regulatory.js.
    research_note: text(field(j, "research_note", "notes"), 4000),
    county_fips: text(j.county_fips, 10),
    place_fips: text(j.place_fips, 10),
  };
  if (stateLevel) row.state_code = code;

  const { data, error, dropped } = await writeRow(ctx, "jurisdictions", row, id);
  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "another jurisdiction already uses that URL slug inside this state or this parent; give this one a different one",
      });
    }
    return dbFail(res, error);
  }
  res.status(200).json({
    ok: true,
    jurisdiction: presentJurisdiction(data),
    warning: joinWarnings(
      droppedWarning(dropped),
      // 0012 keeps a jurisdiction's own URLs, phone and email in
      // government_resources, one sourced row per resource type, which is why
      // the feature is Rules AND Resources. There is no website or county name
      // column on the jurisdiction itself. coverage_status is not warned about
      // because this module does answer that question: it derives it from the
      // published rows every time, which is why it is not stored (2l).
      unsupportedWarning(
        unsupported(j, ["website_url", "county_name"]),
        "A jurisdiction's official website, permit page, zoning map and contacts are sourced rows in Resources, one per resource type, each with its own source and date.",
      ),
    ),
  });
};

// ── Provisions ──────────────────────────────────────────────────────────────
// One sourced rule per row, never a blob per city.
//
// fromSubmission changes exactly two things, both because 0012 documents the
// submission payload shape: the topic comes from the submission row rather than
// the payload, and a government never writes ADUAtlas's internal note.
const provisionFields = (p, { fromSubmission = false, topicKey = null } = {}) => {
  const field_state = pick(p.field_state, FIELD_STATES, FIELD_STATE.NOT_RESEARCHED);
  if (field_state === false) return { error: `field_state must be one of: ${FIELD_STATES.join(", ")}` };
  const topic_key = fromSubmission ? topicKey : oneOf(field(p, "topic_key", "topic"), TOPIC_KEYS);
  if (!topic_key) {
    return { error: fromSubmission ? "this submission names no topic" : `topic must be one of: ${TOPIC_KEYS.join(", ")}` };
  }
  const source_type = oneOf(p.source_type, SOURCE_TYPES);
  if (source_type === false) return { error: `source_type must be an authoritative source: ${SOURCE_TYPES.join(", ")}` };
  const source_url = link(p.source_url);
  if (source_url === false) return { error: "the source URL must be a full http(s) URL" };
  const review_status = pick(p.review_status, SAVEABLE_REVIEW_STATUSES, "draft");
  if (review_status === false) return { error: `review_status must be one of: ${SAVEABLE_REVIEW_STATUSES.join(", ")}` };
  // "unverified" is the default for a NEW record only. On an edit that sends
  // nothing here, provisionSave keeps the stored value (see keepUnsent below):
  // re-saving a checked or disputed rule never quietly downgrades it (DEF-04).
  const verification_status = pick(p.verification_status, RECORD_VERIFICATION_STATUSES, "unverified");
  if (verification_status === false) return { error: `verification_status must be one of: ${RECORD_VERIFICATION_STATUSES.join(", ")}` };
  // Nobody can have checked, or disputed, a source nobody has read.
  if (field_state === FIELD_STATE.NOT_RESEARCHED && verification_status !== "unverified") {
    return { error: `a field not yet researched has no source anyone could have checked, so its verification status is "${RECORD_VERIFICATION_STATUS_LABELS.unverified}"` };
  }
  const supplied_by = pick(p.supplied_by, SUPPLIED_BY, "aduatlas_research");
  if (supplied_by === false) return { error: `supplied_by must be one of: ${SUPPLIED_BY.join(", ")}` };
  const supplied_by_entity_id = uuid(p.supplied_by_entity_id);
  if (supplied_by_entity_id === false) return { error: "supplied_by_entity_id is not a valid record id" };
  // regulatory_provisions_government_supplied_names_entity: the two halves of
  // "provided by a verified government account" are true together or not at all.
  if (supplied_by === "government_account" && !supplied_by_entity_id) {
    return { error: "a rule attributed to a government account names the entity that supplied it" };
  }

  const dates = {};
  for (const [key, ...aliases] of [["effective_date"], ["source_checked_date"], ["superseded_or_repealed_date", "superseded_date"]]) {
    const d = date(field(p, key, ...aliases));
    if (d === false) return { error: `${key} must be a date in YYYY-MM-DD form` };
    dates[key] = d;
  }

  const tooLong = overLimit([
    ["value_text", p.value_text, 2000],
    ["value_unit", p.value_unit, 40],
    ["value_qualifier", p.value_qualifier, 500],
    ["source_document_title", p.source_document_title, 300],
    ["source_citation", p.source_citation, 300],
    ["admin_note", field(p, "admin_note", "notes"), 4000],
  ]);
  if (tooLong) return { error: tooLong };

  const value_text = text(p.value_text, 2000);
  const value_numeric = number(p.value_numeric);
  if (value_numeric === false) return { error: "value_numeric must be a number" };
  const value_boolean = tri(p.value_boolean);
  if (value_boolean === "invalid") return { error: "value_boolean must be true or false" };
  const value_unit = text(p.value_unit, 40);
  const value_qualifier = text(p.value_qualifier, 500);
  const hasValue = value_text !== null || value_numeric !== null || value_boolean !== null || value_qualifier !== null;

  // The three states, enforced on the server, in the same shape as the
  // regulatory_provisions_field_state_is_one_of_three constraint. The console
  // offers them and disables what does not apply; the rule lives here and in the
  // database, and the database is the boundary.
  if (field_state === FIELD_STATE.VERIFIED) {
    if (value_text === null && value_numeric === null && value_boolean === null) {
      return { error: "a field verified from source carries the value the source states" };
    }
    if (!source_url) return { error: "a field verified from source carries the official source URL" };
    if (!source_type) return { error: "a field verified from source carries its source type" };
    if (!dates.source_checked_date) return { error: "a field verified from source carries the date ADUAtlas checked the source" };
  } else {
    if (hasValue) return { error: `a field marked "${FIELD_STATE_LABELS[field_state]}" cannot carry a value. Clear the value or change the state.` };
    if (field_state === FIELD_STATE.NOT_STATED) {
      // KNOWLEDGE, not absence: we read a specific source on a specific date and
      // it was silent, so both are required.
      if (!source_url) return { error: '"the source did not state" names the source that was read. Record the source URL or mark the field not yet researched.' };
      if (!dates.source_checked_date) return { error: '"the source did not state" carries the date that source was read' };
    }
    if (field_state === FIELD_STATE.NOT_RESEARCHED && (source_url || dates.source_checked_date)) {
      return { error: "a field not yet researched carries no source and no checked date. Nothing has been looked at yet." };
    }
    if (dates.effective_date) return { error: "an effective date belongs to a rule verified from source" };
  }
  if (dates.superseded_or_repealed_date && dates.effective_date && dates.superseded_or_repealed_date < dates.effective_date) {
    return { error: "the superseded date cannot fall before the effective date" };
  }

  const row = {
    topic_key,
    field_state,
    value_text,
    value_numeric,
    value_boolean,
    value_unit,
    value_qualifier,
    source_url,
    source_document_title: text(p.source_document_title, 300),
    source_citation: text(p.source_citation, 300),
    source_type,
    supplied_by,
    supplied_by_entity_id: supplied_by === "government_account" ? supplied_by_entity_id : null,
    verification_status,
    effective_date: dates.effective_date,
    source_checked_date: dates.source_checked_date,
    superseded_or_repealed_date: dates.superseded_or_repealed_date,
  };
  // record_published_at is not here on purpose: the guard trigger stamps the
  // date ADUAtlas last changed its own record, so a client cannot pick it.
  if (!fromSubmission) row.admin_note = text(field(p, "admin_note", "notes"), 4000);
  return { row, requested_status: review_status };
};

// AN EDIT KEEPS WHAT IT DID NOT SEND (DEF-04). provisionFields and resourceFields
// fill an unsent vocabulary field with the default a NEW record starts with. On
// an edit that default is a silent change nobody asked for: a console re-save
// turned "source_checked" and "disputed" into "unverified", and a correction to
// a government-supplied record turned it into ADUAtlas research, which are
// different fact classes (2t). So an edit that sends nothing for these keeps the
// stored value. Anything actually sent is honoured, and validated as sent.
const keepUnsent = (row, sent, before) => {
  if (!before) return row;
  const kept = { ...row };
  // A field moved back to "not yet researched" has no source anyone checked, so
  // "unverified" (the builder's default) is the only true value for it.
  if (notSent(sent.verification_status) && row.field_state !== FIELD_STATE.NOT_RESEARCHED && before.verification_status) {
    kept.verification_status = before.verification_status;
  }
  // Who supplied it travels as a pair (the *_government_supplied_names_entity
  // constraints), so the pair is kept together or not at all.
  if (notSent(sent.supplied_by) && notSent(sent.supplied_by_entity_id) && before.supplied_by) {
    kept.supplied_by = before.supplied_by;
    kept.supplied_by_entity_id = before.supplied_by_entity_id ?? null;
  }
  return kept;
};

// 0021 refuses to PUBLISH a record whose effective date has not arrived, and to
// move a published record's effective date into the future. The database stays
// the boundary; this says the same thing first, in words, before anything is
// written. Without it a new rule that replaces a published one reached the
// database as "a repeal or supersession ... has not happened yet" about the OLD
// rule, after the new one had already been saved as a draft.
const takesEffectLater = (row, before, noun) => {
  if (!row.effective_date || row.effective_date <= todayUtc()) return null;
  if (before?.review_status === "published" && asDay(before.effective_date) === row.effective_date) return null;
  return `this ${noun} takes effect on ${row.effective_date}. ADUAtlas publishes a record only once it is in effect, so the page never shows it as current too early. Nothing was saved. Publish it on or after that day.`;
};

// What a published provision owes the database, checked before the publish RPC
// is called so the refusal names the missing field rather than the constraint.
const provisionPublishBlocker = (row, before = null) => {
  if (row.field_state === FIELD_STATE.NOT_RESEARCHED) {
    return 'a rule nobody has researched is not published. Its published form is the ABSENCE of a row, which jurisdiction_topic_coverage reports by name as "not yet researched".';
  }
  if (!row.source_url) return "a published rule carries its official source URL";
  if (!row.source_type) return "a published rule carries its source type";
  if (!row.source_checked_date) return "a published rule carries the date ADUAtlas checked the source";
  // is_published is generated as published AND not superseded AND not retracted,
  // so a record carrying a supersession date would read "published" in the review
  // status and stay invisible to every homeowner. Publish the replacement.
  if (row.superseded_or_repealed_date) {
    return "this record carries the date it was superseded or repealed, so publishing it would put it in the workflow's published state while no homeowner could ever see it. Clear the date, or publish the rule that replaced it.";
  }
  return takesEffectLater(row, before, "rule");
};

// Publication is the database's, through the service-role-only RPC that also
// supersedes the rule being replaced and writes the audit row.
const publishProvision = async (ctx, provisionId, note) =>
  ctx.svc.rpc("admin_publish_provision", {
    p_provision_id: provisionId,
    p_actor_app_user_id: ctx.row.id,
    p_note: note || null,
  });
const publishResource = async (ctx, resourceId, note) =>
  ctx.svc.rpc("admin_publish_resource", {
    p_resource_id: resourceId,
    p_actor_app_user_id: ctx.row.id,
    p_note: note || null,
  });

const provisionSave = async (req, res, ctx) => {
  const body = readBody(req);
  const p = body.provision || body;
  const id = p.id ? uuid(p.id) : null;
  if (p.id && !id) return res.status(400).json({ error: "id is not a valid record id" });
  const jurisdiction_id = uuid(p.jurisdiction_id);
  if (!jurisdiction_id) return res.status(400).json({ error: "jurisdiction_id required" });

  const built = provisionFields(p);
  if (built.error) return res.status(400).json({ error: built.error });

  let before = null;
  if (id) {
    const { data, error: beforeErr } = await ctx.svc.from("regulatory_provisions").select("*").eq("id", id).maybeSingle();
    if (beforeErr) return fail(res, beforeErr);
    if (!data) return res.status(404).json({ error: "provision not found" });
    before = data;
  }

  const wantsPublished = built.requested_status === "published";
  // A PUBLISHED record moves only forwards: superseded because the government
  // changed the rule, or retracted because our record was wrong. The guard
  // refuses anything else, and refusing it here says so in words rather than
  // saving the edit while quietly ignoring the status Amy chose.
  if (before?.review_status === "published" && !wantsPublished) {
    return res.status(409).json({
      error:
        "this rule is published, and a published rule never moves back to a draft: history is never overwritten. Edit it and leave it published, or retire it: supersede it with the date the government replaced or repealed it, or retract it with the reason ADUAtlas's record was wrong. Either way the row is kept.",
    });
  }
  // A correction to a published rule stays published; a new record is written as
  // a draft and then published through the RPC, which supersedes what it
  // replaces instead of overwriting it.
  const stored_status = before?.review_status === "published" ? "published" : wantsPublished ? "in_review" : built.requested_status;
  const fields = keepUnsent(built.row, p, before);
  if (wantsPublished) {
    const blocker = provisionPublishBlocker(fields, before);
    if (blocker) return res.status(400).json({ error: blocker });
  }
  const row = { ...fields, jurisdiction_id, review_status: stored_status };

  // The state before the change is kept before it is changed.
  if (id) {
    const kept = await appendVersion(ctx, {
      target_kind: "provision",
      target_id: id,
      snapshot: before,
      change_note: text(p.change_note, 500) || "State before an ADUAtlas edit",
      source: "admin",
    });
    if (kept.error) return historyLost(res, kept.error);
  }

  const { data, error, dropped } = await writeRow(ctx, "regulatory_provisions", row, id);
  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error:
          "this jurisdiction already has an open draft for that topic, or a published rule for it. Amy's queue holds one edit per rule: finish or retire the existing record rather than opening a second one.",
      });
    }
    return dbFail(res, error);
  }

  let published = data.review_status === "published";
  let publishNote = null;
  if (wantsPublished && !published) {
    const { error: pubErr } = await publishProvision(ctx, data.id, text(p.change_note, 500));
    if (pubErr) {
      const kept = presentProvision(data);
      return res.status(refused(pubErr) ? 400 : 500).json({
        error: `the record was saved as a draft and NOT published: ${pubErr.message}`,
        provision: kept,
      });
    }
    published = true;
    publishNote = "Published. The rule it replaces, if there was one, is superseded and kept with its dates.";
  }

  const { data: after } = await ctx.svc.from("regulatory_provisions").select("*").eq("id", data.id).maybeSingle();
  const finalRow = after || data;
  const recorded = await appendVersion(ctx, {
    target_kind: "provision",
    target_id: finalRow.id,
    snapshot: finalRow,
    change_note: id ? "Edited by ADUAtlas" : "Created by ADUAtlas",
    source: "admin",
  });
  res.status(200).json({
    ok: true,
    provision: presentProvision(finalRow),
    published,
    note: publishNote || undefined,
    warning: joinWarnings(
      droppedWarning(dropped),
      versionWarning(recorded.error),
      unsupportedWarning(
        unsupported(p, ["published_updated_date", "record_published_at", "is_published"]),
        "The date ADUAtlas last changed its own record is stamped by the database, and whether a record is public is generated from its review status, its supersession date and its retraction.",
      ),
    ),
  });
};

// RETIRING A RECORD IS TWO DIFFERENT FACTS (2m), and each route below offers both.
//   SUPERSEDED  the government replaced or repealed the rule, on a date. The date
//               is the government's act, so it is required, and it may not be in
//               the future (0021 E1).
//   RETRACTED   ADUAtlas's own record was wrong. retracted_at is stamped now and a
//               REASON is required: the check 0012 names *_retracted_has_reason
//               only proves retracted_at is set, so this is where "a retraction
//               says why" is enforced. retraction_reason is in no public view; it
//               is ADUAtlas's record of its own mistake.
// Body: { id, action: "supersede", superseded_date, note? }
//    or { id, action: "retract", reason }
// An older caller that sends no action is read by what it sent: a date means
// supersede, a reason means retract. The resource route's older callers sent the
// retraction reason as `note`, so that route also reads `note` as the reason.
//
// A REFUSED RETIREMENT WRITES NOTHING. The state before a change is appended to
// the history before the change is written (so an edit can never lose the
// previous version), which means a retirement the database then refuses would
// leave a "State before being superseded" row for a supersession that never
// happened. So everything the database would refuse about a retirement is checked
// FIRST, in words, before anything is appended: a future date, a record that is
// already retired, and a government-supplied record the supplier check would
// refuse (0021 E2 lets a PUBLISHED one be retired after a withdrawal, nothing
// else).
const RETIRE_ACTIONS = ["supersede", "retract"];
const readRetirement = (body, { noteIsReason = false } = {}) => {
  const action = text(body.action, 20);
  if (action && !RETIRE_ACTIONS.includes(action)) return { error: "action must be supersede or retract" };
  const d = date(field(body, "superseded_or_repealed_date", "superseded_date"));
  if (d === false) return { error: "the superseded or repealed date must be a date in YYYY-MM-DD form" };
  const reason = text(field(body, "retraction_reason", "reason"), 2000) || (noteIsReason && !d ? text(body.note, 2000) : null);
  const kind = action || (d ? "supersede" : reason ? "retract" : null);
  if (!kind) {
    return {
      error:
        "say which it is: superseded by the government (send the date it was replaced or repealed) or retracted because ADUAtlas's record was wrong (send the reason). Nothing was changed.",
    };
  }
  if (kind === "supersede") {
    if (!d) return { error: "a supersession records the date the government replaced or repealed it. Enter that date. Nothing was changed." };
    if (d > todayUtc()) {
      return { error: `a repeal or supersession dated ${d} has not happened yet. Record it on or after that date. Nothing was changed.` };
    }
    return { kind, date: d, note: text(body.note, 4000) };
  }
  if (!reason) return { error: "a retraction says why ADUAtlas's record was wrong. Enter the reason. Nothing was changed." };
  return { kind, reason };
};

// What the database would refuse about retiring this record, said before anything
// is written. null when the retirement may go ahead.
const retireBlocker = async (ctx, before, how, noun) => {
  if (before.review_status === "retracted") {
    return `this ${noun} was already retracted${before.retracted_at ? ` on ${asDay(before.retracted_at)}` : ""}. Nothing was changed.`;
  }
  if (how.kind === "supersede" && before.review_status === "superseded") {
    return `this ${noun} was already superseded${before.superseded_or_repealed_date ? ` on ${asDay(before.superseded_or_repealed_date)}` : ""}. Nothing was changed.`;
  }
  if (before.supplied_by === "government_account" && before.review_status !== "published") {
    const { data: e } = await ctx.svc.from("government_entities").select("verification_status").eq("id", before.supplied_by_entity_id).maybeSingle();
    if (e?.verification_status !== "verified") {
      return `this ${noun} was supplied by a government account that is no longer verified, and it is not published, so the database refuses to change it. Nothing was changed.`;
    }
  }
  return null;
};

const retirementRow = (how) =>
  how.kind === "supersede"
    ? { review_status: "superseded", superseded_or_repealed_date: how.date }
    : { review_status: "retracted", retracted_at: new Date().toISOString(), retraction_reason: how.reason };

const provisionRetire = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(body.id);
  if (!id) return res.status(400).json({ error: "id required" });
  const how = readRetirement(body);
  if (how.error) return res.status(400).json({ error: how.error });

  const { data: before, error: beforeErr } = await ctx.svc.from("regulatory_provisions").select("*").eq("id", id).maybeSingle();
  if (beforeErr) return fail(res, beforeErr);
  if (!before) return res.status(404).json({ error: "provision not found" });
  const blocker = await retireBlocker(ctx, before, how, "rule");
  if (blocker) return res.status(409).json({ error: blocker });

  const keptRetire = await appendVersion(ctx, {
    target_kind: "provision",
    target_id: id,
    snapshot: before,
    change_note: how.kind === "supersede" ? "State before being superseded" : "State before being retracted",
    source: "admin",
  });
  if (keptRetire.error) return historyLost(res, keptRetire.error);

  const row = retirementRow(how);
  if (how.kind === "supersede" && how.note) row.admin_note = how.note;
  const { data, error, dropped } = await writeRow(ctx, "regulatory_provisions", row, id);
  if (error) return dbFail(res, error);
  const recordedRetire = await appendVersion(ctx, {
    target_kind: "provision",
    target_id: id,
    snapshot: data,
    change_note: how.kind === "supersede" ? text(body.note, 500) || "Superseded or repealed" : `Retracted by ADUAtlas: ${text(how.reason, 480)}`,
    source: "admin",
  });
  res.status(200).json({
    ok: true,
    provision: presentProvision(data),
    retired_as: how.kind === "supersede" ? "superseded" : "retracted",
    warning: joinWarnings(droppedWarning(dropped), versionWarning(recordedRetire.error)),
    note:
      how.kind === "supersede"
        ? "Superseded and kept. The row is dated, it stays readable, and regulatory_provision_history_public can still show what it said."
        : "Retracted and kept, with the reason. Retracted means ADUAtlas's own record was wrong, not that the government changed anything. The reason is internal and no homeowner page shows it.",
  });
};

// ── Resources ───────────────────────────────────────────────────────────────
// First class alongside the rules: this is why the feature is Rules AND
// Resources.
//
// notesAre says which column the caller's `notes` means. The admin console
// labels its field "Internal note", so a console save writes admin_note; 0012
// documents a government submission's payload as carrying the PUBLIC notes
// column, so a submission writes notes. government_resources_public exposes
// notes and never admin_note, and collapsing the two would put an internal note
// on a homeowner page.
const resourceFields = (r, { notesAre = "internal", fromSubmission = false, resourceType = null } = {}) => {
  const resource_type = fromSubmission ? resourceType : oneOf(field(r, "resource_type", "kind"), RESOURCE_TYPES);
  if (!resource_type) {
    return { error: fromSubmission ? "this submission names no resource type" : `kind must be one of: ${RESOURCE_TYPES.join(", ")}` };
  }
  const field_state = pick(r.field_state, FIELD_STATES, FIELD_STATE.NOT_RESEARCHED);
  if (field_state === false) return { error: `field_state must be one of: ${FIELD_STATES.join(", ")}` };
  const url = link(r.url);
  if (url === false) return { error: "the resource link must be a full http(s) URL" };
  const source_url = link(r.source_url);
  if (source_url === false) return { error: "the source URL must be a full http(s) URL" };
  const mail = email(field(r, "email", "contact_email"));
  if (mail === false) return { error: "the contact email is not a valid address" };
  const source_type = oneOf(r.source_type, SOURCE_TYPES);
  if (source_type === false) return { error: `source_type must be an authoritative source: ${SOURCE_TYPES.join(", ")}` };
  const review_status = pick(r.review_status, SAVEABLE_REVIEW_STATUSES, "draft");
  if (review_status === false) return { error: `review_status must be one of: ${SAVEABLE_REVIEW_STATUSES.join(", ")}` };
  // The default is for a NEW record; an edit that sends nothing keeps the stored
  // value (keepUnsent in resourceSave, DEF-04).
  const verification_status = pick(r.verification_status, RECORD_VERIFICATION_STATUSES, "unverified");
  if (verification_status === false) return { error: `verification_status must be one of: ${RECORD_VERIFICATION_STATUSES.join(", ")}` };
  if (field_state === FIELD_STATE.NOT_RESEARCHED && verification_status !== "unverified") {
    return { error: `a resource not yet researched has no source anyone could have checked, so its verification status is "${RECORD_VERIFICATION_STATUS_LABELS.unverified}"` };
  }
  const supplied_by = pick(r.supplied_by, SUPPLIED_BY, "aduatlas_research");
  if (supplied_by === false) return { error: `supplied_by must be one of: ${SUPPLIED_BY.join(", ")}` };
  const supplied_by_entity_id = uuid(r.supplied_by_entity_id);
  if (supplied_by_entity_id === false) return { error: "supplied_by_entity_id is not a valid record id" };
  if (supplied_by === "government_account" && !supplied_by_entity_id) {
    return { error: "a resource attributed to a government account names the entity that supplied it" };
  }
  const dates = {};
  for (const [key, ...aliases] of [["effective_date"], ["source_checked_date"], ["superseded_or_repealed_date", "superseded_date"]]) {
    const d = date(field(r, key, ...aliases));
    if (d === false) return { error: `${key} must be a date in YYYY-MM-DD form` };
    dates[key] = d;
  }
  const sort_order = integer(r.sort_order);
  if (sort_order === false) return { error: "sort_order must be a whole number" };
  const tooLong = overLimit([
    ["label", field(r, "label", "title"), 200],
    ["contact_name", r.contact_name, 160],
    ["phone", field(r, "phone", "contact_phone"), 40],
    ["contact_title", r.contact_title, 160],
    ["department_name", r.department_name, 200],
    ["address", r.address, 300],
    ["hours", r.hours, 200],
    ["notes", field(r, "notes", "public_notes"), 4000],
    ["public_notes", r.public_notes, 4000],
    ["admin_note", r.admin_note, 4000],
  ]);
  if (tooLong) return { error: tooLong };

  const label = text(field(r, "label", "title"), 200);
  const contact_name = text(r.contact_name, 160);
  const phone = text(field(r, "phone", "contact_phone"), 40);
  // government_resources_found_leads_somewhere: a resource ADUAtlas claims to
  // have found must actually lead somewhere.
  const leadsSomewhere = Boolean(url || phone || mail || contact_name);

  if (field_state === FIELD_STATE.VERIFIED) {
    if (!leadsSomewhere) return { error: "a resource verified from source carries the official link, phone, email or the named contact it found" };
    if (!dates.source_checked_date) return { error: "a resource verified from source carries the date ADUAtlas checked it" };
  } else {
    if (leadsSomewhere) return { error: `a resource marked "${FIELD_STATE_LABELS[field_state]}" carries no link and no contact. Clear them or change the state.` };
    if (field_state === FIELD_STATE.NOT_STATED) {
      // "We looked and this jurisdiction publishes no handbook" is an answer for
      // a homeowner, and an answer owes its source and its date.
      if (!source_url) return { error: '"the source did not state" names the source that was read. Record the source URL or mark it not yet researched.' };
      if (!dates.source_checked_date) return { error: '"the source did not state" carries the date that source was read' };
    }
    if (field_state === FIELD_STATE.NOT_RESEARCHED && (source_url || dates.source_checked_date)) {
      return { error: "a resource not yet researched carries no source and no checked date" };
    }
  }

  const row = {
    resource_type,
    field_state,
    label,
    url,
    phone,
    email: mail,
    contact_name,
    contact_title: text(r.contact_title, 160),
    department_name: text(r.department_name, 200),
    address: text(r.address, 300),
    hours: text(r.hours, 200),
    source_url,
    source_type,
    supplied_by,
    supplied_by_entity_id: supplied_by === "government_account" ? supplied_by_entity_id : null,
    verification_status,
    effective_date: dates.effective_date,
    source_checked_date: dates.source_checked_date,
    superseded_or_repealed_date: dates.superseded_or_repealed_date,
  };
  if (sort_order !== null) row.sort_order = sort_order;
  if (notesAre === "public") row.notes = text(field(r, "notes", "public_notes"), 4000);
  else {
    row.admin_note = text(field(r, "admin_note", "notes"), 4000);
    const pub = text(r.public_notes, 4000);
    if (pub !== null || Object.prototype.hasOwnProperty.call(r, "public_notes")) row.notes = pub;
  }
  return { row, requested_status: review_status };
};

const resourcePublishBlocker = (row, before = null) => {
  if (row.field_state === FIELD_STATE.NOT_RESEARCHED) {
    return "a resource nobody has looked for is not published. Publishing it would say ADUAtlas checked when it has not.";
  }
  if (!row.source_url) return "a published resource records where ADUAtlas found it (the source URL)";
  if (!row.source_checked_date) return "a published resource carries the date ADUAtlas checked it";
  if (row.superseded_or_repealed_date) {
    return "this record carries the date it was superseded, so publishing it would leave it invisible to every homeowner. Clear the date, or publish the resource that replaced it.";
  }
  return takesEffectLater(row, before, "resource");
};

const resourceSave = async (req, res, ctx) => {
  const body = readBody(req);
  const r = body.resource || body;
  const id = r.id ? uuid(r.id) : null;
  if (r.id && !id) return res.status(400).json({ error: "id is not a valid record id" });
  const jurisdiction_id = uuid(r.jurisdiction_id);
  if (!jurisdiction_id) return res.status(400).json({ error: "jurisdiction_id required" });

  const built = resourceFields(r);
  if (built.error) return res.status(400).json({ error: built.error });

  let before = null;
  if (id) {
    const { data, error: beforeErr } = await ctx.svc.from("government_resources").select("*").eq("id", id).maybeSingle();
    if (beforeErr) return fail(res, beforeErr);
    if (!data) return res.status(404).json({ error: "resource not found" });
    before = data;
  }

  const wantsPublished = built.requested_status === "published";
  // The same rule as a provision: a published resource moves only to superseded
  // or retracted, so the request is refused rather than half-honoured.
  if (before?.review_status === "published" && !wantsPublished) {
    return res.status(409).json({
      error:
        "this resource is published, and a published resource never moves back to a draft. Edit it and leave it published, or retire it, which keeps the row with the date it was superseded or the reason it was retracted.",
    });
  }
  const stored_status = before?.review_status === "published" ? "published" : wantsPublished ? "in_review" : built.requested_status;
  const fields = keepUnsent(built.row, r, before);
  if (wantsPublished) {
    const blocker = resourcePublishBlocker(fields, before);
    if (blocker) return res.status(400).json({ error: blocker });
  }
  const row = { ...fields, jurisdiction_id, review_status: stored_status };

  if (id) {
    const kept = await appendVersion(ctx, { target_kind: "resource", target_id: id, snapshot: before, change_note: "State before an ADUAtlas edit", source: "admin" });
    if (kept.error) return historyLost(res, kept.error);
  }

  const { data, error, dropped } = await writeRow(ctx, "government_resources", row, id);
  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: `this jurisdiction already publishes a "none published" record for that resource type. Supersede it before publishing a found one.`,
      });
    }
    return dbFail(res, error);
  }

  let published = data.review_status === "published";
  if (wantsPublished && !published) {
    const { error: pubErr } = await publishResource(ctx, data.id, text(r.change_note, 500));
    if (pubErr) {
      return res.status(refused(pubErr) ? 400 : 500).json({
        error: `the record was saved as a draft and NOT published: ${pubErr.message}`,
        resource: presentResource(data),
      });
    }
    published = true;
  }

  const { data: after } = await ctx.svc.from("government_resources").select("*").eq("id", data.id).maybeSingle();
  const finalRow = after || data;
  const recorded = await appendVersion(ctx, {
    target_kind: "resource",
    target_id: finalRow.id,
    snapshot: finalRow,
    change_note: id ? "Edited by ADUAtlas" : "Created by ADUAtlas",
    source: "admin",
  });
  // A resource cannot be published without the page ADUAtlas found it on.
  // Saying so on a draft beats a draft that silently refuses to publish later.
  const sourceGap =
    !finalRow.source_url && finalRow.field_state === FIELD_STATE.VERIFIED
      ? "Saved as a draft. It cannot be published until source_url records the page ADUAtlas found it on."
      : undefined;
  res.status(200).json({
    ok: true,
    resource: presentResource(finalRow),
    published,
    warning: joinWarnings(
      droppedWarning(dropped),
      versionWarning(recorded.error),
      sourceGap,
      unsupportedWarning(
        unsupported(r, ["source_document_title", "published_updated_date", "record_published_at", "is_published"]),
        "A resource records where ADUAtlas found it in source_url and source_type; the document title belongs to a rule. The record's own date is stamped by the database.",
      ),
    ),
  });
};

// A resource that no longer applies is superseded when the jurisdiction replaced
// it (with the date) and RETRACTED when ADUAtlas's own record was wrong (with the
// reason). Both keep the row. See readRetirement above for the body.
const resourceRetire = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(body.id);
  if (!id) return res.status(400).json({ error: "id required" });
  const how = readRetirement(body, { noteIsReason: true });
  if (how.error) return res.status(400).json({ error: how.error });

  const { data: before, error: beforeErr } = await ctx.svc.from("government_resources").select("*").eq("id", id).maybeSingle();
  if (beforeErr) return fail(res, beforeErr);
  if (!before) return res.status(404).json({ error: "resource not found" });
  const blocker = await retireBlocker(ctx, before, how, "resource");
  if (blocker) return res.status(409).json({ error: blocker });

  const keptResource = await appendVersion(ctx, { target_kind: "resource", target_id: id, snapshot: before, change_note: "State before being retired", source: "admin" });
  if (keptResource.error) return historyLost(res, keptResource.error);

  const { data, error, dropped } = await writeRow(ctx, "government_resources", retirementRow(how), id);
  if (error) return dbFail(res, error);
  const recordedResource = await appendVersion(ctx, {
    target_kind: "resource",
    target_id: id,
    snapshot: data,
    change_note: how.kind === "supersede" ? text(body.note, 500) || "Superseded" : `Retracted by ADUAtlas: ${text(how.reason, 480)}`,
    source: "admin",
  });
  res.status(200).json({
    ok: true,
    resource: presentResource(data),
    retired_as: how.kind === "supersede" ? "superseded" : "retracted",
    warning: joinWarnings(droppedWarning(dropped), versionWarning(recordedResource.error)),
    note:
      how.kind === "supersede"
        ? "Superseded and kept, with the date the jurisdiction replaced it."
        : "Retracted and kept, with the reason. Retracted means ADUAtlas's own record was wrong; the reason is internal and no homeowner page shows it.",
  });
};

// ── Government entities, claims and memberships ─────────────────────────────
const entities = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const status = oneOf(url.searchParams.get("claim_status"), CLAIM_STATUSES);
  if (status === false) return res.status(400).json({ error: "claim_status must be unclaimed, claimed or verified" });

  // claim_status is derived, so the filter is expressed in the two columns that
  // decide it rather than in a column that does not exist.
  let query = ctx.svc.from("government_entities").select("*").limit(500);
  if (status === "verified") query = query.eq("verification_status", "verified");
  else if (status === "claimed") query = query.not("claimed_at", "is", null).neq("verification_status", "verified");
  else if (status === "unclaimed") query = query.is("claimed_at", null);
  const { data, error } = await query.order("name");
  if (error) return fail(res, error);

  const ids = (data || []).map((e) => e.id);
  const jIds = [...new Set((data || []).map((e) => e.jurisdiction_id).filter(Boolean))];
  const { data: jRows } = jIds.length
    ? await ctx.svc.from("jurisdictions").select("id, name, jurisdiction_type, state_code, slug, path, published_at").in("id", jIds)
    : { data: [] };
  const byJ = Object.fromEntries((jRows || []).map((j) => [j.id, presentJurisdiction(j)]));

  let memberships = [];
  if (ids.length) {
    const { data: rows } = await ctx.svc.from("government_memberships").select("*").in("entity_id", ids);
    memberships = (await withPeople(ctx, rows || [])).map(presentMembership);
  }
  const grouped = {};
  for (const m of memberships) (grouped[m.entity_id] = grouped[m.entity_id] || []).push(m);

  res.status(200).json({
    items: (data || []).map((e) => ({
      ...presentEntity(e),
      jurisdiction: byJ[e.jurisdiction_id] || null,
      memberships: grouped[e.id] || [],
      // Shown so a stale verification can never quietly outrank the memberships
      // that actually exist.
      derived_claim_status: deriveClaimStatus(grouped[e.id] || []),
    })),
  });
};

const entitySave = async (req, res, ctx) => {
  const body = readBody(req);
  const e = body.entity || body;
  const id = e.id ? uuid(e.id) : null;
  if (e.id && !id) return res.status(400).json({ error: "id is not a valid record id" });
  const jurisdiction_id = uuid(e.jurisdiction_id);
  if (!jurisdiction_id) return res.status(400).json({ error: "jurisdiction_id required" });
  const name = text(e.name, 200);
  if (!name) return res.status(400).json({ error: "name required" });
  const entity_type = oneOf(e.entity_type, ENTITY_TYPES, ENTITY_TYPE_ALIASES);
  if (!entity_type) return res.status(400).json({ error: `entity_type must be one of: ${ENTITY_TYPES.join(", ")}` });

  let before = null;
  if (id) {
    const { data, error: beforeErr } = await ctx.svc.from("government_entities").select("*").eq("id", id).maybeSingle();
    if (beforeErr) return fail(res, beforeErr);
    if (!data) return res.status(404).json({ error: "government entity not found" });
    before = data;
  }
  // ONE WEBSITE, TWO SPELLINGS (R3-09). official_website_url is the column and
  // website_url the console's older name, and presentEntity sends both. A form
  // seeded from that row and posted back carries both, with the edit in only one
  // of them; reading "whichever key comes first" kept the stale echo and dropped
  // Amy's edit with no word said. So when both are sent and disagree, the one that
  // still equals the stored value is the echo and the other is the edit. If
  // NEITHER equals it, nothing tells which one Amy meant, and the save is refused
  // rather than guessed.
  const website = resolveWebsite(e, before);
  if (website?.conflict) {
    return res.status(400).json({ error: "the request carries two different official websites and neither is the one on record, so it is not clear which one to keep. Nothing was saved. Reload the console and edit the website again." });
  }
  const official_website_url = link(website);
  if (official_website_url === false) return res.status(400).json({ error: "the official website must be a full http(s) URL" });
  const source_url = link(e.source_url);
  if (source_url === false) return res.status(400).json({ error: "the source URL must be a full http(s) URL" });
  const official_domains = domainList(e.official_domains);
  if (official_domains === false) return res.status(400).json({ error: "official domains are bare domains, for example phoenix.gov" });

  // Neither claimed_at nor verification_status is ever accepted from the body.
  // Verification is ADUAtlas confirming authority, not a field somebody sets,
  // and government_entities_verification_guard() refuses it from a browser as
  // well. Nothing an admin types here can make an entity look verified.
  const row = {
    jurisdiction_id,
    name,
    entity_type,
    official_domains,
  };
  // An edit that did not mention the website keeps it; a new record starts with
  // whatever was sent, which may be nothing.
  if (website !== undefined || !id) row.official_website_url = official_website_url;
  if (source_url !== null || Object.prototype.hasOwnProperty.call(e, "source_url")) row.source_url = source_url;

  const { data, error, dropped } = await writeRow(ctx, "government_entities", row, id);
  if (error) return dbFail(res, error);

  const out = await reloadEntity(ctx, data.id);
  // Read back rather than assumed: the stored website is compared with what was
  // asked for, so an edit that did not land can never pass as saved again.
  const stored = out.entity?.official_website_url ?? data.official_website_url ?? null;
  const websiteMismatch =
    "official_website_url" in row && (stored || null) !== (official_website_url || null)
      ? `The official website was not stored as entered (the record holds ${stored || "no website"}).`
      : undefined;
  res.status(200).json({
    ok: true,
    entity: out.entity || presentEntity(data),
    claim_status: out.claim_status,
    derived_claim_status: out.derived_claim_status,
    warning: joinWarnings(
      droppedWarning(dropped),
      websiteMismatch,
      // 0012 gives an entity two internal notes, both tied to an event:
      // claim_note (what was said when it was claimed) and verification_note
      // (what Amy checked). There is no general note column, and repurposing
      // one of those into a scratchpad would make a claim record say something
      // that never happened. claim_status and verification_status are not warned
      // about: they are simply ignored on the way in, because verification is
      // ADUAtlas confirming authority and the three states of 2m are derived.
      unsupportedWarning(
        unsupported(e, ["notes"]),
        "An entity's internal notes are claim_note, written when it is claimed, and verification_note, written when a representative is verified.",
      ),
    ),
  });
};

// THERE IS NO CLAIM-CODE INVITATION IN THIS SCHEMA (see the header). 0012 claims
// an entity through claim_government_entity(), which takes a name, a job title,
// a work email, a phone and a note, and no code; and government_entities has no
// column for an invited address, an invitation note, a claim code or the date one
// was issued. This route therefore records nothing and says so, rather than
// writing columns that do not exist or logging an invitation in claim_note,
// which is the claimant's own words. Adding the invitation record is a
// migration, and this module does not own migrations.
const entityInvite = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(body.id);
  if (!id) return res.status(400).json({ error: "id required" });
  const { data: entity, error } = await ctx.svc.from("government_entities").select("id, name").eq("id", id).maybeSingle();
  if (error) return fail(res, error);
  if (!entity) return res.status(404).json({ error: "government entity not found" });
  return res.status(501).json({
    error:
      "Nothing was recorded. This schema has no claim-code invitation: migration 0012 claims an entity through claim_government_entity(), which needs no code, and government_entities has no column for an invited address, an invitation note, a claim code or the date one was issued. Invite the agency by ordinary email and review the claim when it arrives; recording the invitation in ADUAtlas needs a migration.",
    claim_invitations_supported: false,
    entity: { id: entity.id, name: entity.name },
    note: "Claiming never verifies. A claim arrives as a pending membership, and only verifying a representative's authority produces a Verified Government Account.",
  });
};

// Verifying is a deliberate act with a record of what was checked. It means
// ADUAtlas confirmed this person is authorised to represent this entity. It
// does not mean ADUAtlas checked that their information is legally correct,
// and it is not a publishing right. It goes through the service-role-only RPC,
// which writes the audit row no API role may insert.
const membershipVerify = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(field(body, "membership_id", "id"));
  if (!id) return res.status(400).json({ error: "id required" });
  const what = text(body.checked, 2000);
  if (!what) return res.status(400).json({ error: "record what you checked before verifying: the domain, the directory listing, the phone call, the letter" });
  const method = text(body.method, 120);
  // verification_note lives on the ENTITY in 0012, and the RPC writes it. There
  // is no verification_method column, so the shorthand is folded into the note
  // rather than dropped.
  const note = [what, method ? `How: ${method}` : null, text(body.note, 2000)].filter(Boolean).join("\n");

  const { data: m, error: mErr } = await ctx.svc.from("government_memberships").select("*").eq("id", id).maybeSingle();
  if (mErr) return fail(res, mErr);
  if (!m) return res.status(404).json({ error: "membership not found" });
  if (m.revoked_at || m.status === "revoked") {
    return res.status(409).json({ error: "this membership is revoked. Revocation is not undone by verifying; the person claims again." });
  }

  const { data: result, error } = await ctx.svc.rpc("admin_verify_government_membership", {
    p_membership_id: id,
    p_actor_app_user_id: ctx.row.id,
    p_note: note,
  });
  if (error) return dbFail(res, error);

  const { data: rows } = await ctx.svc.from("government_memberships").select("*").eq("id", id);
  const [membership] = (await withPeople(ctx, rows || [])).map(presentMembership);
  const again = await reloadEntity(ctx, m.entity_id);
  if (again.error) return fail(res, again.error);
  res.status(200).json({
    ok: true,
    membership: membership || null,
    entity: again.entity,
    claim_status: again.claim_status,
    derived_claim_status: again.derived_claim_status,
    result,
    note: "Verification is identity. It grants authority over no jurisdiction record and it creates no partnership: both are separate, deliberate acts.",
  });
};

// Revocation is immediate and visible. A permission that survives the
// authority behind it is the failure mode that matters, so the membership
// keeps its history, the entity's state is read back on the spot, and nothing
// about the entity record itself is touched: people leave, the institution does
// not.
const membershipRevoke = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(field(body, "membership_id", "id"));
  if (!id) return res.status(400).json({ error: "id required" });
  const why = text(body.reason, 2000);
  if (!why) return res.status(400).json({ error: "a revocation carries its reason" });

  const { data: m, error: mErr } = await ctx.svc.from("government_memberships").select("*").eq("id", id).maybeSingle();
  if (mErr) return fail(res, mErr);
  if (!m) return res.status(404).json({ error: "membership not found" });
  if (m.revoked_at) return res.status(409).json({ error: "this membership is already revoked" });

  const { data: result, error } = await ctx.svc.rpc("admin_revoke_government_membership", {
    p_membership_id: id,
    p_actor_app_user_id: ctx.row.id,
    p_reason: why,
  });
  if (error) return dbFail(res, error);

  const { data: rows } = await ctx.svc.from("government_memberships").select("*").eq("id", id);
  const [membership] = (await withPeople(ctx, rows || [])).map(presentMembership);
  const again = await reloadEntity(ctx, m.entity_id);
  if (again.error) return fail(res, again.error);
  res.status(200).json({
    ok: true,
    membership: membership || null,
    entity: again.entity,
    claim_status: again.claim_status,
    derived_claim_status: again.derived_claim_status,
    result,
  });
};

// ── Submissions: review and publish ─────────────────────────────────────────
// Nothing a government submits reaches a homeowner before Amy acts.
//
// 0012 spells a submission's shape kind / target_provision_id /
// target_resource_id; the console reads target_kind and target_id, so both
// travel. decline_reason is the console's name for review_note on a rejection.
const presentSubmission = (s) =>
  s
    ? {
        ...s,
        target_kind: s.kind ?? null,
        target_id: s.target_provision_id ?? s.target_resource_id ?? null,
        decline_reason: s.status === "rejected" ? s.review_note ?? null : null,
      }
    : null;

const submissions = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const status = oneOf(url.searchParams.get("status"), SUBMISSION_STATUSES);
  if (status === false) return res.status(400).json({ error: `status must be one of: ${SUBMISSION_STATUSES.join(", ")}` });

  let query = ctx.svc.from("regulatory_submissions").select("*").limit(300);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("submitted_at", { ascending: false });
  if (error) return fail(res, error);

  const eIds = [...new Set((data || []).map((s) => s.entity_id).filter(Boolean))];
  const jIds = [...new Set((data || []).map((s) => s.jurisdiction_id).filter(Boolean))];
  const { data: eRows } = eIds.length ? await ctx.svc.from("government_entities").select("*").in("id", eIds) : { data: [] };
  const { data: jRows } = jIds.length
    ? await ctx.svc.from("jurisdictions").select("id, name, jurisdiction_type, state_code, slug, path, published_at").in("id", jIds)
    : { data: [] };
  const byE = Object.fromEntries((eRows || []).map((e) => [e.id, presentEntity(e)]));
  const byJ = Object.fromEntries((jRows || []).map((j) => [j.id, presentJurisdiction(j)]));
  const grants = await liveGrantIndex(ctx, eIds);

  res.status(200).json({
    items: (data || []).map((s) => ({
      ...presentSubmission(s),
      entity: byE[s.entity_id] || null,
      jurisdiction: byJ[s.jurisdiction_id] || null,
      // Authority is a GRANT ROW, matched by equality, never the entity's own
      // seat and never containment. A submission from an entity that holds no
      // live submit grant on that exact record is flagged here and cannot be
      // published without the admin acknowledging it.
      authority_mismatch: !hasSubmitGrant(grants, s.entity_id, s.jurisdiction_id),
    })),
  });
};

// Everything the review screen needs: what was submitted, what ADUAtlas
// currently publishes, who submitted it and whether their authority still
// stands.
const loadSubmission = async (ctx, id) => {
  const { data: sub, error } = await ctx.svc.from("regulatory_submissions").select("*").eq("id", id).maybeSingle();
  if (error) return { error };
  if (!sub) return { notFound: true };
  const { data: entity } = sub.entity_id
    ? await ctx.svc.from("government_entities").select("*").eq("id", sub.entity_id).maybeSingle()
    : { data: null };
  const { data: jurisdictionRow } = sub.jurisdiction_id
    ? await ctx.svc
        .from("jurisdictions")
        .select("id, name, jurisdiction_type, slug, state_code, path, parent_id, published_at")
        .eq("id", sub.jurisdiction_id)
        .maybeSingle()
    : { data: null };

  const isResource = sub.kind === "resource";
  const table = isResource ? "government_resources" : "regulatory_provisions";
  const targetId = isResource ? sub.target_resource_id : sub.target_provision_id;
  // What ADUAtlas publishes RIGHT NOW for this jurisdiction and this topic or
  // resource type, whether or not the submission named a target: a member
  // proposing a new rule for a topic we already publish is still a change to
  // that rule.
  let current = null;
  let targeted = null;
  if (targetId) {
    const { data } = await ctx.svc.from(table).select("*").eq("id", targetId).maybeSingle();
    current = data || null;
    targeted = data || null;
  }
  if (!current) {
    let q = ctx.svc.from(table).select("*").eq("jurisdiction_id", sub.jurisdiction_id).eq("is_published", true);
    q = isResource ? q.eq("resource_type", sub.resource_type) : q.eq("topic_key", sub.topic_key);
    const { data } = await q.limit(1).maybeSingle();
    current = data || null;
  }

  let membership = null;
  if (sub.entity_id && sub.submitted_by_government_user_id) {
    const { data: rows } = await ctx.svc
      .from("government_memberships")
      .select("*")
      .eq("entity_id", sub.entity_id)
      .eq("government_user_id", sub.submitted_by_government_user_id)
      .order("requested_at", { ascending: false });
    const [withPerson] = (await withPeople(ctx, (rows || []).slice(0, 1))).map(presentMembership);
    membership = withPerson || null;
  }
  const grants = await liveGrantIndex(ctx, [sub.entity_id]);
  return {
    submission: presentSubmission(sub),
    raw: sub,
    entity: presentEntity(entity),
    jurisdiction: presentJurisdiction(jurisdictionRow),
    current: isResource ? presentResource(current) : presentProvision(current),
    currentRaw: current,
    // The record the submission itself named, which is a narrower fact than
    // "what ADUAtlas publishes for this topic": only a submission that names a
    // resource is a correction TO that resource.
    targetedRaw: targeted,
    membership,
    // A revoked or unverified member's submission is retained and readable,
    // and it is not publishable. Verification is identity, not a publishing
    // right, and revocation is immediate.
    submitter_authority: membership
      ? membership.revoked_at || membership.status === "revoked"
        ? "revoked"
        : membership.status === "rejected"
          ? "rejected"
          : membership.status === "verified" && membership.verified_at
            ? "verified"
            : "unverified"
      : "none",
    authority_mismatch: !hasSubmitGrant(grants, sub.entity_id, sub.jurisdiction_id),
  };
};

const submission = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const id = uuid(url.searchParams.get("id"));
  if (!id) return res.status(400).json({ error: "id required" });
  const out = await loadSubmission(ctx, id);
  if (out.error) return fail(res, out.error);
  if (out.notFound) return res.status(404).json({ error: "submission not found" });
  res.status(200).json({
    submission: out.submission,
    entity: out.entity,
    jurisdiction: out.jurisdiction,
    current: out.current,
    membership: out.membership,
    submitter_authority: out.submitter_authority,
    authority_mismatch: out.authority_mismatch,
    // Fields the payload carries that are ADUAtlas's to state, not the
    // government's. submission-publish ignores them; the console says so.
    ignored_from_submission: ignoredFromSubmission(out.raw?.payload),
  });
};

// ADUATLAS'S OWN FACTS, which a government submission never supplies (2m, 2t).
// source_checked_date and verification_status are what ADUAtlas read and when;
// the rest are ADUAtlas's workflow, provenance and bookkeeping, which this
// module or the database sets. The government's own facts (the value, the
// effective date, the source it cites, a repeal date) pass through untouched.
const ADUATLAS_ONLY_FIELDS = [
  "source_checked_date", "verification_status",
  "supplied_by", "supplied_by_entity_id", "source_submission_id",
  "review_status", "record_published_at", "published_updated_date", "first_published_at", "is_published",
  "retracted_at", "retraction_reason", "superseded_by_provision_id",
  "admin_note", "sort_order",
];
const governmentSaid = (payload) =>
  Object.fromEntries(Object.entries(payload || {}).filter(([k]) => !ADUATLAS_ONLY_FIELDS.includes(k)));
const ignoredFromSubmission = (payload) =>
  Object.keys(payload || {}).filter((k) => ADUATLAS_ONLY_FIELDS.includes(k) && !notSent(payload[k]));

// Publishing writes a NEW record and asks the database to publish it. It never
// destroys the version before it and it never touches the submission's payload:
// ADUAtlas keeps both what the government said and what ADUAtlas publishes, so a
// state and a city that disagree can both be represented.
const submissionPublish = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(body.id);
  if (!id) return res.status(400).json({ error: "id required" });

  const loaded = await loadSubmission(ctx, id);
  if (loaded.error) return fail(res, loaded.error);
  if (loaded.notFound) return res.status(404).json({ error: "submission not found" });
  const { raw: sub, entity, currentRaw: current, targetedRaw: targeted, submitter_authority, authority_mismatch } = loaded;

  if (!SUBMISSION_OPEN_STATUSES.includes(sub.status)) {
    return res.status(409).json({ error: `this submission is already ${SUBMISSION_STATUS_LABELS[sub.status] || sub.status}` });
  }
  if (submitter_authority !== "verified") {
    return res.status(409).json({
      error:
        submitter_authority === "revoked"
          ? "the person who submitted this no longer represents the entity. The submission is kept, and it is not published."
          : "only a verified representative's submission is published. Verify their authority first, or decline this with a reason.",
    });
  }
  if (authority_mismatch && body.acknowledge_authority_mismatch !== true) {
    return res.status(409).json({
      error:
        "this entity holds no live grant to submit against that jurisdiction record. Authority is an explicit grant, matched by equality; containment does not create it and neither does the entity's own seat. Grant the authority, or acknowledge the mismatch to publish anyway.",
      authority_mismatch: true,
    });
  }
  const target_kind = oneOf(sub.kind, TARGET_KINDS);
  if (!target_kind) return res.status(400).json({ error: "this submission has no valid kind" });
  const isResource = target_kind === "resource";

  const payload = sub.payload && typeof sub.payload === "object" && !Array.isArray(sub.payload) ? sub.payload : null;
  if (!payload) return res.status(400).json({ error: "this submission carries no readable payload" });

  // WHAT THE GOVERNMENT SAID, AND ONLY THAT (DEF-09, DEF-10). The payload is the
  // government's statement about its rule. When ADUAtlas last read the source
  // and whether ADUAtlas checked it are ADUAtlas's own facts, so whatever the
  // payload says about them is dropped here and they come from the admin who is
  // publishing, in this request. A payload can no longer publish "ADUAtlas last
  // checked the source on 2020-01-01" or "Source checked" on ADUAtlas's behalf.
  const said = governmentSaid(payload);
  const saidState = pick(said.field_state, FIELD_STATES, FIELD_STATE.NOT_RESEARCHED);
  if (saidState === FIELD_STATE.NOT_RESEARCHED) {
    const why = isResource ? resourcePublishBlocker({ field_state: saidState }) : provisionPublishBlocker({ field_state: saidState });
    return res.status(400).json({ error: `this submission cannot be published as it stands: ${why}` });
  }
  const checkedDate = date(field(body, "source_checked_date", "checked_date"));
  if (checkedDate === false) return res.status(400).json({ error: "source_checked_date must be a date in YYYY-MM-DD form" });
  if (!checkedDate) {
    return res.status(400).json({
      error:
        "enter the date ADUAtlas checked the source before publishing. Nothing was published. That date is ADUAtlas's own record of when it last read the source, so it comes from you and never from the government's submission.",
    });
  }
  if (checkedDate > todayUtc()) {
    return res.status(400).json({ error: `the date ADUAtlas checked the source (${checkedDate}) is later than today. Nothing was published.` });
  }
  // Not sent means nobody at ADUAtlas said they checked it: "Not checked", which
  // is exactly what 0012 says a record taken from a submission is until then.
  const checkedStatus = pick(body.verification_status, RECORD_VERIFICATION_STATUSES, "unverified");
  if (checkedStatus === false) {
    return res.status(400).json({ error: `verification_status must be one of: ${RECORD_VERIFICATION_STATUSES.join(", ")}` });
  }
  const facts = { ...said, source_checked_date: checkedDate, verification_status: checkedStatus };

  const built = isResource
    ? resourceFields(facts, { notesAre: "public", fromSubmission: true, resourceType: sub.resource_type })
    : provisionFields(facts, { fromSubmission: true, topicKey: sub.topic_key });
  if (built.error) return res.status(400).json({ error: `this submission cannot be published as it stands: ${built.error}` });

  const blocker = isResource ? resourcePublishBlocker(built.row, targeted) : provisionPublishBlocker(built.row);
  if (blocker) return res.status(400).json({ error: `this submission cannot be published as it stands: ${blocker}` });

  const table = isResource ? "government_resources" : "regulatory_provisions";
  const note = text(body.note, 500);

  // WHERE THE NEW RECORD GOES.
  //   provision  never into the published row. admin_publish_provision()
  //              supersedes the rule being replaced and KEEPS it, and
  //              regulatory_provisions_current_uidx allows exactly one current
  //              published rule per (jurisdiction, topic), so the new statement
  //              is a new row. If an open draft already exists for that pair —
  //              regulatory_provisions_open_draft_uidx allows one — that draft is
  //              the row this submission fills.
  //   resource   a jurisdiction may publish several ordinances or two contacts,
  //              so there is no current-record index to satisfy. A submission
  //              that NAMES the resource it corrects updates that row, which
  //              keeps the id the government referred to; the version trigger
  //              keeps what it said before. A submission that names none is a
  //              new resource and gets a new row, because overwriting a
  //              same-type resource it never mentioned would silently delete one
  //              of the two ordinances a city publishes.
  let writeId = null;
  if (isResource) {
    writeId = targeted ? targeted.id : null;
  } else {
    const { data: openDraft } = await ctx.svc
      .from("regulatory_provisions")
      .select("id")
      .eq("jurisdiction_id", sub.jurisdiction_id)
      .eq("topic_key", sub.topic_key)
      .in("review_status", ["draft", "in_review"])
      .limit(1)
      .maybeSingle();
    writeId = openDraft?.id || null;
  }

  // The previous published state is kept before the new one lands.
  if (current) {
    const kept = await appendVersion(ctx, {
      target_kind,
      target_id: current.id,
      snapshot: current,
      change_note: "State ADUAtlas published before this government submission",
      source: "admin",
    });
    // Publishing must never be the moment the earlier record disappears.
    if (kept.error) return historyLost(res, kept.error);
  }

  const row = {
    ...built.row,
    jurisdiction_id: sub.jurisdiction_id,
    // Provenance: this came from a verified government account, and the product
    // says so separately from "Source: official government website". The guard
    // trigger refuses the attribution unless the entity really is verified.
    supplied_by: "government_account",
    supplied_by_entity_id: sub.entity_id,
    source_submission_id: sub.id,
    // Published by the RPC below, not by this write. The one exception is a
    // correction to a record that is ALREADY published: the guard refuses a
    // published record moving back to a draft, and re-stamps record_published_at
    // itself when the content changes, so there is no transition for the publish
    // RPC to make.
    review_status: writeId && targeted && targeted.id === writeId && targeted.review_status === "published" ? "published" : "in_review",
  };

  const { data, error, dropped } = await writeRow(ctx, table, row, writeId);
  if (error) return dbFail(res, error);

  if (data.review_status !== "published") {
    const { error: pubErr } = isResource ? await publishResource(ctx, data.id, note) : await publishProvision(ctx, data.id, note);
    if (pubErr) {
      return res.status(refused(pubErr) ? 400 : 500).json({
        error: `the submission's content was staged as a draft and NOT published, and the submission has not been reviewed: ${pubErr.message}`,
        record: isResource ? presentResource(data) : presentProvision(data),
      });
    }
  }

  const { data: after } = await ctx.svc.from(table).select("*").eq("id", data.id).maybeSingle();
  const finalRow = after || data;

  const { version, error: versionErr } = await appendVersion(ctx, {
    target_kind,
    target_id: finalRow.id,
    snapshot: finalRow,
    change_note: note || `Published from ${entity?.name || "a government"} submission`,
    source: "government_submission",
    submission_id: sub.id,
  });

  // The submission itself keeps its payload, its submitter and its date: the
  // immutability trigger refuses a change to any of them even from here. Only
  // the review columns move, and they move through the RPC that writes the audit
  // row. 0012's word for a submission ADUAtlas acted on is "accepted"; what was
  // submitted and what ADUAtlas publishes are both kept.
  const { data: reviewResult, error: reviewErr } = await ctx.svc.rpc("admin_review_submission", {
    p_submission_id: sub.id,
    p_actor_app_user_id: ctx.row.id,
    p_decision: "accepted",
    p_note: note,
    p_resulting_provision_id: isResource ? null : finalRow.id,
    p_resulting_resource_id: isResource ? finalRow.id : null,
  });
  if (reviewErr) {
    return res.status(refused(reviewErr) ? 400 : 500).json({
      error: `the record was published but the submission was NOT marked reviewed: ${reviewErr.message}`,
      record: isResource ? presentResource(finalRow) : presentProvision(finalRow),
    });
  }

  const { data: reviewed } = await ctx.svc.from("regulatory_submissions").select("*").eq("id", sub.id).maybeSingle();
  res.status(200).json({
    ok: true,
    submission: presentSubmission(reviewed),
    record: isResource ? presentResource(finalRow) : presentProvision(finalRow),
    version: version || null,
    review: reviewResult,
    // What the submission tried to say on ADUAtlas's behalf, and was not used.
    ignored_from_submission: ignoredFromSubmission(payload),
    warning: joinWarnings(droppedWarning(dropped), versionWarning(versionErr)),
    note: "Published, and the submission is kept exactly as it was sent. The date the source was checked and its verification status are the ones you entered, not the government's. If a rule was replaced it is superseded and dated, not overwritten.",
  });
};

// Declining keeps the submission and its reason. A state that finds a local
// ordinance conflicts with state law is a disagreement to represent, not a row
// to delete. 0012's word for a refused submission is "rejected".
const submissionDecline = async (req, res, ctx) => {
  const body = readBody(req);
  const id = uuid(body.id);
  if (!id) return res.status(400).json({ error: "id required" });
  const reason = text(body.reason, 2000);
  if (!reason) return res.status(400).json({ error: "a declined submission carries the reason it was declined" });

  const { data: sub, error } = await ctx.svc.from("regulatory_submissions").select("id, status").eq("id", id).maybeSingle();
  if (error) return fail(res, error);
  if (!sub) return res.status(404).json({ error: "submission not found" });
  if (!SUBMISSION_OPEN_STATUSES.includes(sub.status)) {
    return res.status(409).json({ error: `this submission is already ${SUBMISSION_STATUS_LABELS[sub.status] || sub.status}` });
  }

  const { data: result, error: rpcErr } = await ctx.svc.rpc("admin_review_submission", {
    p_submission_id: id,
    p_actor_app_user_id: ctx.row.id,
    p_decision: "rejected",
    p_note: reason,
    p_resulting_provision_id: null,
    p_resulting_resource_id: null,
  });
  if (rpcErr) return dbFail(res, rpcErr);

  const { data } = await ctx.svc.from("regulatory_submissions").select("*").eq("id", id).maybeSingle();
  res.status(200).json({
    ok: true,
    submission: presentSubmission(data),
    result,
    note: "Declined and kept, with the reason. Both halves of the record stay: what the government said, and what ADUAtlas said back.",
  });
};

// ── History ─────────────────────────────────────────────────────────────────
const versions = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const target_kind = oneOf(url.searchParams.get("target_kind"), TARGET_KINDS);
  const target_id = uuid(url.searchParams.get("target_id"));
  if (!target_kind || !target_id) return res.status(400).json({ error: "target_kind and target_id required" });
  const { data, error } = await ctx.svc
    .from("regulatory_versions")
    .select("*")
    .eq("target_kind", target_kind)
    .eq("target_id", target_id)
    .order("version", { ascending: false })
    .limit(100);
  if (error) return fail(res, error);
  res.status(200).json({ items: data || [] });
};

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNMENT CLAIMS, EXPLICIT AUTHORITY, AND EDUCATION PARTNERSHIPS (2p)
//
// Routes, all dispatched by the single admin catch-all so the Vercel function
// count does not move:
//   GET  regulatory/gov-meta                     vocabularies + which migrations are present
//   GET  regulatory/gov-entities[?identity=][?partnership=][?claims=waiting][?q=]
//   GET  regulatory/gov-entity?id=...            claims, authority, partnership, links, codes, counts
//   GET  regulatory/gov-jurisdictions?q=|state=  the picker for granting explicit authority
//   POST regulatory/gov-identity-verify          { membership_id, checked, note? }
//   POST regulatory/gov-identity-reject          { membership_id, reason }
//   POST regulatory/gov-membership-revoke        { membership_id, reason }
//   POST regulatory/gov-authority-grant          { entity_id, jurisdiction_id, grant_basis, may_submit? }
//   POST regulatory/gov-authority-revoke         { grant_id, reason }
//   POST regulatory/gov-partnership-activate     { entity_id, note? }
//   POST regulatory/gov-partnership-suspend      { entity_id, reason }
//   POST regulatory/gov-partnership-reactivate   { entity_id, note? }
//   POST regulatory/gov-access-toggle            { kind: link|code, id, active, reason? }
//
// THREE CONCEPTS THAT NEVER MERGE (2p). Three different fields, three different
// vocabularies, three different sets of words, and no combined status in any
// payload this module returns:
//   GOVERNMENT IDENTITY VERIFICATION   government_entities.verification_status
//                     with claimed_at. unclaimed / claim_pending /
//                     identity_verified / verification_rejected / suspended. The
//                     public words are "Verified Government Account" and they
//                     mean ONLY that ADUAtlas verified identity and control:
//                     never that the government endorses ADUAtlas or a builder,
//                     never that a regulation is correct, and never the builder
//                     badge "Verified on ADUAtlas".
//   ADUATLAS EDUCATION PARTNERSHIP     government_partnerships.status (0014).
//                     pending / active / inactive / suspended, and "none" for the
//                     ABSENCE of a row. The public words are "ADUAtlas Education
//                     Partner". It is NEVER called verified, because verification
//                     already means something else.
//   REGULATORY SOURCE VERIFICATION     field_state, per record and per field,
//                     in the older half of this file. Untouched here. A city with
//                     a verified account does not thereby hold one verified rule,
//                     and ADUAtlas publishes sourced rules for cities that have
//                     no account at all.
// "Verified Government Account but NOT an Education Partner" is an ordinary
// everyday state, so identity_state and partnership_state travel as two values
// that are free to disagree, and the two filters on gov-entities are two filters.
//
// IDENTITY NEVER ACTIVATES A PARTNERSHIP. There is no code path in this module
// from a verification to a partnership row: gov-identity-verify calls one RPC
// that touches identity only, and 0014's cascade is deliberately one-directional.
// A PARTNERSHIP NEVER ACTIVATES WITHOUT VERIFIED IDENTITY, and that is a DATABASE
// constraint: government_partnerships_active_requires_verified_identity, backed
// by a composite foreign key on (entity_id, verification_status) so the
// denormalised copy cannot drift. This module refuses it too, and the console
// refuses to offer the button. Three refusals; the database one is the boundary,
// and the other two exist so Amy is never offered something that cannot work.
//
// AUTHORITY IS EXPLICIT, NEVER GEOGRAPHIC (2m). The only source of authority is a
// row in government_jurisdiction_grants naming ONE entity and ONE jurisdiction,
// matched by equality. Nothing here reads jurisdictions.parent_id or the entity's
// own jurisdiction_id to decide permission: the breadcrumb is fetched for DISPLAY
// so Amy can see which record she is choosing, and granting is one record at a
// time with a written reason, because that is what delegating authority is.
//
// EVERY WRITE GOES THROUGH A SERVICE-ROLE-ONLY RPC, for the reason 0012 and 0014
// both give: those functions write the audit row that no API role may insert, and
// each takes the acting admin's id because "the service key did it" is not an
// answer to who did it. requireAdmin has already run in the handler below.
//
// WHAT THIS MODULE MAY NOT RETURN. A link token and a code are deliberately never
// selected: a partner takes its own from the partner portal, and a sponsored
// entitlement that leaks out of an admin list is one somebody else can spend.
// Partner numbers come from partner_analytics, which is aggregate by
// construction; no endpoint here returns a redeeming homeowner's id, email or
// account, because sponsoring somebody's education does not make them the
// partner's business (2p) and Amy's scope (2f) is not homeowner management.
const IDENTITY_STATES = ["unclaimed", "claim_pending", "identity_verified", "verification_rejected", "suspended"];
const IDENTITY_STATE_LABELS = {
  unclaimed: "Unclaimed",
  claim_pending: "Claim pending",
  identity_verified: "Verified Government Account",
  verification_rejected: "Verification rejected",
  suspended: "Suspended",
};
const IDENTITY_STATE_HELP = {
  unclaimed: "ADUAtlas built this record from authoritative public sources. Nothing on the site may imply this government takes part in ADUAtlas.",
  claim_pending: "Somebody has claimed this entity. Their authority is not verified, so they hold no capability, no badge and no partnership.",
  identity_verified: "ADUAtlas confirmed that a person is authorised to represent this entity. It says nothing about whether any rule is legally correct, and it is not a partnership.",
  verification_rejected: "ADUAtlas reviewed a claim and refused it. The claim and the reason are kept.",
  suspended:
    "ADUAtlas verified this account and later WITHDREW that verification, with a reason and a record of who did it. The badge is gone and the entity can issue no new sponsored links, codes or activations. Residents already sponsored keep their access. This is not a rejected claim: a rejection refuses a claim at the door, and a suspension takes back a verification ADUAtlas had granted.",
};

// The five words government_entities.verification_status actually STORES, labelled
// for a HISTORY row. Deliberately not identityState(), which reads claimed_at as
// well: on a live row that inference is right, and on a historical row it would be
// this endpoint guessing whether a claim existed at that moment. A history row
// reports what the column held and nothing more (2b).
const STORED_IDENTITY_LABELS = {
  unverified: "Not verified",
  pending: "Claim pending",
  verified: "Verified Government Account",
  rejected: "Verification rejected",
  suspended: "Verification withdrawn",
};

// "none" is the ABSENCE of a government_partnerships row, the way
// not_yet_researched is the absence of a published provision. It is never stored:
// 0014's CHECK allows pending, active, inactive and suspended only.
const PARTNERSHIP_STATES = ["none", "pending", "active", "inactive", "suspended"];
const PARTNERSHIP_STATE_LABELS = {
  none: "No partnership",
  pending: "Partnership pending",
  active: "ADUAtlas Education Partner",
  inactive: "Partnership inactive",
  suspended: "Partnership suspended",
};
const PARTNERSHIP_STATE_HELP = {
  none: "This entity has no ADUAtlas education partnership. Verified identity does not create one.",
  pending: "A partnership has been arranged and is not active. It unlocks nothing: no links, no codes, no sponsored access.",
  active: "Sponsored resident access is live. A resident arriving by this partner's link or code receives the $79 Golden educational entitlement and nothing else.",
  inactive: "The partnership has ended. New sponsored activations are refused; residents who already entered keep their accounts.",
  suspended: "ADUAtlas suspended this partnership. New sponsored activations are refused; residents who already entered keep their accounts.",
};
// 0014 owns the stored spelling. Read tolerantly, write only the four words 0014
// accepts, and never coerce an unrecognised value into a known one: an unknown
// status is shown as itself, so nobody is told "active" by a default.
const PARTNERSHIP_STATUS_ALIASES = {
  none: "none",
  no_partnership: "none",
  pending: "pending",
  partnership_pending: "pending",
  active: "active",
  active_partner: "active",
  inactive: "inactive",
  ended: "inactive",
  suspended: "suspended",
};
const PARTNERSHIP_WRITABLE = ["pending", "active", "inactive", "suspended"];

// 0012's entity_type and jurisdiction_type vocabularies. There used to be a
// second copy of each here because the first half of this file carried a
// different, unmigrated list; both halves now read the one list above, which is
// 0012's CHECK constraint.
const GOV_ENTITY_TYPES = ENTITY_TYPES;
const GOV_ENTITY_TYPE_LABELS = ENTITY_TYPE_LABELS;
const GOV_JURISDICTION_TYPE_LABELS = JURISDICTION_TYPE_LABELS;
const GOV_MEMBERSHIP_ROLE_LABELS = {
  viewer: "Reads only",
  contributor: "Submits updates",
  administrator: "Manages this entity's members",
};
const GOV_MEMBERSHIP_STATUS_LABELS = {
  pending: "Claim waiting on review",
  verified: "Verified representative",
  revoked: "Revoked",
  rejected: "Claim rejected",
};

// ── which migration is missing ──────────────────────────────────────────────
const missingTable = (error) => ["42P01", "PGRST205"].includes(error?.code);
const govFail = (res, error, migration) =>
  res.status(500).json({
    error: isNotMigrated(error) ? `Migration ${migration} is not applied yet (${error.message})` : error.message,
    migration_missing: isNotMigrated(error) ? migration : undefined,
  });

// ── the two states, each computed in exactly one place ──────────────────────
const identityState = (entity) => {
  if (!entity) return "unclaimed";
  const status = String(entity.verification_status || "").toLowerCase();
  if (status === "verified") return "identity_verified";
  if (status === "rejected") return "verification_rejected";
  if (status === "suspended") return "suspended";
  if (entity.claimed_at || status === "pending") return "claim_pending";
  return "unclaimed";
};
const partnershipState = (row) => {
  if (!row) return "none";
  const raw = String(row.status || "").trim().toLowerCase();
  if (!raw) return "none";
  return PARTNERSHIP_STATUS_ALIASES[raw] || raw;
};

// Side by side, never merged. Present on every entity payload so no consumer has
// to compute them and none is tempted to collapse them into one pill.
const presentStates = (entity, partnership) => {
  const identity_state = identityState(entity);
  const partnership_state = partnershipState(partnership);
  return {
    identity_state,
    identity_state_label: IDENTITY_STATE_LABELS[identity_state] || identity_state,
    partnership_state,
    partnership_state_label: PARTNERSHIP_STATE_LABELS[partnership_state] || partnership_state,
    // The two badges a public page may show, as two fields, because one is true
    // without the other every day of the week.
    public_identity_badge: identity_state === "identity_verified" ? "Verified Government Account" : null,
    public_partnership_badge: partnership_state === "active" ? "ADUAtlas Education Partner" : null,
  };
};

// A jurisdiction row for display. path and parent are DISPLAY: nothing here reads
// either to decide permission.
const govJurisdiction = (j) =>
  j
    ? {
        id: j.id,
        name: j.name,
        official_name: j.official_name || null,
        slug: j.slug,
        state_code: j.state_code || null,
        jurisdiction_type: j.jurisdiction_type || null,
        path: j.path || null,
        published_at: j.published_at || null,
      }
    : null;

// The columns of a link or a code that may leave the server. token and code are
// NOT among them and must not be added: this screen reports status, it does not
// hand out sponsored access.
const ACCESS_COLUMNS = "id, partnership_id, entity_id, jurisdiction_id, label, is_active, expires_at, max_redemptions, created_at, deactivated_at";
const presentAccessRow = (row) => {
  const expired = row.expires_at ? Date.parse(row.expires_at) < Date.now() : false;
  return {
    id: row.id,
    label: row.label || null,
    jurisdiction_id: row.jurisdiction_id || null,
    created_at: row.created_at || null,
    deactivated_at: row.deactivated_at || null,
    expires_at: row.expires_at || null,
    max_redemptions: row.max_redemptions ?? null,
    is_active: row.is_active === true,
    expired,
    // Usable right now, which is not the same question as "is the row enabled":
    // an unexpired disabled link and a live expired link are both dead, for
    // different reasons, and the console says which.
    is_live: row.is_active === true && !expired,
  };
};

// ── people behind the claims ────────────────────────────────────────────────
// withPeople, membershipIsLive and isVerifiedMembership are declared once, in
// the first half of this file, and both halves call them. They used to be
// declared twice with identical bodies, which is how one half of this file ended
// up speaking a different schema from the other without anybody noticing.

// ── gov-meta ────────────────────────────────────────────────────────────────
// Vocabularies first and unconditionally, then which migrations are actually
// present, so the screen renders and says what is missing instead of showing an
// empty list that reads like "no partners".
const govMeta = async (req, res, ctx) => {
  const vocab = {
    identity_states: IDENTITY_STATES,
    identity_state_labels: IDENTITY_STATE_LABELS,
    identity_state_help: IDENTITY_STATE_HELP,
    partnership_states: PARTNERSHIP_STATES,
    partnership_state_labels: PARTNERSHIP_STATE_LABELS,
    partnership_state_help: PARTNERSHIP_STATE_HELP,
    entity_types: GOV_ENTITY_TYPES,
    entity_type_labels: GOV_ENTITY_TYPE_LABELS,
    jurisdiction_type_labels: GOV_JURISDICTION_TYPE_LABELS,
    membership_role_labels: GOV_MEMBERSHIP_ROLE_LABELS,
    membership_status_labels: GOV_MEMBERSHIP_STATUS_LABELS,
    us_states: US_STATES,
  };

  // The sponsored benefit, read from the database rather than restated here, so
  // the one place that decides what a sponsorship grants is the place the console
  // quotes. The commercial rule is that it is Golden and nothing else.
  const { data: plan } = await ctx.svc.rpc("sponsored_entitlement_plan_id");
  vocab.sponsored_entitlement = {
    plan_id: plan || null,
    label: "Golden educational access, sponsored",
    price_usd: 79,
    note: "The sponsored benefit is the $79 Golden educational entitlement and nothing else. Platinum, Concierge and feasibility studies are untouched.",
  };

  const entities = await ctx.svc.from("government_entities").select("id, verification_status, claimed_at").limit(5000);
  if (entities.error) {
    return res.status(200).json({
      ...vocab,
      schema: {
        government: false,
        partnership: false,
        government_error: isNotMigrated(entities.error) ? "Migration 0012 is not applied yet." : entities.error.message,
      },
      counts: null,
    });
  }
  const rows = entities.data || [];
  const identity = Object.fromEntries(IDENTITY_STATES.map((s) => [s, 0]));
  for (const e of rows) {
    const state = identityState(e);
    identity[state] = (identity[state] || 0) + 1;
  }

  const partnerships = await ctx.svc.from("government_partnerships").select("entity_id, status").limit(5000);
  const partnershipReady = !partnerships.error;
  const partnership = Object.fromEntries(PARTNERSHIP_STATES.map((s) => [s, 0]));
  if (partnershipReady) {
    let withPartnership = 0;
    for (const p of partnerships.data || []) {
      const state = partnershipState(p);
      if (state === "none") continue;
      partnership[state] = (partnership[state] || 0) + 1;
      withPartnership += 1;
    }
    partnership.none = Math.max(rows.length - withPartnership, 0);
  }

  const claims = await ctx.svc.from("government_memberships").select("id", { count: "exact", head: true }).eq("status", "pending");

  res.status(200).json({
    ...vocab,
    schema: {
      government: true,
      partnership: partnershipReady,
      partnership_error: partnershipReady
        ? null
        : missingTable(partnerships.error)
          ? "Migration 0014 is not applied yet: government_partnerships does not exist."
          : partnerships.error.message,
    },
    counts: {
      entities: rows.length,
      // Two objects, never one. A verified account and an education partner are
      // two different facts and one number cannot carry both.
      identity,
      partnership: partnershipReady ? partnership : null,
      claims_waiting: claims.count || 0,
    },
  });
};

// ── gov-entities ────────────────────────────────────────────────────────────
// Two filters, because there is no combined status to filter on. Filtering by one
// would mean inventing it.
const govEntities = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const identity = oneOf(url.searchParams.get("identity"), IDENTITY_STATES);
  if (identity === false) return res.status(400).json({ error: `identity must be one of: ${IDENTITY_STATES.join(", ")}` });
  const partnership = oneOf(url.searchParams.get("partnership"), PARTNERSHIP_STATES);
  if (partnership === false) return res.status(400).json({ error: `partnership must be one of: ${PARTNERSHIP_STATES.join(", ")}` });
  const q = (url.searchParams.get("q") || "").trim();
  const claimsOnly = url.searchParams.get("claims") === "waiting";

  let query = ctx.svc.from("government_entities").select("*").limit(500).order("name");
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data: entityRows, error } = await query;
  if (error) return govFail(res, error, "0012");

  const ids = (entityRows || []).map((e) => e.id);
  if (!ids.length) return res.status(200).json({ items: [], schema: { partnership: true } });

  const { data: memberships, error: mErr } = await ctx.svc
    .from("government_memberships")
    .select("id, entity_id, status, verified_at, revoked_at")
    .in("entity_id", ids)
    .limit(3000);
  if (mErr) return govFail(res, mErr, "0012");

  const { data: grants } = await ctx.svc
    .from("government_jurisdiction_grants")
    .select("id, entity_id, jurisdiction_id, revoked_at")
    .in("entity_id", ids)
    .limit(3000);

  const jIds = [...new Set((entityRows || []).map((e) => e.jurisdiction_id).filter(Boolean))];
  const { data: jRows } = jIds.length ? await ctx.svc.from("jurisdictions").select("*").in("id", jIds) : { data: [] };
  const byJurisdiction = Object.fromEntries((jRows || []).map((j) => [j.id, govJurisdiction(j)]));

  const partnershipQuery = await ctx.svc
    .from("government_partnerships")
    // 0014 has no inactivated_at: a partnership that simply ENDED is a status
    // change, and when it changed is already recorded by updated_at and by the
    // audit row the government_audit() trigger writes. A third date to keep in
    // step would be a third date to get wrong. Asking for the column made
    // PostgREST reject the whole query, which reported every entity as having no
    // partnership and read on screen as "migration 0014 is not applied".
    .select("id, entity_id, status, activated_at, suspended_at, ended_reason, updated_at")
    .in("entity_id", ids)
    .limit(1000);
  const partnershipReady = !partnershipQuery.error;
  const byEntity = Object.fromEntries((partnershipQuery.data || []).map((p) => [p.entity_id, p]));

  // Counts come from partner_analytics, which is aggregate by construction: every
  // column in it is a count, a status or a date, and the service role reads every
  // row. Nothing about an individual resident is available here to leak.
  let analyticsByEntity = {};
  let links = [];
  let codes = [];
  if (partnershipReady) {
    const { data: analytics } = await ctx.svc
      .from("partner_analytics")
      .select("entity_id, partnership_status, active_links, active_codes, link_visits, link_redemptions, code_redemptions, sponsored_activations")
      .in("entity_id", ids);
    analyticsByEntity = Object.fromEntries((analytics || []).map((a) => [a.entity_id, a]));
    const linkQuery = await ctx.svc.from("partner_access_links").select("id, entity_id, is_active, expires_at").in("entity_id", ids).limit(2000);
    const codeQuery = await ctx.svc.from("partner_access_codes").select("id, entity_id, is_active, expires_at").in("entity_id", ids).limit(2000);
    links = linkQuery.data || [];
    codes = codeQuery.data || [];
  }
  const liveNow = (row) => row.is_active === true && !(row.expires_at && Date.parse(row.expires_at) < Date.now());

  const items = (entityRows || [])
    .map((e) => {
      const mine = (memberships || []).filter((m) => m.entity_id === e.id);
      const myGrants = (grants || []).filter((g) => g.entity_id === e.id && !g.revoked_at);
      const myLinks = links.filter((l) => l.entity_id === e.id);
      const myCodes = codes.filter((c) => c.entity_id === e.id);
      const partnershipRow = byEntity[e.id] || null;
      const a = analyticsByEntity[e.id] || null;
      return {
        id: e.id,
        name: e.name,
        entity_type: e.entity_type,
        official_website_url: e.official_website_url || null,
        official_domains: e.official_domains || [],
        claimed_at: e.claimed_at || null,
        verified_at: e.verified_at || null,
        verification_status: e.verification_status,
        jurisdiction: byJurisdiction[e.jurisdiction_id] || null,
        ...presentStates(e, partnershipRow),
        partnership: partnershipRow
          ? {
              id: partnershipRow.id,
              status: partnershipRow.status,
              activated_at: partnershipRow.activated_at || null,
              suspended_at: partnershipRow.suspended_at || null,
              ended_reason: partnershipRow.ended_reason || null,
              // When a partnership last changed state. 0014 keeps no separate
              // "inactivated" date: updated_at and the audit row carry it.
              updated_at: partnershipRow.updated_at || null,
            }
          : null,
        counts: {
          claims_waiting: mine.filter((m) => m.status === "pending").length,
          verified_members: mine.filter(isVerifiedMembership).length,
          closed_members: mine.filter((m) => !membershipIsLive(m)).length,
          jurisdictions_granted: myGrants.length,
          links_total: myLinks.length,
          links_live: myLinks.filter(liveNow).length,
          codes_total: myCodes.length,
          codes_live: myCodes.filter(liveNow).length,
          // Two separate numbers, because 2p lists them separately: an entry is a
          // redemption, and only an entry that actually granted the sponsored
          // entitlement is an activation.
          redemptions: a ? (a.link_redemptions || 0) + (a.code_redemptions || 0) : 0,
          sponsored_activations: a ? a.sponsored_activations || 0 : 0,
        },
      };
    })
    .filter((e) => (identity ? e.identity_state === identity : true))
    .filter((e) => (partnership ? e.partnership_state === partnership : true))
    .filter((e) => (claimsOnly ? e.counts.claims_waiting > 0 : true));

  res.status(200).json({
    items,
    schema: {
      partnership: partnershipReady,
      partnership_error: partnershipReady
        ? null
        : missingTable(partnershipQuery.error)
          ? "Migration 0014 is not applied yet."
          : partnershipQuery.error.message,
    },
  });
};

// ── gov-entity ──────────────────────────────────────────────────────────────
const govEntity = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const id = uuid(url.searchParams.get("id"));
  if (!id) return res.status(400).json({ error: "id required" });

  const { data: entity, error } = await ctx.svc.from("government_entities").select("*").eq("id", id).maybeSingle();
  if (error) return govFail(res, error, "0012");
  if (!entity) return res.status(404).json({ error: "government entity not found" });

  const { data: membershipRows, error: mErr } = await ctx.svc
    .from("government_memberships")
    .select("*")
    .eq("entity_id", id)
    .order("requested_at", { ascending: false });
  if (mErr) return govFail(res, mErr, "0012");
  const memberships = await withPeople(ctx, membershipRows || []);

  const { data: grantRows } = await ctx.svc
    .from("government_jurisdiction_grants")
    .select("*")
    .eq("entity_id", id)
    .order("granted_at", { ascending: false });

  const jIds = [...new Set([entity.jurisdiction_id, ...(grantRows || []).map((g) => g.jurisdiction_id)].filter(Boolean))];
  const { data: jRows } = jIds.length ? await ctx.svc.from("jurisdictions").select("*").in("id", jIds) : { data: [] };
  const byJurisdiction = Object.fromEntries((jRows || []).map((j) => [j.id, govJurisdiction(j)]));

  // ── the identity history (2s D4) ─────────────────────────────────────────
  // Who verified this entity, when, who took it back and why. Read from 0020's
  // append-only table rather than reconstructed from the entity row, because the
  // entity row CANNOT hold it: 0012's guard clears verified_at the moment the
  // status leaves verified, so after a withdrawal the row itself no longer knows
  // the entity was ever verified. This is the only surface that does.
  const historyQuery = await ctx.svc
    .from("government_identity_events")
    .select("*")
    .eq("entity_id", id)
    .order("id", { ascending: false });
  const historyReady = !historyQuery.error;
  const historyRows = historyReady ? historyQuery.data || [] : [];
  const actorIds = [
    ...new Set(historyRows.flatMap((h) => [h.actor_app_user_id, h.prior_verified_by_app_user_id]).filter(Boolean)),
  ];
  const { data: actorRows } = actorIds.length ? await ctx.svc.from("users").select("id, email").in("id", actorIds) : { data: [] };
  const actorEmail = Object.fromEntries((actorRows || []).map((u) => [u.id, u.email]));

  const partnershipQuery = await ctx.svc.from("government_partnerships").select("*").eq("entity_id", id).maybeSingle();
  const partnershipReady = !partnershipQuery.error;
  const partnershipRow = partnershipReady ? partnershipQuery.data : null;

  let links = [];
  let codes = [];
  let analytics = null;
  if (partnershipReady && partnershipRow) {
    const linkQuery = await ctx.svc.from("partner_access_links").select(ACCESS_COLUMNS).eq("entity_id", id).order("created_at", { ascending: false });
    const codeQuery = await ctx.svc.from("partner_access_codes").select(ACCESS_COLUMNS).eq("entity_id", id).order("created_at", { ascending: false });
    links = (linkQuery.data || []).map(presentAccessRow);
    codes = (codeQuery.data || []).map(presentAccessRow);
    const { data: a } = await ctx.svc.from("partner_analytics").select("*").eq("entity_id", id).maybeSingle();
    analytics = a || null;
  }

  const identity_state = identityState(entity);
  res.status(200).json({
    entity: {
      id: entity.id,
      name: entity.name,
      entity_type: entity.entity_type,
      official_website_url: entity.official_website_url || null,
      official_domains: entity.official_domains || [],
      source_url: entity.source_url || null,
      claimed_at: entity.claimed_at || null,
      claim_note: entity.claim_note || null,
      verification_status: entity.verification_status,
      verified_at: entity.verified_at || null,
      verification_note: entity.verification_note || null,
      jurisdiction: byJurisdiction[entity.jurisdiction_id] || null,
      ...presentStates(entity, partnershipRow),
    },
    // The claims. A claim is a PENDING membership: a person said they represent
    // this entity and nothing has been confirmed.
    memberships: memberships.map((m) => ({
      id: m.id,
      membership_role: m.membership_role,
      status: m.status,
      requested_at: m.requested_at,
      request_note: m.request_note || null,
      verified_at: m.verified_at || null,
      revoked_at: m.revoked_at || null,
      revoked_reason: m.revoked_reason || null,
      person: m.person,
      // Evidence, not verification. A work email on an official domain is a
      // reason to look; possession of an email address was never sufficient (2o).
      work_email_matches_official_domain: Boolean(
        m.person?.work_email && (entity.official_domains || []).some((d) => String(m.person.work_email).toLowerCase().endsWith(`@${String(d).toLowerCase()}`)),
      ),
    })),
    // The only source of authority: one row, one jurisdiction, matched by
    // equality, with the reason it was granted.
    grants: (grantRows || []).map((g) => ({
      id: g.id,
      jurisdiction: byJurisdiction[g.jurisdiction_id] || null,
      may_submit: g.may_submit,
      grant_basis: g.grant_basis,
      granted_at: g.granted_at,
      revoked_at: g.revoked_at || null,
      revoked_reason: g.revoked_reason || null,
    })),
    partnership: partnershipRow
      ? {
          id: partnershipRow.id,
          status: partnershipRow.status,
          state: partnershipState(partnershipRow),
          requested_at: partnershipRow.requested_at || null,
          activated_at: partnershipRow.activated_at || null,
          suspended_at: partnershipRow.suspended_at || null,
          suspended_reason: partnershipRow.suspended_reason || null,
          // 0014's columns for a partnership that ENDED. There is no
          // inactivated_at: "when it changed" is updated_at and the audit row.
          ended_reason: partnershipRow.ended_reason || null,
          updated_at: partnershipRow.updated_at || null,
          admin_note: partnershipRow.admin_note || null,
        }
      : null,
    // What activation would need. The console refuses to offer it unless this
    // says it can; the endpoint refuses it; the database constraint decides.
    partnership_gate: {
      identity_verified: identity_state === "identity_verified",
      may_activate: identity_state === "identity_verified" && partnershipState(partnershipRow) !== "active",
      reason:
        identity_state === "identity_verified"
          ? null
          : "A partnership cannot activate without a Verified Government Account. Verify a representative's authority first. This is a database constraint, not an interface rule, and verifying identity never activates a partnership by itself.",
    },
    // Every change of identity state, newest first, each with who made it, when,
    // why, and the verification it ended. A null actor means ADUAtlas does not
    // know who made that transition, which is shown as unknown and never as
    // nobody (2b).
    identity_history: historyRows.map((h) => ({
      id: h.id,
      occurred_at: h.occurred_at,
      from_status: h.from_status,
      from_label: STORED_IDENTITY_LABELS[h.from_status] || h.from_status,
      to_status: h.to_status,
      to_label: STORED_IDENTITY_LABELS[h.to_status] || h.to_status,
      actor_app_user_id: h.actor_app_user_id || null,
      actor_email: h.actor_app_user_id ? actorEmail[h.actor_app_user_id] || null : null,
      actor_api_role: h.actor_api_role || null,
      reason: h.reason || null,
      // The verification this event ended, kept because the entity row cannot.
      prior_verified_at: h.prior_verified_at || null,
      prior_verified_by_email: h.prior_verified_by_app_user_id ? actorEmail[h.prior_verified_by_app_user_id] || null : null,
      prior_verification_note: h.prior_verification_note || null,
    })),
    access: { links, codes },
    // Aggregate, from partner_analytics. No resident is named, and link visits,
    // redemptions and sponsored activations stay three separate numbers.
    analytics: analytics
      ? {
          active_links: analytics.active_links || 0,
          active_codes: analytics.active_codes || 0,
          link_visits: analytics.link_visits || 0,
          link_redemptions: analytics.link_redemptions || 0,
          code_redemptions: analytics.code_redemptions || 0,
          sponsored_activations: analytics.sponsored_activations || 0,
          course_starts: analytics.course_starts || 0,
          course_completions: analytics.course_completions || 0,
          // False means "not measured yet", which is a different fact from
          // "nobody started" and must never be printed as one (2b).
          course_progress_instrumented: analytics.course_progress_instrumented === true,
        }
      : null,
    schema: {
      partnership: partnershipReady,
      partnership_error: partnershipReady
        ? null
        : missingTable(partnershipQuery.error)
          ? "Migration 0014 is not applied yet."
          : partnershipQuery.error.message,
      // Reported separately, so the withdraw control stays closed rather than
      // pretending to record a reason nowhere.
      identity_history: historyReady,
      identity_history_error: historyReady
        ? null
        : missingTable(historyQuery.error)
          ? "Migration 0020 is not applied yet."
          : historyQuery.error.message,
    },
  });
};

// ── gov-jurisdictions: the picker for an explicit grant ─────────────────────
// A search, deliberately. There is no "and everything beneath it" here, because
// there is no such grant.
const govJurisdictions = async (req, res, ctx) => {
  const url = new URL(req.url, "http://localhost");
  const q = (url.searchParams.get("q") || "").trim();
  const state = url.searchParams.get("state");
  if (!q && !state) return res.status(400).json({ error: "search by name or pass a state code" });
  let query = ctx.svc.from("jurisdictions").select("*").limit(100).order("path");
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (state) {
    const code = stateCode(state);
    if (!code) return res.status(400).json({ error: "state must be a two-letter state code" });
    query = query.eq("state_code", code);
  }
  const { data, error } = await query;
  if (error) return govFail(res, error, "0012");
  res.status(200).json({ items: (data || []).map(govJurisdiction) });
};

// ── identity: verify, reject, revoke ────────────────────────────────────────
// Verification is a deliberate ADUAtlas act with a written record of what was
// checked, through the service-role-only RPC that also writes the audit row. It
// moves IDENTITY. It grants authority over no jurisdiction and it creates no
// partnership, and there is no code path from here to either.
const govIdentityVerify = async (req, res, ctx) => {
  const body = readBody(req);
  const membership_id = uuid(body.membership_id);
  if (!membership_id) return res.status(400).json({ error: "membership_id required" });
  const checked = text(body.checked, 2000);
  if (!checked) return res.status(400).json({ error: "record what you checked before verifying: the official domain, the staff directory, the phone call, the letter" });
  const note = [checked, text(body.note, 2000)].filter(Boolean).join("\n");

  const { data, error } = await ctx.svc.rpc("admin_verify_government_membership", {
    p_membership_id: membership_id,
    p_actor_app_user_id: ctx.row.id,
    p_note: note,
  });
  if (error) return govFail(res, error, "0012");
  res.status(200).json({
    ok: true,
    result: data,
    note: "Identity verified. It grants authority over no jurisdiction and it does not create or activate a partnership. Both of those are separate, deliberate acts.",
  });
};

// Rejecting a claim. 0012 has no admin_* RPC for a rejection, so this is the one
// service-role table write in this section; the audit triggers on both tables
// record it, and nothing about it is reachable without requireAdmin above.
//
// Three deliberate limits, none of them invented to be clever:
//   • A REJECTION refuses a CLAIM. A person whose authority is already verified
//     is REVOKED, not rejected: 0012's own words are "rejected = Amy refused the
//     claim", and putting two different events under one word would lose one.
//   • The person is rejected. The INSTITUTION is marked rejected only when no
//     other live verified representative remains AND the entity is not itself
//     already verified. One refused claim is not an institution losing its
//     verification, and nothing here un-verifies an entity as a side effect.
//   • The entity RECORD is never removed. ADUAtlas compiled it from public
//     sources and it is useful with no account attached, which is the point.
const govIdentityReject = async (req, res, ctx) => {
  const body = readBody(req);
  const membership_id = uuid(body.membership_id);
  if (!membership_id) return res.status(400).json({ error: "membership_id required" });
  const reason = text(body.reason, 2000);
  if (!reason) return res.status(400).json({ error: "a rejected claim carries the reason it was rejected" });

  const { data: m, error: mErr } = await ctx.svc.from("government_memberships").select("*").eq("id", membership_id).maybeSingle();
  if (mErr) return govFail(res, mErr, "0012");
  if (!m) return res.status(404).json({ error: "membership not found" });
  if (m.status === "rejected") return res.status(409).json({ error: "that claim is already rejected" });
  if (m.revoked_at || m.status === "revoked") {
    return res.status(409).json({ error: "that membership is revoked. A revoked membership is not rejected; the person claims again." });
  }
  if (m.status === "verified") {
    return res.status(409).json({
      error:
        "this person's authority is already verified. A verified representative is REVOKED, with a reason, rather than rejected: rejecting refuses a claim and revoking ends an authority, and they are two different events.",
    });
  }

  const { data: entity, error: eErr } = await ctx.svc.from("government_entities").select("*").eq("id", m.entity_id).maybeSingle();
  if (eErr) return govFail(res, eErr, "0012");
  if (!entity) return res.status(404).json({ error: "government entity not found" });

  const { data: siblings } = await ctx.svc.from("government_memberships").select("id, status, verified_at, revoked_at").eq("entity_id", m.entity_id);
  const otherVerified = (siblings || []).filter((s) => s.id !== membership_id).some(isVerifiedMembership);
  const markEntity = !otherVerified && entity.verification_status !== "verified";

  const { error: upErr } = await ctx.svc.from("government_memberships").update({ status: "rejected", verified_at: null }).eq("id", membership_id);
  if (upErr) return govFail(res, upErr, "0012");

  if (markEntity) {
    const { error: entityErr } = await ctx.svc
      .from("government_entities")
      .update({ verification_status: "rejected", verification_note: reason })
      .eq("id", m.entity_id);
    if (entityErr) return govFail(res, entityErr, "0012");
  }

  const { data: after } = await ctx.svc.from("government_entities").select("*").eq("id", m.entity_id).maybeSingle();
  // Read back rather than assumed: 0014 suspends an active partnership whenever
  // identity leaves verified, and the console must report what the database
  // actually did rather than what this endpoint asked for.
  const partnershipAfter = await ctx.svc.from("government_partnerships").select("id, status").eq("entity_id", m.entity_id).maybeSingle();
  res.status(200).json({
    ok: true,
    membership_id,
    entity_identity_state: identityState(after),
    entity_marked_rejected: markEntity,
    partnership_state: partnershipAfter.error ? null : partnershipState(partnershipAfter.data),
    note: markEntity
      ? "The claim is refused and kept, with its reason. The entity record stays: ADUAtlas compiled it from public sources and it is useful with no account attached."
      : "The claim is refused and kept. The entity's own identity state is unchanged, because one refused claim is not the institution losing its verification.",
  });
};

// ── identity: WITHDRAW a verification (2s D4, D5) ────────────────────────────
// Three things this is NOT, because each of them already has its own endpoint and
// collapsing any two would lose a fact the product needs to be able to state:
//
//   NOT gov-identity-reject.        A rejection refuses a CLAIM at the door. This
//                                   takes back a verification ADUAtlas granted.
//                                   0012's own words, and 2p (i) keeps them as two
//                                   separate identity states.
//   NOT gov-membership-revoke.      That ends one PERSON's authority and leaves the
//                                   institution verified, which is the whole reason
//                                   0012 models membership separately. Withdrawing
//                                   suspends the INSTITUTION and leaves the people
//                                   where they are.
//   NOT gov-partnership-suspend.    That moves the PARTNERSHIP axis and says nothing
//                                   about whether ADUAtlas still believes this
//                                   account belongs to the government it names.
//
// THE REASON IS REQUIRED and it is not a formality: it is the WHY half of 2s (D4),
// it is stored on the appended identity event, and a withdrawal nobody can explain
// is a withdrawal nobody can lift. WHO comes from ctx.row.id, as in every other
// admin_* call here.
//
// WHAT IT DOES TO THE PARTNERSHIP IS NOT DECIDED HERE. The RPC performs one update
// on one identity column and 0014's government_entities_partnership_cascade
// suspends an active partnership in the same statement, so both axes are READ BACK
// below rather than assumed. The console reports what the database did.
//
// AND IT DOES NOTHING TO A RESIDENT. Withdrawal stops the future and preserves the
// past (2s D5): no new links, no new codes, no new activations, and not one
// homeowner loses the Golden access a partnership already gave them.
const govIdentityWithdraw = async (req, res, ctx) => {
  const body = readBody(req);
  const entity_id = uuid(body.entity_id);
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });
  const reason = text(body.reason, 2000);
  if (!reason) {
    return res.status(400).json({
      error:
        "a withdrawn verification carries the reason it was withdrawn. Write what changed about this entity's authority: it goes on the permanent identity record and it is what a later reviewer, or a later reinstatement, will be reading.",
    });
  }

  const { data: entity, error: eErr } = await ctx.svc.from("government_entities").select("*").eq("id", entity_id).maybeSingle();
  if (eErr) return govFail(res, eErr, "0012");
  if (!entity) return res.status(404).json({ error: "government entity not found" });
  if (identityState(entity) !== "identity_verified") {
    return res.status(409).json({
      error: `this entity's identity state is "${IDENTITY_STATE_LABELS[identityState(entity)]}". Only a verification that EXISTS is withdrawn: a claim that was never verified is rejected, and an already suspended entity has nothing left to take back.`,
      identity_state: identityState(entity),
    });
  }

  const { data, error } = await ctx.svc.rpc("admin_withdraw_government_verification", {
    p_entity_id: entity_id,
    p_actor_app_user_id: ctx.row.id,
    p_reason: reason,
  });
  if (error) return govFail(res, error, "0020");

  const { data: after } = await ctx.svc.from("government_entities").select("*").eq("id", entity_id).maybeSingle();
  const partnershipAfter = await ctx.svc.from("government_partnerships").select("id, status").eq("entity_id", entity_id).maybeSingle();
  const partnershipRow = partnershipAfter.error ? null : partnershipAfter.data;

  res.status(200).json({
    ok: true,
    result: data,
    entity_id,
    // TWO states, as two fields, from the one helper that computes each of them in
    // one place. There is no combined field in this payload and there will not be
    // one: they are allowed to disagree and a caller that wanted one pill would
    // have to invent it in the open.
    ...presentStates(after, partnershipRow),
    partnership_state_read: partnershipAfter.error ? null : partnershipState(partnershipRow),
    note:
      "Verification withdrawn. The badge is gone, this entity can issue no new resident links or codes, and no new sponsored activation can happen through it from the next request. Residents already sponsored keep their Golden access: they did nothing wrong and the sponsorship was granted once. Verifying a representative again restores the identity and does NOT bring the partnership back; reactivating is a separate, deliberate act.",
  });
};

const govMembershipRevoke = async (req, res, ctx) => {
  const body = readBody(req);
  const membership_id = uuid(body.membership_id);
  if (!membership_id) return res.status(400).json({ error: "membership_id required" });
  const reason = text(body.reason, 2000);
  if (!reason) return res.status(400).json({ error: "a revocation carries its reason" });
  const { data, error } = await ctx.svc.rpc("admin_revoke_government_membership", {
    p_membership_id: membership_id,
    p_actor_app_user_id: ctx.row.id,
    p_reason: reason,
  });
  if (error) return govFail(res, error, "0012");
  res.status(200).json({
    ok: true,
    result: data,
    note: "Revocation takes effect on the next statement. The membership and its history are kept, and the entity is untouched: a person leaving is not an institution leaving.",
  });
};

// ── explicit authority ──────────────────────────────────────────────────────
// One entity, one jurisdiction, one written reason. There is no bulk form and no
// "and everything beneath it", because granting a state authority over its cities
// means deciding that city by city.
const govAuthorityGrant = async (req, res, ctx) => {
  const body = readBody(req);
  const entity_id = uuid(body.entity_id);
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });
  const jurisdiction_id = uuid(body.jurisdiction_id);
  if (!jurisdiction_id) return res.status(400).json({ error: "jurisdiction_id required" });
  const grant_basis = text(body.grant_basis, 2000);
  if (!grant_basis) return res.status(400).json({ error: "authority nobody can explain is authority nobody can audit: write why this entity may speak for this record" });
  const may_submit = body.may_submit !== false;

  const { data, error } = await ctx.svc.rpc("admin_grant_jurisdiction_authority", {
    p_entity_id: entity_id,
    p_jurisdiction_id: jurisdiction_id,
    p_actor_app_user_id: ctx.row.id,
    p_grant_basis: grant_basis,
    p_may_submit: may_submit,
  });
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "this entity already holds a live grant on that jurisdiction record" });
    return govFail(res, error, "0012");
  }
  res.status(200).json({
    ok: true,
    grant_id: data,
    note: "One record, granted explicitly. Nothing beneath it is included, and the entity's own seat is not authority either.",
  });
};

const govAuthorityRevoke = async (req, res, ctx) => {
  const body = readBody(req);
  const grant_id = uuid(body.grant_id);
  if (!grant_id) return res.status(400).json({ error: "grant_id required" });
  const reason = text(body.reason, 2000);
  if (!reason) return res.status(400).json({ error: "a revoked grant carries its reason" });
  const { data, error } = await ctx.svc.rpc("admin_revoke_jurisdiction_authority", {
    p_grant_id: grant_id,
    p_actor_app_user_id: ctx.row.id,
    p_reason: reason,
  });
  if (error) return govFail(res, error, "0012");
  res.status(200).json({ ok: true, result: data });
};

// ── the partnership ─────────────────────────────────────────────────────────
// One RPC carries all three verbs, because 0014 made the status the switch and a
// second way to write it would be a second rule. Amy's three doors onto it are
// separate endpoints so each one can ask for what it needs: activation asks for
// nothing, suspension insists on a reason.
// Answers the response itself on a failure and returns null, so a caller can
// only continue when the write actually happened. It does not hand back the
// response object: res.status().json() is truthy in Node, and a caller testing
// that for success would send a second body onto a finished response.
const setPartnershipStatus = async (res, ctx, entity_id, status, note) => {
  if (!PARTNERSHIP_WRITABLE.includes(status)) {
    res.status(400).json({ error: `a partnership is ${PARTNERSHIP_WRITABLE.join(", ")}; "none" is the absence of a partnership and is never written` });
    return null;
  }
  const { data, error } = await ctx.svc.rpc("admin_set_partnership_status", {
    p_entity_id: entity_id,
    p_status: status,
    p_actor_app_user_id: ctx.row.id,
    p_note: note || null,
  });
  if (error) {
    // 23514 is the database refusing to activate without verified identity, and
    // 22023 is an unknown status. Both are passed through in the database's own
    // words: the database is the boundary and its message says why.
    if (error.code === "23514" || error.code === "22023") res.status(409).json({ error: error.message });
    else govFail(res, error, "0014");
    return null;
  }
  return { data };
};

// Refused unless identity is verified, and the refusal says where the real
// boundary is. Nothing calls this on its own: verifying an identity does not
// reach this code path, and somebody has to ask for a partnership.
const govPartnershipActivate = async (req, res, ctx) => {
  const body = readBody(req);
  const entity_id = uuid(body.entity_id);
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });

  const { data: entity, error } = await ctx.svc.from("government_entities").select("*").eq("id", entity_id).maybeSingle();
  if (error) return govFail(res, error, "0012");
  if (!entity) return res.status(404).json({ error: "government entity not found" });
  if (identityState(entity) !== "identity_verified") {
    return res.status(409).json({
      error: `this entity's identity is "${IDENTITY_STATE_LABELS[identityState(entity)]}". A partnership never activates without a Verified Government Account. Verify a representative's authority first.`,
      identity_state: identityState(entity),
    });
  }

  const out = await setPartnershipStatus(res, ctx, entity_id, "active", text(body.note, 2000));
  if (!out) return; // setPartnershipStatus has already answered
  res.status(200).json({
    ok: true,
    result: out.data,
    partnership_state: "active",
    identity_state: identityState(entity),
    note: "Active. The sponsored benefit is the $79 Golden educational entitlement and nothing else: Platinum, Concierge and feasibility studies are unchanged, and a sponsored homeowner keeps a normal paid upgrade path at the published price.",
  });
};

// Suspension stops NEW sponsored activations. It does not touch a resident who
// already entered: an account somebody is using is not collateral, and the
// attribution ledger has no delete path for any role.
const govPartnershipSuspend = async (req, res, ctx) => {
  const body = readBody(req);
  const entity_id = uuid(body.entity_id);
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });
  const reason = text(body.reason, 2000);
  if (!reason) return res.status(400).json({ error: "a suspension carries its reason" });

  const existing = await ctx.svc.from("government_partnerships").select("id, status").eq("entity_id", entity_id).maybeSingle();
  if (existing.error) return govFail(res, existing.error, "0014");
  if (!existing.data) return res.status(404).json({ error: "this entity has no partnership to suspend" });

  const out = await setPartnershipStatus(res, ctx, entity_id, "suspended", reason);
  if (!out) return; // setPartnershipStatus has already answered
  res.status(200).json({
    ok: true,
    result: out.data,
    partnership_state: "suspended",
    note: "Suspended. New sponsored activations are refused from the next request, and every link and code this partner holds grants nothing while it stands. Residents who already entered keep their accounts.",
  });
};

// Reactivating asks the same question activation does: is the identity still
// verified? A suspension that outlived the verification behind it must never come
// back on its own, which is why this goes through the same guard rather than
// simply restoring a previous status.
const govPartnershipReactivate = async (req, res, ctx) => {
  const body = readBody(req);
  const entity_id = uuid(body.entity_id);
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });
  const existing = await ctx.svc.from("government_partnerships").select("id, status").eq("entity_id", entity_id).maybeSingle();
  if (existing.error) return govFail(res, existing.error, "0014");
  if (!existing.data) return res.status(404).json({ error: "this entity has no partnership to reactivate" });
  if (partnershipState(existing.data) === "active") return res.status(409).json({ error: "this partnership is already active" });
  return govPartnershipActivate(req, res, ctx);
};

// One link or one code, turned off or back on: the finer-grained half of
// controlling whether sponsored resident access is live. The partnership status
// is the master switch, and a single leaked link can be closed without closing
// the partnership. Both go through the service-role-only RPC, which keeps
// is_active and deactivated_at in step and writes the audit row.
const govAccessToggle = async (req, res, ctx) => {
  const body = readBody(req);
  const kind = oneOf(body.kind, ["link", "code"]);
  if (!kind) return res.status(400).json({ error: "kind must be link or code" });
  const id = uuid(body.id);
  if (!id) return res.status(400).json({ error: "id required" });
  if (typeof body.active !== "boolean") return res.status(400).json({ error: "active must be true or false" });
  const reason = text(body.reason, 2000);

  const fn = kind === "link" ? "admin_set_partner_link_active" : "admin_set_partner_code_active";
  const args = kind === "link"
    ? { p_link_id: id, p_active: body.active, p_actor_app_user_id: ctx.row.id, p_reason: reason }
    : { p_code_id: id, p_active: body.active, p_actor_app_user_id: ctx.row.id, p_reason: reason };
  const { data, error } = await ctx.svc.rpc(fn, args);
  if (error) return govFail(res, error, "0014");

  const table = kind === "link" ? "partner_access_links" : "partner_access_codes";
  const { data: row } = await ctx.svc.from(table).select(ACCESS_COLUMNS).eq("id", id).maybeSingle();
  res.status(200).json({
    ok: true,
    kind,
    result: data,
    [kind]: row ? presentAccessRow(row) : null,
    note: body.active
      ? "Live again. It grants the sponsored Golden entitlement and nothing else, and only while the partnership is active."
      : "Disabled. It grants nothing from the next request. Residents who already entered through it keep their accounts.",
  });
};

const ROUTES = {
  meta: { GET: meta },
  jurisdictions: { GET: jurisdictions },
  jurisdiction: { GET: jurisdiction },
  "jurisdiction-save": { POST: jurisdictionSave },
  "provision-save": { POST: provisionSave },
  "provision-retire": { POST: provisionRetire },
  "resource-save": { POST: resourceSave },
  "resource-retire": { POST: resourceRetire },
  entities: { GET: entities },
  "entity-save": { POST: entitySave },
  "entity-invite": { POST: entityInvite },
  "membership-verify": { POST: membershipVerify },
  "membership-revoke": { POST: membershipRevoke },
  submissions: { GET: submissions },
  submission: { GET: submission },
  "submission-publish": { POST: submissionPublish },
  "submission-decline": { POST: submissionDecline },
  versions: { GET: versions },

  // Government claims, explicit authority and education partnerships (2p).
  // Registered here so the Vercel function count does not move: the admin
  // catch-all is one function and this is one more action on it.
  "gov-meta": { GET: govMeta },
  "gov-entities": { GET: govEntities },
  "gov-entity": { GET: govEntity },
  "gov-jurisdictions": { GET: govJurisdictions },
  "gov-identity-verify": { POST: govIdentityVerify },
  "gov-identity-reject": { POST: govIdentityReject },
  "gov-identity-withdraw": { POST: govIdentityWithdraw },
  "gov-membership-revoke": { POST: govMembershipRevoke },
  "gov-authority-grant": { POST: govAuthorityGrant },
  "gov-authority-revoke": { POST: govAuthorityRevoke },
  "gov-partnership-activate": { POST: govPartnershipActivate },
  "gov-partnership-suspend": { POST: govPartnershipSuspend },
  "gov-partnership-reactivate": { POST: govPartnershipReactivate },
  "gov-access-toggle": { POST: govAccessToggle },
};

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const action = (req.url || "").split("?")[0].split("/").filter(Boolean).pop();
  const route = ROUTES[action];
  if (!route) return res.status(404).json({ error: "not found" });
  const fn = route[req.method];
  if (!fn) return res.status(405).json({ error: `${req.method} not allowed` });
  await fn(req, res, ctx);
}
