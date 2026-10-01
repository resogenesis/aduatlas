// ADU Rules and Resources: the nationwide regulatory database (decision 2l) and
// the government participation layer (decision 2m).
//
// Schema: supabase/migrations/0012_rules_and_resources.sql. Read its header before
// changing anything here; this file is the client half of the same contract.
//
// FIVE THINGS THIS MODULE EXISTS TO KEEP STRAIGHT. Every one of them is a way a
// product like this misleads people, and every one of them is a function below
// rather than a rule a page is trusted to remember.
//
// 1. THREE FIELD STATES, NEVER BLURRED. Verified from source, the source did not
//    state it, and not yet researched are three different sentences on a page.
//    provisionValue() returns which one applies and never invents a value for the
//    other two. A page must not print a dash and let a homeowner guess.
//
// 2. FOUR DATES, NEVER MERGED. "Effective January 2026" is when a law took effect.
//    "Source checked January 2025" is when ADUAtlas last looked. They mean opposite
//    things. datesFor() returns them as separate labelled items, each with its own
//    wording, and there is deliberately no lastVerified() helper to reach for.
//
// 3. TWO ATTRIBUTIONS, NEVER COLLAPSED. "Source: Official government website" says
//    where a rule was read. "Provided by City of Phoenix" says a verified
//    government account supplied it. A rule ADUAtlas read off phoenix.gov has the
//    first and not the second, because using a government's website as a source
//    does not mean that government takes part in ADUAtlas. attributionsFor()
//    returns separate items and never one merged line. WHO SUPPLIED a row is its
//    own fact (supplied_by, migration 0022): "Compiled by ADUAtlas" is said only
//    for ADUAtlas research, and a government row whose account is no longer
//    verified says exactly that, never "ADUAtlas research" (decision 2t).
//
// 4. THREE CONCEPTS KEPT APART. The regulatory database says what governments
//    currently publish. Property feasibility says what appears to apply to one
//    parcel. A permit determination is a jurisdiction approving a real project.
//    FEASIBILITY_BOUNDARY is the sentence that says so, and a rules page shows it.
//
// 5. WHO CHECKED IT IS NOT WHAT WE KNOW. verification_status (source_checked,
//    unverified, disputed) is a separate axis from the field state. A rule can be
//    verified_from_source and still unchecked by ADUAtlas, or disputed by another
//    official source. verificationStatusOf() and RECORD_VERIFICATION_COPY give a
//    page the words for each, so no page prints a check mark ADUAtlas did not earn.
//
// The badge for a government account is "Verified Government Account" and it means
// identity: ADUAtlas confirmed the person is authorised to represent the entity. It
// never means the information is legally correct, and it is never the builder badge
// "Verified on ADUAtlas" in src/lib/builders.js. Two badges, two meanings, and
// nothing in this file may borrow the other one's words.
//
// Government accounts are free. There is no billing in this module and none in the
// schema behind it.
//
// CLAIMING A GOVERNMENT IDENTITY IS A HIGHER BAR THAN CREATING AN ACCOUNT (2o,
// migration 0015). The work-email domain must match one of the entity's recorded
// official government domains and the database refuses the claim otherwise, with
// one identical refusal for every failure. Enforced there and nowhere else: see
// GOVERNMENT_CLAIM_AUTHORITY_COPY and claimGovernmentEntity below for what this
// module is and is not allowed to do about it.
//
// WHAT AN ANONYMOUS VISITOR MAY READ HERE is the published regulatory surface and
// nothing else: jurisdictions_public, regulatory_provisions_public,
// government_resources_public, the two coverage views, the published provision
// history and government_entities_public. Enumerating those is the point of 2l (a
// homeowner searches their state and jurisdiction, state pages organise the
// jurisdictions beneath them, and coverage is transparent including the gaps), and
// the official phone, email and contact person on a government resource are the
// government's OWN published contacts, which 2m makes a first-class resource. That
// is the opposite case from a builder's contact details under 2d, and the two are
// not reasoned about together. Nothing in this module reaches the entity's private
// row: official_domains, source_url, claim notes and verification notes are in no
// public view and no call below asks for them.
import { supabase, supabaseEnabled } from "./supabase";

const DISABLED = { ok: false, error: "supabase-disabled" };
const LOGGED_OUT = { ok: false, error: "logged-out" };

// ── the three field states ───────────────────────────────────────────────────
export const FIELD_STATE = {
  VERIFIED: "verified_from_source",
  SILENT: "source_did_not_state",
  UNRESEARCHED: "not_yet_researched",
};

// What each state is CALLED. Short enough for a chip beside a value.
export const FIELD_STATE_LABELS = {
  [FIELD_STATE.VERIFIED]: "Verified from source",
  [FIELD_STATE.SILENT]: "Source did not state",
  [FIELD_STATE.UNRESEARCHED]: "Not yet researched",
};

// What each state MEANS, in the words a homeowner needs. The second and third are
// different facts and the page must not let one stand in for the other: one says a
// government is silent, the other says ADUAtlas has not looked.
export const FIELD_STATE_SENTENCES = {
  [FIELD_STATE.VERIFIED]: "Read from the jurisdiction's own published source, linked below.",
  [FIELD_STATE.SILENT]:
    "We read the jurisdiction's published source and it does not address this. Ask the planning or zoning department.",
  [FIELD_STATE.UNRESEARCHED]:
    "We have not researched this yet for this jurisdiction. Check with the local planning or zoning department.",
};

// The sentence for a jurisdiction with nothing verified, from decision 2l. One
// place, so no page writes a friendlier version that implies more than we have.
export const UNRESEARCHED_JURISDICTION_COPY =
  "We haven't verified detailed ADU requirements for this jurisdiction yet. Check with your local planning or zoning department for current requirements.";

// The boundary that keeps the regulatory database, property feasibility and a
// permit determination apart. A rules page shows it; nothing softens it.
export const FEASIBILITY_BOUNDARY =
  "These are the rules the jurisdiction publishes. They are not a decision about your property. Lot lines, zoning overlays, easements, utilities and local interpretation all affect what can actually be built, and only the jurisdiction can approve a permit.";

// ── the four dates ──────────────────────────────────────────────────────────
// The column each date lives in, by role. A page reads a date from ITS column
// and nowhere else: no fallback to another kind of date, because "record updated"
// read off updated_at or "source checked" read off a verification timestamp is a
// different fact wearing the label (DEF-05).
export const PROVISION_DATE_KEYS = {
  effective: "effective_date",
  checked: "source_checked_date",
  recordUpdated: "record_published_at",
  superseded: "superseded_or_repealed_date",
};

// Four keys, four labels, four meanings. Kept as an ordered list because the order
// a page reads them in is part of not confusing them: what the law does first, what
// we did second.
export const PROVISION_DATES = [
  {
    key: PROVISION_DATE_KEYS.effective,
    label: "Took effect",
    futureLabel: "Takes effect",
    means: "When this rule legally took effect, according to the jurisdiction.",
  },
  {
    key: PROVISION_DATE_KEYS.checked,
    label: "Source last checked by ADUAtlas",
    means: "When ADUAtlas last read the official source. It says how current our reading is, not whether the rule changed.",
  },
  {
    key: PROVISION_DATE_KEYS.recordUpdated,
    label: "ADUAtlas record last updated",
    means: "When ADUAtlas last changed this record. A correction on our side moves this date and nothing else.",
  },
  {
    key: PROVISION_DATE_KEYS.superseded,
    label: "No longer in effect",
    means: "When the jurisdiction repealed or replaced this rule. The record is kept so the previous rule can still be read.",
  },
];

// ── who checked it: the verification axis ───────────────────────────────────
// Migration 0012: source_checked = a person at ADUAtlas opened the cited source;
// unverified = recorded and not yet checked against the source; disputed =
// another authority contradicts it, and the product shows the disagreement rather
// than choosing. Separate from the field state, and never inferred from it.
export const RECORD_VERIFICATION = {
  CHECKED: "source_checked",
  UNCHECKED: "unverified",
  DISPUTED: "disputed",
};

// The row's verification status, or null when the row does not carry one. Null
// is unknown (decision 2b): a page then claims neither that ADUAtlas checked the
// row nor that it did not.
export const verificationStatusOf = (row) => {
  const v = row?.verification_status;
  return Object.values(RECORD_VERIFICATION).includes(v) ? v : null;
};

export const RECORD_VERIFICATION_COPY = {
  // A value read from the source that ADUAtlas has not checked. Replaces the
  // "Verified from source" check mark, which would claim a check.
  uncheckedValueChip: "From source, not yet checked by ADUAtlas",
  // Beside "Source did not state" when ADUAtlas has not checked that either.
  uncheckedChip: "Not yet checked by ADUAtlas",
  uncheckedSentence: "ADUAtlas has not yet checked this against the source.",
  disputedChip: "Disputed",
  disputedSentence: "Another official source disagrees with this record. ADUAtlas shows it rather than choosing between them.",
};

// The label and the line of help for the source-checked date. Only a row ADUAtlas
// checked may call it "ADUAtlas last checked the source".
export const checkedDateWording = (verification) => {
  if (verification === RECORD_VERIFICATION.CHECKED) {
    return { label: "ADUAtlas last checked the source", help: "when we last read the government page, not when the rule changed" };
  }
  if (verification === RECORD_VERIFICATION.UNCHECKED) {
    return { label: "Source read on", help: "the date given for reading the source. ADUAtlas has not checked it yet." };
  }
  return { label: "Source read on", help: "the date given for reading the source, not when the rule changed" };
};

// ── who supplied it ─────────────────────────────────────────────────────────
// regulatory_provisions.supplied_by and government_resources.supplied_by, exposed
// on both public views by migration 0022. A government row keeps saying so after
// the government's verification is withdrawn; only "Provided by <entity>" needs a
// verified entity behind it.
export const SUPPLIED_BY = {
  RESEARCH: "aduatlas_research",
  GOVERNMENT: "government_account",
};

export const ATTRIBUTION_COPY = {
  officialSource: "Source: Official government website",
  providedByDetail: "ADUAtlas verified the account that sent it. That is an identity check, not a review of the rule.",
  researchFromSourceAbove: "Compiled by ADUAtlas from the source above. It was not supplied by the government.",
  research: "ADUAtlas compiled this record. It was not supplied by the government.",
  governmentUnverified: "Supplied through a government account that is not currently verified by ADUAtlas.",
};

// ── the government participation layer ──────────────────────────────────────
export const ENTITY_STATE = { UNCLAIMED: "unclaimed", CLAIMED: "claimed", VERIFIED: "verified" };

// The badge, and the two sentences that bound it. 2m: identity, not legal
// correctness, shown with the entity name beneath it.
export const GOVERNMENT_BADGE_LABEL = "Verified Government Account";
export const GOVERNMENT_BADGE_MEANS =
  "ADUAtlas confirmed that this account is authorised to represent this government.";
export const GOVERNMENT_BADGE_DOES_NOT_MEAN =
  "It does not mean ADUAtlas checked that the information is legally correct, and it is not a review of any project.";

// What the product may say in each of the three states. The unclaimed sentence is
// the one that matters most: a record ADUAtlas compiled from public sources must
// never read as a government taking part.
export const entityStateDisclosure = (state, entityName) => {
  const name = entityName || "this government";
  if (state === ENTITY_STATE.VERIFIED) {
    return `${GOVERNMENT_BADGE_LABEL}: ${name}. ${GOVERNMENT_BADGE_MEANS} ${GOVERNMENT_BADGE_DOES_NOT_MEAN}`;
  }
  if (state === ENTITY_STATE.CLAIMED) {
    return `Someone has claimed this record for ${name}. ADUAtlas has not yet confirmed their authority to represent it, so it carries no badge.`;
  }
  return `ADUAtlas compiled this record from public government sources. ${name} has not claimed it and does not take part in ADUAtlas.`;
};

export const isVerifiedGovernmentAccount = (entity) =>
  (entity?.entity_state || ENTITY_STATE.UNCLAIMED) === ENTITY_STATE.VERIFIED;

export const MEMBERSHIP_ROLE_LABELS = {
  viewer: "Read only",
  contributor: "Can submit",
  administrator: "Can submit and manage members",
};
export const MEMBERSHIP_STATUS_LABELS = {
  pending: "Awaiting verification",
  verified: "Verified",
  revoked: "Access ended",
  rejected: "Not accepted",
};
export const SUBMISSION_STATUS_LABELS = {
  submitted: "Submitted to ADUAtlas",
  in_review: "In review",
  accepted: "Accepted",
  partially_accepted: "Partly accepted",
  rejected: "Not accepted",
  withdrawn: "Withdrawn",
};
// Said in the government portal wherever a submission is made, because a verified
// account is the one place somebody could reasonably expect publishing to be
// automatic, and it is not.
export const SUBMISSION_PROMISE =
  "ADUAtlas reviews every submission before publishing it. Being a verified government account is not a publishing right, and what you send is kept alongside what ADUAtlas publishes.";

export const SOURCE_TYPE_LABELS = {
  state_statute: "State statute",
  state_agency: "State agency",
  county_code: "County code",
  city_code: "City code",
  municipal_ordinance: "Municipal ordinance",
  planning_department: "Planning department",
  building_department: "Building department",
  official_permit_system: "Official permit system",
  other_official: "Official government source",
};
// T4-13 (RC4 rehearsal): the government portal requires a source type before it
// sends a submission, because ADUAtlas publish refuses a rule without one and the
// review drawer has no way to add it afterwards. The keys above are the nine the
// database constraint (0012) and api/admin/_regulatory.js SOURCE_TYPES accept,
// so this is the one test of "is this a source type" the portal uses.
export const isSourceType = (value) =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(SOURCE_TYPE_LABELS, value);

export const RESOURCE_TYPE_LABELS = {
  official_adu_page: "Official ADU page",
  planning_zoning_page: "Planning and zoning",
  ordinance: "Ordinance",
  permit_application: "Permit application",
  application_portal: "Application portal",
  zoning_map: "Zoning map",
  planning_department: "Planning department",
  building_department: "Building department",
  adu_contact: "ADU contact",
  adu_handbook: "ADU handbook",
  fee_schedule: "Fee schedule",
  design_standards: "Design standards",
  preapproved_plans: "Pre-approved plans",
  faq: "Questions and answers",
  other: "Other official resource",
};

export const TOPIC_CATEGORY_LABELS = {
  eligibility: "What is allowed",
  size: "Size and lot",
  siting: "Where it can go",
  parking: "Parking",
  occupancy: "Occupancy and rental",
  process: "Permits and process",
  fees: "Fees",
  other: "Other requirements",
};

export const JURISDICTION_TYPE_LABELS = {
  country: "Country",
  state: "State",
  federal_district: "District",
  territory: "Territory",
  county: "County",
  municipality: "City or town",
  tribal: "Tribal government",
  special_district: "Special district",
  other: "Local authority",
};

// ── display helpers ─────────────────────────────────────────────────────────

// The one function a page uses to decide what to print for a rule. It NEVER
// returns a value for a state that has none, and it never returns an empty string
// that a page could mistake for "no requirement".
export const provisionValue = (row) => {
  const state = row?.field_state || FIELD_STATE.UNRESEARCHED;
  if (state !== FIELD_STATE.VERIFIED) {
    return { known: false, state, label: FIELD_STATE_LABELS[state], text: null, qualifier: null };
  }
  let text = row.value_text;
  if (!text && row.value_numeric !== null && row.value_numeric !== undefined) {
    const n = Number(row.value_numeric);
    text = row.value_unit ? `${formatNumber(n)} ${row.value_unit}` : formatNumber(n);
  }
  if (!text && row.value_boolean !== null && row.value_boolean !== undefined) {
    text = row.value_boolean ? "Yes" : "No";
  }
  // A verified row with nothing to print would be a database bug, and printing a
  // blank as an answer is what 2b forbids, so it fails closed to unknown.
  if (!text) {
    return {
      known: false,
      state: FIELD_STATE.UNRESEARCHED,
      label: FIELD_STATE_LABELS[FIELD_STATE.UNRESEARCHED],
      text: null,
      qualifier: null,
    };
  }
  return { known: true, state, label: FIELD_STATE_LABELS[state], text, qualifier: row.value_qualifier || null };
};

const formatNumber = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : String(n));

// The provenance statements for a rule or a resource, as SEPARATE items. There is
// no branch in this function that can return one merged line, because merging
// them is the misrepresentation. Everything is read from the public view's own
// columns, never recomputed from a host name or an entity record:
//
//   kind "source"                  source_is_official_government is true
//   kind "participation"           provided_by_entity_name is set: a verified
//                                  government account supplied it
//   kind "government_unverified"   supplied_by = government_account with no
//                                  verified entity behind it now
//   kind "research"                supplied_by = aduatlas_research
//
// At most one of the last three. When the row does not say who supplied it, none
// of them is returned: unknown is left unsaid, never filled in as ADUAtlas
// research. `sourceAbove` says the caller shows the source link above the
// statement, which is what lets "from the source above" be true.
export const attributionsFor = (row, { sourceAbove = false } = {}) => {
  const out = [];
  if (row?.source_is_official_government === true) {
    out.push({
      kind: "source",
      label: ATTRIBUTION_COPY.officialSource,
      detail: row.source_document_title || SOURCE_TYPE_LABELS[row.source_type] || null,
      url: row.source_url || null,
    });
  }
  if (row?.provided_by_entity_name) {
    out.push({
      kind: "participation",
      label: `Provided by ${row.provided_by_entity_name}`,
      detail: ATTRIBUTION_COPY.providedByDetail,
      entityId: row.provided_by_entity_id || null,
      url: null,
    });
  } else if (row?.supplied_by === SUPPLIED_BY.GOVERNMENT) {
    out.push({ kind: "government_unverified", label: ATTRIBUTION_COPY.governmentUnverified, detail: null, url: null });
  } else if (row?.supplied_by === SUPPLIED_BY.RESEARCH) {
    out.push({
      kind: "research",
      label: sourceAbove && row.source_url ? ATTRIBUTION_COPY.researchFromSourceAbove : ATTRIBUTION_COPY.research,
      detail: null,
      url: null,
    });
  }
  return out;
};

// The four dates, as separate labelled items, in order, skipping the ones that are
// not set. A future effective date is labelled differently on purpose: a rule that
// takes effect next year is not a rule that applies today.
export const datesFor = (row, now = new Date()) =>
  PROVISION_DATES.map((d) => {
    const raw = row?.[d.key];
    if (!raw) return null;
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) return null;
    const future = value > now;
    return {
      key: d.key,
      label: d.key === "effective_date" && future ? d.futureLabel : d.label,
      means: d.means,
      value,
      text: formatDate(value),
      future,
    };
  }).filter(Boolean);

const formatDate = (d) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

// How stale our reading is, said plainly and only when we know. Never presented as
// a statement about the law.
export const sourceFreshness = (row, now = new Date()) => {
  if (!row?.source_checked_date) return null;
  const checked = new Date(row.source_checked_date);
  if (Number.isNaN(checked.getTime())) return null;
  const months = Math.floor((now - checked) / (1000 * 60 * 60 * 24 * 30.44));
  return {
    checked,
    months,
    text: `ADUAtlas last read this source ${formatDate(checked)}.`,
    stale: months >= 12,
  };
};

// Coverage, in a sentence, with the gap named rather than hidden. Incomplete is
// allowed; looking complete when it is not, is not.
export const coverageSentence = (coverage) => {
  if (!coverage) return UNRESEARCHED_JURISDICTION_COPY;
  const verified = coverage.topics_verified || 0;
  const silent = coverage.topics_source_silent || 0;
  const tracked = coverage.topics_tracked || 0;
  if (verified === 0 && silent === 0) return UNRESEARCHED_JURISDICTION_COPY;
  const parts = [`${verified} of ${tracked} requirements verified from official sources`];
  if (silent) parts.push(`${silent} the source does not address`);
  const remaining = coverage.topics_not_researched || 0;
  if (remaining) parts.push(`${remaining} not yet researched`);
  return `${parts.join(", ")}.`;
};

// Publication and indexability are different questions (2l). A page exists for all
// fifty states; it asks to be indexed only when it carries real verified content,
// and the database decides that, not the page.
export const isIndexable = (coverage) => Boolean(coverage?.is_indexable);

// The canonical url of a record: a state-level record is /rules/<code>, anything
// else /rules/<code>/<slug>. The same urls the pages declare as canonical.
export const jurisdictionUrl = (j) =>
  ["state", "federal_district", "territory"].includes(j?.jurisdiction_type)
    ? `/rules/${String(j?.state_code || "").toLowerCase()}`
    : `/rules/${String(j?.state_code || "").toLowerCase()}/${j?.slug}`;

// ── reads: the public regulatory database ───────────────────────────────────
// Everything here goes through the _public views, which carry published records
// only. An anonymous visitor and a signed-in homeowner read exactly the same rows,
// because a paid plan buys no regulatory access.
//
// research_note travels with the two list reads below as well as with
// fetchJurisdiction (T4-08). A state page's own record comes from fetchStates,
// and a city page's state and county levels come from both lists, so without it
// the "Note shown on the public page" reached only the record a page was about.

export const fetchStates = async () => {
  if (!supabaseEnabled || !supabase) return { ok: false, error: DISABLED.error, states: [] };
  const { data, error } = await supabase
    .from("jurisdictions_public")
    .select("id, name, official_name, slug, state_code, path, jurisdiction_type, research_note")
    .in("jurisdiction_type", ["state", "federal_district"])
    .order("name");
  if (error) return { ok: false, error: error.message, states: [] };
  return { ok: true, states: data || [] };
};

// Local jurisdictions inside one state, for a state page's index.
export const fetchJurisdictionsInState = async (stateCode) => {
  if (!supabase) return { ok: false, error: DISABLED.error, jurisdictions: [] };
  const { data, error } = await supabase
    .from("jurisdictions_public")
    .select("id, name, official_name, slug, state_code, path, jurisdiction_type, parent_id, research_note")
    .eq("state_code", String(stateCode || "").toUpperCase())
    .not("jurisdiction_type", "in", '("state","federal_district")')
    .order("name");
  if (error) return { ok: false, error: error.message, jurisdictions: [] };
  return { ok: true, jurisdictions: data || [] };
};

// The canonical page lookup is (state_code, slug), never the path, so a city that
// is later re-parented under its county keeps its URL.
//
// Three call shapes, because the pages use two of them:
//   fetchJurisdiction({ stateCode: "AZ", slug: "phoenix" })   canonical, unambiguous
//   fetchJurisdiction("AZ", "phoenix")                        the same, positional
//   fetchJurisdiction("phoenix")                              slug alone
//
// A SLUG ALONE CAN BE AMBIGUOUS and the result says so. Nothing stops two states
// from each having a Springfield, so when the slug-only shape matches more than
// one record it returns NO jurisdiction and sets `ambiguous` with the full list of
// matches. It never picks one: picking is how /rules/mo/springfield came to show
// Illinois's rules (DEF-06). A page passes the state; a caller that cannot (the
// government portal, matching by id) reads `ambiguous`.
const JURISDICTION_COLUMNS =
  "id, name, official_name, slug, state_code, path, jurisdiction_type, parent_id, research_note";
const STATE_LEVELS = ["state", "federal_district"];

export const fetchJurisdiction = async (arg, maybeSlug) => {
  if (!supabase) return { ok: false, error: DISABLED.error, jurisdiction: null };
  let stateCode = null;
  let slug = null;
  if (typeof arg === "string" && typeof maybeSlug === "string") {
    stateCode = arg;
    slug = maybeSlug;
  } else if (typeof arg === "string") {
    slug = arg;
  } else {
    stateCode = arg?.stateCode ?? null;
    slug = arg?.slug ?? null;
  }
  const code = stateCode ? String(stateCode).toUpperCase() : null;

  // A state code with no slug means the state's own page.
  if (code && !slug) {
    const { data, error } = await supabase
      .from("jurisdictions_public")
      .select(JURISDICTION_COLUMNS)
      .eq("state_code", code)
      .in("jurisdiction_type", STATE_LEVELS)
      .maybeSingle();
    if (error) return { ok: false, error: error.message, jurisdiction: null };
    return { ok: true, jurisdiction: data || null };
  }
  if (!slug) return { ok: false, error: "no-jurisdiction-named", jurisdiction: null };

  let q = supabase.from("jurisdictions_public").select(JURISDICTION_COLUMNS).eq("slug", slug);
  if (code) q = q.eq("state_code", code);
  const { data, error } = await q.order("state_code");
  if (error) return { ok: false, error: error.message, jurisdiction: null };
  const rows = data || [];
  if (rows.length <= 1) return { ok: true, jurisdiction: rows[0] || null };
  return { ok: true, jurisdiction: null, ambiguous: rows };
};

export const fetchCoverage = async (jurisdictionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, coverage: null };
  const { data, error } = await supabase
    .from("jurisdiction_coverage_public")
    .select("*")
    .eq("jurisdiction_id", jurisdictionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, coverage: null };
  return { ok: true, coverage: data || null };
};

// Coverage for every published jurisdiction in one state, the state row included.
// A state page reads it to say which of its jurisdictions hold records and
// whether the state asks to be indexed. Paged, because PostgREST caps a response
// at 1000 rows and a silent cap would drop jurisdictions from the answer.
const COVERAGE_COLUMNS =
  "jurisdiction_id, state_code, jurisdiction_type, topics_verified, topics_source_silent, topics_not_researched, resources_published, is_indexable";
const PAGE = 1000;

const readAllCoverage = async (build) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order("jurisdiction_id").range(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message, rows: [] };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { ok: true, rows };
};

export const fetchStateCoverage = async (stateCode) => {
  if (!supabase) return { ok: false, error: DISABLED.error, coverage: [] };
  const code = String(stateCode || "").toUpperCase();
  const read = await readAllCoverage(() =>
    supabase.from("jurisdiction_coverage_public").select(COVERAGE_COLUMNS).eq("state_code", code)
  );
  return read.ok ? { ok: true, coverage: read.rows } : { ok: false, error: read.error, coverage: [] };
};

// Whether a coverage row stands for anything ADUAtlas actually published: a rule
// (verified or source-silent) or a resource. A published jurisdiction row with
// nothing under it is structure, not a record (2l, DEF-16).
export const holdsRecords = (coverage) =>
  Number(coverage?.topics_verified || 0) + Number(coverage?.topics_source_silent || 0) + Number(coverage?.resources_published || 0) > 0;

// Places in one state worth sending a homeowner to from the homepage lookup: below state level,
// with a slug, and holding at least one published record (same test as the rules index). The
// coverage view is read in full (paginated); names and slugs are then fetched only for those
// ids, in batches, so a large state never hits the 1000-row read cap.
export const fetchLookupPlaces = async (stateCode) => {
  if (!supabase) return { ok: false, error: DISABLED.error, places: [] };
  const coverage = await fetchStateCoverage(stateCode);
  if (!coverage.ok) return { ok: false, error: coverage.error, places: [] };
  const ids = coverage.coverage
    .filter((row) => !["state", "federal_district"].includes(row.jurisdiction_type) && holdsRecords(row))
    .map((row) => row.jurisdiction_id);
  const rows = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("jurisdictions_public")
      .select("id, name, official_name, slug, jurisdiction_type")
      .in("id", ids.slice(i, i + 200));
    if (error) return { ok: false, error: error.message, places: [] };
    rows.push(...(data || []));
  }
  const places = rows
    .filter((row) => row.slug)
    .map((row) => ({ id: row.id, name: row.official_name || row.name, slug: row.slug, type: row.jurisdiction_type }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { ok: true, places };
};

// Every jurisdiction nationwide that holds at least one published record, for the
// rules index. Counted from the coverage view, so the index can only claim what a
// published row backs.
export const fetchJurisdictionsWithRecords = async () => {
  if (!supabase) return { ok: false, error: DISABLED.error, coverage: [] };
  const read = await readAllCoverage(() =>
    supabase
      .from("jurisdiction_coverage_public")
      .select(COVERAGE_COLUMNS)
      .or("topics_verified.gt.0,topics_source_silent.gt.0,resources_published.gt.0")
  );
  return read.ok ? { ok: true, coverage: read.rows.filter(holdsRecords) } : { ok: false, error: read.error, coverage: [] };
};

// Every topic for this jurisdiction, in one of the three states, including the
// ones nobody has researched. This is the read a rules page is built on: it cannot
// silently omit a gap, because the gap is a row.
export const fetchTopicCoverage = async (jurisdictionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, topics: [] };
  const { data, error } = await supabase
    .from("jurisdiction_topic_coverage")
    .select("topic_key, topic_category, topic_label, topic_question, field_state, provision_id, sort_order")
    .eq("jurisdiction_id", jurisdictionId)
    .order("sort_order");
  if (error) return { ok: false, error: error.message, topics: [] };
  return { ok: true, topics: data || [] };
};

export const fetchProvisions = async (jurisdictionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, provisions: [] };
  const { data, error } = await supabase
    .from("regulatory_provisions_public")
    .select("*")
    .eq("jurisdiction_id", jurisdictionId);
  if (error) return { ok: false, error: error.message, provisions: [] };
  return { ok: true, provisions: data || [] };
};

export const fetchResources = async (jurisdictionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, resources: [] };
  const { data, error } = await supabase
    .from("government_resources_public")
    .select("*")
    .eq("jurisdiction_id", jurisdictionId)
    .order("sort_order");
  if (error) return { ok: false, error: error.message, resources: [] };
  return { ok: true, resources: data || [] };
};

// The state, the county and the city, side by side, never merged. If two levels
// answer the same topic differently the caller receives both rows and shows both:
// picking one would be inventing an answer no government gave.
export const fetchRuleStack = async (jurisdictionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, stack: [], byTopic: {} };
  const { data, error } = await supabase.rpc("jurisdiction_rule_stack", {
    p_jurisdiction_id: jurisdictionId,
  });
  if (error) return { ok: false, error: error.message, stack: [], byTopic: {} };
  const rows = data || [];
  const byTopic = {};
  for (const row of rows) {
    if (!byTopic[row.topic_key]) byTopic[row.topic_key] = [];
    byTopic[row.topic_key].push(row);
  }
  return { ok: true, stack: rows, byTopic };
};

// What a rule said before it was corrected or superseded. Published versions only.
export const fetchProvisionHistory = async (provisionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, versions: [] };
  const { data, error } = await supabase
    .from("regulatory_provision_history_public")
    .select("*")
    .eq("provision_id", provisionId)
    .order("version_no", { ascending: false });
  if (error) return { ok: false, error: error.message, versions: [] };
  return { ok: true, versions: data || [] };
};

// Government entities seated in a jurisdiction, with their state. A caller showing
// one of these MUST pass entity_state through entityStateDisclosure: an unclaimed
// record may not read as participation.
export const fetchGovernmentEntities = async (jurisdictionId) => {
  if (!supabase) return { ok: false, error: DISABLED.error, entities: [] };
  const { data, error } = await supabase
    .from("government_entities_public")
    .select("id, name, entity_type, jurisdiction_id, official_website_url, entity_state, verified_at")
    .eq("jurisdiction_id", jurisdictionId)
    .order("name");
  if (error) return { ok: false, error: error.message, entities: [] };
  return { ok: true, entities: data || [] };
};

// ── the government portal ───────────────────────────────────────────────────

const requireSession = async () => {
  if (!supabase) return { error: DISABLED.error };
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) return { error: LOGGED_OUT.error };
  return { user: data.session.user };
};

// Who the caller is, which entities they have a membership of, in which state, and
// the EXPLICIT list of jurisdictions each verified membership may work on. A
// pending member gets an empty jurisdiction list, which is the honest answer: they
// are waiting, and there is nothing to imply otherwise.
export const myGovernmentContext = async () => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, context: null };
  const { data, error } = await supabase.rpc("my_government_context");
  if (error) return { ok: false, error: error.message, context: null };
  return { ok: true, context: data || null };
};

// THE BAR FOR CLAIMING A GOVERNMENT IDENTITY (decision 2o, migration 0015).
// Holding an email address is not authority and knowing a jurisdiction's name is
// not authority, so the database requires the claimant's work-email domain to
// match one of the official government domains ADUAtlas recorded on that entity,
// and it refuses outright when the entity has no recorded domains. This sentence
// is the rule, which a form may state up front; it is NOT a check this module
// performs, because a rule enforced in the browser is not enforced. There is
// deliberately no client-side domain comparison below and no reachable list of an
// entity's domains: official_domains is not in government_entities_public.
export const GOVERNMENT_CLAIM_AUTHORITY_COPY =
  "Use your work email address at one of this jurisdiction's official government domains. A claim from a personal address cannot be recorded, and a matching domain is evidence for the review rather than the approval itself: a person at ADUAtlas confirms you are authorised to represent this entity.";

// Claiming an entity. It produces a CLAIM and a pending membership. It never
// produces a verification, and the RPC's own return value says so, so a caller
// cannot show a badge off the back of a successful claim.
//
// ONE REFUSAL, FOR EVERY FAILURE. The database returns the same sentence and the
// same SQLSTATE whatever was wrong, so the claim form cannot be used to discover
// which domains an entity accepts. `error` carries that sentence through
// unchanged and `refused` marks it: a caller may show the server's own wording or
// its own, and must never try to work out or explain WHICH check failed.
export const claimGovernmentEntity = async ({ entityId, fullName, jobTitle, workEmail, phone, note }) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error };
  const { data, error } = await supabase.rpc("claim_government_entity", {
    p_entity_id: entityId,
    p_full_name: fullName,
    p_job_title: jobTitle || null,
    p_work_email: workEmail,
    p_phone: phone || null,
    p_note: note || null,
  });
  if (error) return { ok: false, error: error.message, refused: true, claim: null };
  return { ok: true, claim: data, verified: false };
};

// ── the claim a signed-out visitor was about to make ────────────────────────
//
// A claim link from a public page preselects its record on /gov/claim (T4-06).
// A signed-out visitor is sent to sign in first, and the query string carries the
// preselection through a plain sign-in. It does not survive an email
// confirmation: the confirmation link opens a new tab and no query string comes
// with it, and sessionStorage does not reach a new tab either. So GovLayout keeps
// the preselection in this browser's localStorage when it sends a signed-out
// visitor away, and /gov/claim reads it back when it opens with nothing
// preselected, then forgets it.
//
// It is a state code and two public record ids: no credential, no form field,
// nothing a claim is decided by. It still describes what one person at this
// browser was doing, so it is an account-scoped key (ACCOUNT_SCOPED_KEYS in
// src/stores/accountScope.js) and log out removes it. Only the three known
// parameters are kept, each checked for shape, and one older than a week is
// ignored.
export const GOV_CLAIM_TARGET_KEY = "aduatlas.gov.claim_target";
const GOV_CLAIM_TARGET_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The preselection in a URLSearchParams, with anything that is not the right
// shape dropped. Empty strings for what is absent.
export const govClaimTargetFrom = (params) => {
  const read = (key) => String(params?.get?.(key) || "");
  const state = read("state");
  const jurisdiction = read("jurisdiction");
  const entity = read("entity");
  return {
    state: /^[A-Z]{2}$/.test(state) ? state : "",
    jurisdiction: RECORD_ID.test(jurisdiction) ? jurisdiction : "",
    entity: RECORD_ID.test(entity) ? entity : "",
  };
};

export const hasGovClaimTarget = (target) => Boolean(target?.state || target?.jurisdiction || target?.entity);

// The query string for a preselection, without the leading "?".
export const govClaimTargetQuery = (target) =>
  new URLSearchParams(
    [
      ["state", target?.state],
      ["jurisdiction", target?.jurisdiction],
      ["entity", target?.entity],
    ].filter(([, value]) => value)
  ).toString();

const browserStorage = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const rememberGovClaimTarget = (search) => {
  const target = govClaimTargetFrom(new URLSearchParams(String(search || "")));
  if (!hasGovClaimTarget(target)) return;
  try {
    browserStorage()?.setItem(GOV_CLAIM_TARGET_KEY, JSON.stringify({ ...target, at: Date.now() }));
  } catch {
    // Storage blocked: the query string still carries a plain sign-in.
  }
};

export const recallGovClaimTarget = () => {
  try {
    const saved = JSON.parse(browserStorage()?.getItem(GOV_CLAIM_TARGET_KEY) || "null");
    if (!saved || typeof saved !== "object") return null;
    if (!(Number(saved.at) > Date.now() - GOV_CLAIM_TARGET_MAX_AGE_MS)) return null;
    const target = govClaimTargetFrom(new URLSearchParams(govClaimTargetQuery(saved)));
    return hasGovClaimTarget(target) ? target : null;
  } catch {
    return null;
  }
};

export const forgetGovClaimTarget = () => {
  try {
    browserStorage()?.removeItem(GOV_CLAIM_TARGET_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
};

// Where an interrupted claim continues, or "" when none is kept. For the sign-in
// pages: a person who arrives with no explicit `next` and kept a claim
// preselection in this browser can be sent back to it.
export const pendingGovClaimPath = () => {
  const target = recallGovClaimTarget();
  return target ? `/gov/claim?${govClaimTargetQuery(target)}` : "";
};

// A submission. The database refuses it unless the caller holds a verified
// membership of the named entity AND that entity holds a live grant on the named
// jurisdiction, so this function does not try to guess permission in the browser:
// it sends the row and reports what the database said.
export const submitProvision = async ({
  entityId,
  jurisdictionId,
  governmentUserId,
  topicKey,
  fieldState = FIELD_STATE.VERIFIED,
  valueText,
  valueNumeric,
  valueUnit,
  valueBoolean,
  valueQualifier,
  effectiveDate,
  sourceUrl,
  sourceDocumentTitle,
  sourceCitation,
  sourceType,
  targetProvisionId,
  conflictsWithProvisionId,
  note,
}) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error };
  const payload = {
    field_state: fieldState,
    value_text: valueText ?? null,
    value_numeric: valueNumeric ?? null,
    value_unit: valueUnit ?? null,
    value_boolean: valueBoolean ?? null,
    value_qualifier: valueQualifier ?? null,
    effective_date: effectiveDate ?? null,
    source_url: sourceUrl ?? null,
    source_document_title: sourceDocumentTitle ?? null,
    source_citation: sourceCitation ?? null,
    source_type: sourceType ?? null,
  };
  const { data, error } = await supabase
    .from("regulatory_submissions")
    .insert({
      kind: "provision",
      jurisdiction_id: jurisdictionId,
      entity_id: entityId,
      submitted_by_government_user_id: governmentUserId,
      topic_key: topicKey,
      target_provision_id: targetProvisionId || null,
      conflicts_with_provision_id: conflictsWithProvisionId || null,
      payload,
      submitter_note: note || null,
    })
    .select("id, status, submitted_at")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, submission: data, published: false, promise: SUBMISSION_PROMISE };
};

export const submitResource = async ({
  entityId,
  jurisdictionId,
  governmentUserId,
  resourceType,
  fieldState = FIELD_STATE.VERIFIED,
  label,
  url,
  phone,
  email,
  contactName,
  contactTitle,
  departmentName,
  notes,
  sourceUrl,
  sourceType,
  targetResourceId,
  note,
}) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error };
  const { data, error } = await supabase
    .from("regulatory_submissions")
    .insert({
      kind: "resource",
      jurisdiction_id: jurisdictionId,
      entity_id: entityId,
      submitted_by_government_user_id: governmentUserId,
      resource_type: resourceType,
      target_resource_id: targetResourceId || null,
      payload: {
        field_state: fieldState,
        label: label ?? null,
        url: url ?? null,
        phone: phone ?? null,
        email: email ?? null,
        contact_name: contactName ?? null,
        contact_title: contactTitle ?? null,
        department_name: departmentName ?? null,
        notes: notes ?? null,
        source_url: sourceUrl ?? null,
        source_type: sourceType ?? null,
      },
      submitter_note: note || null,
    })
    .select("id, status, submitted_at")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, submission: data, published: false, promise: SUBMISSION_PROMISE };
};

// An entity's own submissions, with ADUAtlas's answer beside each one. Both sides
// of the record are readable here, including a rejection and its reason, which is
// the point of keeping them.
export const mySubmissions = async (entityId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, submissions: [] };
  let q = supabase
    .from("regulatory_submissions")
    .select(
      "id, kind, jurisdiction_id, entity_id, topic_key, resource_type, payload, submitter_note, status, review_note, reviewed_at, resulting_provision_id, resulting_resource_id, withdrawn_at, submitted_at"
    )
    .order("submitted_at", { ascending: false });
  if (entityId) q = q.eq("entity_id", entityId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, submissions: [] };
  return { ok: true, submissions: data || [] };
};

// Withdrawing is the ONE change a member may make to their own submission, and it
// does not edit what was submitted: both statements stay in the record.
export const withdrawSubmission = async (submissionId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error };
  const { error } = await supabase
    .from("regulatory_submissions")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", submissionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

// The management view of what ADUAtlas holds for a jurisdiction this entity was
// granted, drafts included. The database returns nothing for a jurisdiction the
// entity was not granted, so an empty result is an answer and not an error.
export const fetchWorkspaceProvisions = async (jurisdictionId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, provisions: [] };
  const { data, error } = await supabase
    .from("regulatory_provisions")
    .select(
      "id, jurisdiction_id, topic_key, field_state, value_text, value_numeric, value_unit, value_boolean, value_qualifier, source_url, source_document_title, source_type, supplied_by, review_status, verification_status, effective_date, source_checked_date, record_published_at, superseded_or_repealed_date, is_published"
    )
    .eq("jurisdiction_id", jurisdictionId);
  if (error) return { ok: false, error: error.message, provisions: [] };
  return { ok: true, provisions: data || [] };
};

export const fetchWorkspaceResources = async (jurisdictionId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, resources: [] };
  const { data, error } = await supabase
    .from("government_resources")
    .select(
      "id, jurisdiction_id, resource_type, field_state, label, url, phone, email, contact_name, contact_title, department_name, notes, source_url, review_status, source_checked_date, record_published_at, is_published"
    )
    .eq("jurisdiction_id", jurisdictionId)
    .order("sort_order");
  if (error) return { ok: false, error: error.message, resources: [] };
  return { ok: true, resources: data || [] };
};

// One page's worth of reads, in the order a rules page needs them. Coverage and
// topic states come back even when nothing is researched, so the page renders the
// honest empty state rather than a spinner that never resolves.
export const loadJurisdictionPage = async ({ stateCode, slug }) => {
  const found = await fetchJurisdiction({ stateCode, slug });
  if (!found.ok || !found.jurisdiction) {
    return { ok: false, error: found.error || "not-found", jurisdiction: null };
  }
  const j = found.jurisdiction;
  const [coverage, topics, provisions, resources, stack] = await Promise.all([
    fetchCoverage(j.id),
    fetchTopicCoverage(j.id),
    fetchProvisions(j.id),
    fetchResources(j.id),
    fetchRuleStack(j.id),
  ]);
  return {
    ok: true,
    jurisdiction: j,
    coverage: coverage.coverage,
    topics: topics.topics,
    provisions: provisions.provisions,
    resources: resources.resources,
    ruleStack: stack.byTopic,
    indexable: isIndexable(coverage.coverage),
    emptyStateCopy: j.research_note || UNRESEARCHED_JURISDICTION_COPY,
    boundary: FEASIBILITY_BOUNDARY,
  };
};

// ── the names the pages import ──────────────────────────────────────────────
// src/pages/Rules.jsx, RulesState.jsx and RulesJurisdiction.jsx were written
// against this module's contract before the module existed, and they import a few
// concepts under different names and call two of the readers with positional
// arguments. Rather than leave the build broken or rename the canonical functions,
// both spellings are exported and documented here. Nothing below is a stub: each
// one is the same read, with the same guarantees.

// Topic labels for synchronous rendering. THE DATABASE IS AUTHORITATIVE
// (public.regulatory_topics, seeded by migration 0012); this mirror exists so a
// page can label a row without waiting on a second query, and it must be updated in
// the same commit as any migration that adds a topic. fetchTopics() reads the real
// catalogue, including the question text.
export const PROVISION_TOPIC_LABELS = {
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

// The pages call a resource's type its "kind". Same vocabulary, same labels.
export const RESOURCE_KIND_LABELS = RESOURCE_TYPE_LABELS;

// Shorter name for the same question: is this a verified government account?
export const isVerifiedGovernment = isVerifiedGovernmentAccount;

export const fetchTopics = async () => {
  if (!supabase) return { ok: false, error: DISABLED.error, topics: [] };
  const { data, error } = await supabase
    .from("regulatory_topics")
    .select("key, category, label, question, value_kind, value_unit, sort_order")
    .order("sort_order");
  if (error) return { ok: false, error: error.message, topics: [] };
  return { ok: true, topics: data || [] };
};

// fetchJurisdictions(stateCode): the same read as fetchJurisdictionsInState, under
// the name the pages use.
export const fetchJurisdictions = (stateCode) => fetchJurisdictionsInState(stateCode);

// fetchEntity(jurisdictionId): the government entity to show beside a jurisdiction's
// rules, as a single row.
//
// A jurisdiction may have more than one entity seated in it (a city and its water
// district, for instance), so this returns the one whose PARTICIPATION is furthest
// along: verified, then claimed, then unclaimed. That order is deliberate and it is
// not a ranking of importance. It is so a page showing one entity shows the one with
// something true to say, and entity_state travels with the row so an unclaimed
// record still renders as "ADUAtlas compiled this from public sources" rather than
// as a government taking part.
export const fetchEntity = async (jurisdictionId) => {
  const { ok, error, entities } = await fetchGovernmentEntities(jurisdictionId);
  if (!ok) return { ok: false, error, entity: null };
  const rank = { [ENTITY_STATE.VERIFIED]: 0, [ENTITY_STATE.CLAIMED]: 1, [ENTITY_STATE.UNCLAIMED]: 2 };
  const sorted = [...entities].sort(
    (a, b) => (rank[a.entity_state] ?? 3) - (rank[b.entity_state] ?? 3)
  );
  return { ok: true, entity: sorted[0] || null, entities };
};

// Jurisdictions bucketed by level, for ORDERING a display stack. Geography and
// presentation only: it says nothing about who may edit what, and no caller may read
// an order as an authority. Returned as an object of arrays, coarsest level first.
export const groupByLevel = (jurisdictions) => {
  const order = ["country", "state", "federal_district", "territory", "county", "municipality", "tribal", "special_district", "other"];
  const out = {};
  for (const level of order) {
    const rows = (jurisdictions || []).filter((j) => j?.jurisdiction_type === level);
    if (rows.length) out[level] = rows;
  }
  const seen = new Set(Object.values(out).flat());
  const rest = (jurisdictions || []).filter((j) => j && !seen.has(j));
  if (rest.length) out.other = [...(out.other || []), ...rest];
  return out;
};
export const groupProvisionsByLevel = groupByLevel;
