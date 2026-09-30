// ADUAtlas Education Partnerships and sponsored resident education (decision 2p).
//
// Schema: supabase/migrations/0014_government_partnerships.sql. Read its header
// before changing anything here; this file is the client half of the same contract.
// The identity half of the government layer lives in src/lib/regulatory.js and this
// module imports from it rather than restating it, for the reason below.
//
// THREE THINGS THIS MODULE EXISTS TO KEEP APART. Every one of them is a way a
// product like this misleads people, and every one of them is a function or a
// constant here rather than a rule a page is trusted to remember.
//
// 1. IDENTITY VERIFICATION AND PARTNERSHIP ARE TWO AXES, NOT ONE STATE.
//    "Verified Government Account" means ADUAtlas confirmed the account is
//    controlled by the stated city, county, state or agency. "ADUAtlas Education
//    Partner" means that verified entity activated a partnership. A city can be
//    the first without being the second, and that is a legitimate, common state.
//    badgesFor() returns up to TWO separate badges with two separate sentences and
//    there is no branch in it that can return one merged line. The word "verified"
//    appears nowhere in this module's partnership vocabulary, because verification
//    already means something else.
//
// 2. A PARTNERSHIP IS NEVER AN ENDORSEMENT. A city sponsoring resident education
//    is not the city endorsing ADUAtlas, endorsing a builder, vouching for a
//    feasibility result, or approving anybody's project. PARTNER_LABEL_DOES_NOT_MEAN
//    and the sponsored entry copy say so in the words a resident reads.
//
// 3. SPONSORSHIP IS GOLDEN AND NOTHING ELSE. Platinum stays paid, Concierge stays
//    paid, feasibility studies and site plans stay paid, and builder commercial
//    terms are untouched. SPONSORED_PLAN names the one entitlement and
//    SPONSORSHIP_EXCLUDES names what it is not, so no page can imply more. The
//    database enforces it; this file is what the page says about it.
//
// WHAT THIS MODULE DOES NOT DO, AND WHY IT CANNOT.
//
//   It never grants anything. public.redeem_partner_access() is service-role only,
//   so the anon key cannot reach it through PostgREST at all. Every sponsored entry
//   call here goes to /api/partner-redeem, which holds the service key and which
//   resolves WHO IS SIGNED IN from the request's own session. The browser never
//   sends an account id, and nothing in this file lets it: a payload that named the
//   account would be a way to hand somebody else's account an entitlement.
//
//   It never resolves a CODE for display. A partner link is public by design and is
//   printed on a government web page, so fetchSponsoredEntryContext() resolves one.
//   A code is a secret that has to resist guessing, and a surface that told you
//   whether a code exists would be a test oracle for one.
//
//   It reads analytics as COUNTS. public.partner_analytics carries no user id, no
//   email and no name, so there is nothing here to accidentally render. A partner
//   never sees an individual homeowner's private information merely because it
//   sponsored the access.
import { supabase, supabaseEnabled } from "./supabase";
import { PLAN_IDS, planById, formatPrice } from "./plans";
import {
  ENTITY_STATE,
  GOVERNMENT_BADGE_LABEL,
  GOVERNMENT_BADGE_MEANS,
  GOVERNMENT_BADGE_DOES_NOT_MEAN,
} from "./regulatory";

const DISABLED = { ok: false, error: "supabase-disabled" };
const LOGGED_OUT = { ok: false, error: "logged-out" };

// ── the partnership axis ────────────────────────────────────────────────────
// Five states. NONE is the absence of a partnership row, which is what the
// database stores for a city ADUAtlas has never partnered with, and it is the
// normal state for most verified governments rather than an incomplete record.
export const PARTNERSHIP_STATUS = {
  NONE: "none",
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
};

// What each state is CALLED. None of them uses the word verified.
export const PARTNERSHIP_STATUS_LABELS = {
  [PARTNERSHIP_STATUS.NONE]: "No partnership",
  [PARTNERSHIP_STATUS.PENDING]: "Partnership pending",
  [PARTNERSHIP_STATUS.ACTIVE]: "ADUAtlas Education Partner",
  [PARTNERSHIP_STATUS.INACTIVE]: "Partnership ended",
  [PARTNERSHIP_STATUS.SUSPENDED]: "Partnership suspended",
};

// What each state MEANS, in the words a portal needs. The pending sentence matters
// most: a partnership being arranged unlocks nothing at all, and a portal that
// implies otherwise sets a city up to hand out access that will not work.
export const PARTNERSHIP_STATUS_SENTENCES = {
  [PARTNERSHIP_STATUS.NONE]:
    "This government has no ADUAtlas Education Partnership. Sponsored resident access is not available.",
  [PARTNERSHIP_STATUS.PENDING]:
    "ADUAtlas and this government are arranging a partnership. Nothing is active yet, so resident links and codes cannot be issued or redeemed.",
  [PARTNERSHIP_STATUS.ACTIVE]:
    "This partnership is active. Resident access links and codes work, and each resident who enters through one receives sponsored Golden access.",
  [PARTNERSHIP_STATUS.INACTIVE]:
    "This partnership has ended. New resident activations have stopped. Every resident who already entered keeps the access they were given.",
  [PARTNERSHIP_STATUS.SUSPENDED]:
    "ADUAtlas has suspended this partnership. New resident activations have stopped. Every resident who already entered keeps the access they were given.",
};

// The public label, and the two sentences that bound it. 2p: never called verified.
export const PARTNER_LABEL = "ADUAtlas Education Partner";
export const PARTNER_LABEL_MEANS =
  "This government has an active partnership with ADUAtlas to offer its residents the ADUAtlas course at no cost.";
export const PARTNER_LABEL_DOES_NOT_MEAN =
  "It does not mean the government endorses ADUAtlas or any builder, and it is not a review or approval of any project or any rule.";

export const partnershipStatus = (p) => {
  const status = typeof p === "string" ? p : p?.status;
  return Object.values(PARTNERSHIP_STATUS).includes(status) ? status : PARTNERSHIP_STATUS.NONE;
};

export const partnershipStatusLabel = (p) => PARTNERSHIP_STATUS_LABELS[partnershipStatus(p)];
export const partnershipStatusSentence = (p) => PARTNERSHIP_STATUS_SENTENCES[partnershipStatus(p)];

// ONLY an active partnership unlocks the partnership tools (2p). Pending is not
// active, suspended is not active, and ended is not active: one comparison, and no
// truthiness on an object that happens to exist.
export const isActivePartner = (p) => partnershipStatus(p) === PARTNERSHIP_STATUS.ACTIVE;

// The gate the portal uses for resident links, resident codes, the embeddable
// link and the analytics. Named separately from isActivePartner so a reader of a
// component can see WHAT is being gated, and deliberately the same one condition:
// a second, looser gate is how a pending partner ends up with a working link.
export const partnerToolsUnlocked = (p) => isActivePartner(p);

// ── who may issue resident access, and what to say when nobody may ──────────
// The DATABASE decides: partner_may_manage_access() and partner_access_guard()
// (0014) accept an insert only from a verified, unrevoked contributor or
// administrator membership of a VERIFIED entity with an ACTIVE partnership and a
// live grant on that exact jurisdiction. The portal mirrors those conditions so it
// never shows a control the database will refuse, and so it can say in one plain
// sentence which condition is missing. Mirroring is presentation, not permission:
// a control this hides is still refused on the server.
export const ISSUING_ROLES = ["contributor", "administrator"];

// A membership ADUAtlas verified, of an entity that is no longer verified.
// Verifying a membership verifies its entity (admin_verify_government_membership,
// 0012), and a rejection never lands on a verified representative, so this
// combination arises only when ADUAtlas withdrew the entity's verification (0020
// stores that as 'suspended'). Where the server names the identity state itself,
// in 0020's own field name, that answer wins.
export const identityWithdrawn = (membership) => {
  if (!membership) return false;
  if (typeof membership.identity_state === "string") return membership.identity_state === "suspended";
  return membership.membership_status === "verified" && (membership.entity_state || "unclaimed") !== "verified";
};

export const ISSUANCE_UNAVAILABLE = {
  withdrawn:
    "ADUAtlas has withdrawn this entity's government verification, so resident access links and codes cannot be issued.",
  unverified:
    "Resident access links and codes can be issued only after ADUAtlas verifies this entity and an education partnership is active.",
  [PARTNERSHIP_STATUS.NONE]:
    "This entity has no ADUAtlas Education Partnership, so resident access links and codes cannot be issued.",
  [PARTNERSHIP_STATUS.PENDING]:
    "The partnership is not active yet, so resident access links and codes cannot be issued.",
  [PARTNERSHIP_STATUS.SUSPENDED]:
    "ADUAtlas has suspended this partnership, so resident access links and codes cannot be issued.",
  [PARTNERSHIP_STATUS.INACTIVE]:
    "This partnership has ended, so resident access links and codes cannot be issued.",
  role:
    "Your role on this account is read only, so you cannot create or switch off resident access links and codes. A contributor or administrator for this entity can.",
  no_grant:
    "ADUAtlas has not granted this entity a jurisdiction record yet. A link or code is always issued for one, so nothing can be issued until a grant exists.",
};

// What happens to access that already exists. Said only about a partnership that
// was once active, because only an active partnership can issue a link or a code.
export const EARLIER_ACCESS_SENTENCE =
  "Links and codes issued earlier no longer give new residents access. Residents who already received sponsored access keep it.";

// T4-11 (RC4 rehearsal): the withdrawn portal told a city that never had a
// partnership that its "links and codes issued earlier" had stopped working. The
// sentence about earlier access now needs evidence that there was any:
// activated_at, which 0014 sets the first time a partnership becomes active and
// never changes afterwards. Evidence is the partnership row the server let this
// page read. A withdrawn entity cannot read its row at all (0014 scopes it to a
// verified entity), so a withdrawn portal says nothing about earlier links and
// codes rather than guess at a history it cannot see.
export const partnershipWasActive = (p) => Boolean(p && typeof p === "object" && p.activated_at);

// What a withdrawn portal CAN say without that evidence: the rule, stated as a
// condition, which is true for an entity that had a partnership and for one that
// never did. Leaving it out would hide from a real former partner that its
// residents keep their access.
export const EARLIER_ACCESS_IF_ANY_SENTENCE =
  "If this entity gave residents sponsored access before, any links and codes from then no longer let new residents in, and residents who already received access keep it.";

// One answer for the portal: may this person issue resident access for this
// entity right now, and if not, why not. The order is the order of the facts:
// identity first, then the partnership, then the person's role, then the grant.
export const residentAccessIssuance = ({ membership, partnership } = {}) => {
  const identityVerified =
    membership?.membership_status === "verified" && membership?.entity_state === "verified";
  let reason = null;
  if (identityWithdrawn(membership)) reason = "withdrawn";
  else if (!identityVerified) reason = "unverified";
  else if (!isActivePartner(partnership)) reason = partnershipStatus(partnership);
  else if (!ISSUING_ROLES.includes(membership?.membership_role)) reason = "role";
  else if (!(membership?.jurisdictions || []).length) reason = "no_grant";
  const stopped =
    reason === "withdrawn" || reason === PARTNERSHIP_STATUS.SUSPENDED || reason === PARTNERSHIP_STATUS.INACTIVE;
  const sentence = reason
    ? [
        ISSUANCE_UNAVAILABLE[reason],
        stopped && partnershipWasActive(partnership)
          ? EARLIER_ACCESS_SENTENCE
          : reason === "withdrawn" && !partnership
          ? EARLIER_ACCESS_IF_ANY_SENTENCE
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  return { allowed: reason === null, reason, sentence };
};

// ── the two badges, as two things ───────────────────────────────────────────
// Up to two items, each with its own label and its own meaning. There is no branch
// in this function that can return one merged badge, because merging them is the
// misrepresentation 2p exists to prevent. The order is deliberate: identity first,
// because a partnership is meaningless without it.
export const badgesFor = ({ entity, partnership } = {}) => {
  const out = [];
  const entityState = entity?.entity_state || ENTITY_STATE.UNCLAIMED;
  if (entityState === ENTITY_STATE.VERIFIED) {
    out.push({
      axis: "identity",
      label: GOVERNMENT_BADGE_LABEL,
      subject: entity?.name || null,
      means: GOVERNMENT_BADGE_MEANS,
      doesNotMean: GOVERNMENT_BADGE_DOES_NOT_MEAN,
    });
  }
  if (isActivePartner(partnership)) {
    out.push({
      axis: "partnership",
      label: PARTNER_LABEL,
      subject: entity?.name || partnership?.entity_name || null,
      means: PARTNER_LABEL_MEANS,
      doesNotMean: PARTNER_LABEL_DOES_NOT_MEAN,
    });
  }
  return out;
};

// ── the commercial rule ─────────────────────────────────────────────────────
// The sponsored entitlement, named once, from the same plan table the pricing page
// and the Stripe prices read. 'roadmap' is the Golden plan id: the ids predate the
// plan names and renaming them is a data migration (src/lib/plans.js).
export const SPONSORED_PLAN_ID = PLAN_IDS.GOLDEN;
export const SPONSORED_PLAN = planById(SPONSORED_PLAN_ID);

export const sponsoredValueSentence = () =>
  `${SPONSORED_PLAN?.name || "Golden"} normally costs ${formatPrice(SPONSORED_PLAN?.priceCents || 7900)}. Through this partnership it is free for residents.`;

// What sponsorship is NOT. Printed wherever a resident is told what they received,
// so nobody reads "your city paid for this" as "everything is free".
export const SPONSORSHIP_EXCLUDES = [
  "A feasibility study for your property",
  "A site plan in either version",
  "The preparation worksheets and the ADU Ready Score",
  "Consultation time or written support through the portal",
];

export const SPONSORSHIP_BOUNDARY =
  "Sponsored access covers the ADUAtlas course, the state and city resources, and builder profile access. Property work stays paid: a feasibility study, a site plan, the preparation worksheets and the ADU Ready Score are part of Platinum and Concierge, at the prices on the pricing page.";

// A sponsored resident is an ordinary homeowner who did not pay, so the upgrade
// path is the ordinary one. This says so without quoting a credit: whether the $79
// a government paid counts toward an upgrade is an open commercial question (see
// the note at the end of migration 0014), and this copy does not answer it.
export const SPONSORED_UPGRADE_COPY =
  "You can move up to Platinum or Concierge whenever you want to. The prices are on the pricing page and nothing about sponsored access changes them.";

// ── the resident entry flow ─────────────────────────────────────────────────
// A partner link is a clean per-jurisdiction URL. The path is one constant so the
// router, the portal's copy-to-clipboard and the embed snippet cannot drift:
// src/router/router.jsx builds the resident entry routes FROM this constant, so
// the url a partner copies and the route that answers it are the same string.
// It was "/go" once, with no route behind it, and every link the portal showed
// was a dead page (DEF-19). There is exactly one entry path and no alias.
export const SPONSORED_ENTRY_PATH = "/partner";
export const SPONSORED_ENTRY_KIND = { LINK: "link", CODE: "code" };

// The shapes the database validates (0014). Kept here so the page refuses an
// obviously malformed value before spending a request on it, and NEVER so the page
// decides whether a token is real: only the server knows that.
const LINK_TOKEN_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SPONSORED_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/i;

export const normaliseSponsorToken = (v) => {
  const token = typeof v === "string" ? v.trim().toLowerCase() : "";
  return token.length >= 8 && token.length <= 100 && LINK_TOKEN_RE.test(token) ? token : "";
};

export const normaliseSponsorCode = (v) => {
  const code = typeof v === "string" ? v.trim().toUpperCase() : "";
  return SPONSORED_CODE_RE.test(code) ? code : "";
};

export const sponsoredEntryPath = (token) => {
  const t = normaliseSponsorToken(token);
  return t ? `${SPONSORED_ENTRY_PATH}/${t}` : SPONSORED_ENTRY_PATH;
};

// The absolute URL a partner puts on its own web page or in a mailer.
export const sponsoredEntryUrl = (token, origin) => {
  const base =
    origin ||
    (typeof window !== "undefined" && window.location ? window.location.origin : "https://www.aduatlas.com");
  return `${String(base).replace(/\/+$/, "")}${sponsoredEntryPath(token)}`;
};

// The approved embed option (2p item 25): one anchor, no script, no iframe, nothing
// that can read the government's own page or be blamed for slowing it down. The
// link text says who pays and for whom, which is all a sponsorship is.
export const sponsoredEmbedSnippet = ({ token, entityName, origin } = {}) => {
  const url = sponsoredEntryUrl(token, origin);
  const text = entityName
    ? `Free ADU course for ${entityName} residents, sponsored by ${entityName}`
    : "Free ADU course for residents";
  return `<a href="${url}" rel="noopener">${text}</a>`;
};

// Read a sponsored entry out of a location. Both shapes are accepted because a
// partner may share either: the clean path, or a query parameter on any page.
// Returns a normalised {kind, token} or null, and never guesses: a value that does
// not match a shape the server validates is not passed on.
export const parseSponsoredEntry = (location) => {
  const loc =
    location || (typeof window !== "undefined" ? window.location : null) || { pathname: "", search: "" };
  const pathname = String(loc.pathname || "");
  const prefix = `${SPONSORED_ENTRY_PATH}/`;
  if (pathname.startsWith(prefix)) {
    const token = normaliseSponsorToken(pathname.slice(prefix.length).split("/")[0]);
    if (token) return { kind: SPONSORED_ENTRY_KIND.LINK, token };
  }
  let params = null;
  try {
    params = new URLSearchParams(String(loc.search || ""));
  } catch {
    params = null;
  }
  const code = normaliseSponsorCode(params?.get("partner") || params?.get("code") || "");
  if (code) return { kind: SPONSORED_ENTRY_KIND.CODE, token: code };
  const token = normaliseSponsorToken(params?.get("token") || "");
  if (token) return { kind: SPONSORED_ENTRY_KIND.LINK, token };
  return null;
};

// The heading and body for the resident entry page. Contextualised to the
// jurisdiction and the partnership, and worded so it does not overstate government
// endorsement: the government paid for education, and that is all it says.
export const sponsoredEntryHeading = (context) => {
  const where = context?.jurisdiction_name || null;
  return where
    ? `Free ADU course for ${where} residents`
    : "Free ADU course, sponsored by your local government";
};

export const sponsoredEntryCopy = (context) => {
  const who = context?.entity_name || "Your local government";
  const where = context?.jurisdiction_name ? ` in ${context.jurisdiction_name}` : "";
  return [
    `${who} is an ${PARTNER_LABEL}. It has paid for residents${where} to take the ADUAtlas course at no cost, so you can understand the ADU process before you spend real time and money on it.`,
    PARTNER_LABEL_DOES_NOT_MEAN,
    SPONSORSHIP_BOUNDARY,
  ];
};

export const SPONSORED_ENTRY_PRIVACY_NOTE =
  "Your account stays private. The government that sponsored this access sees how many residents took part, never who they are or anything about your property.";

// One sentence for every way a link or code can fail, because the server
// deliberately does not say which one it was: an unknown, expired, disabled,
// exhausted or suspended token all look the same from outside, so that no page can
// be used to find out which codes exist.
export const NOT_REDEEMABLE_COPY =
  "This access link or code is not available. Ask the city or agency that gave it to you for a current one.";

export const THROTTLED_COPY =
  "Too many attempts from this account. Wait a few minutes and try again, or ask the city or agency that gave you the code to check it.";

// ── reads: the partner portal ───────────────────────────────────────────────

const requireSession = async () => {
  if (!supabaseEnabled || !supabase) return { error: DISABLED.error };
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) return { error: LOGGED_OUT.error };
  return { user: data.session.user };
};

// The caller's own institution's partnership. The database returns a row only to a
// VERIFIED member of the entity, so a null result from a signed-in person means
// either no partnership or no verified membership, and the portal already knows
// which from myGovernmentContext(). A pending member sees nothing here, which is
// the honest answer: they are waiting.
//
// entityId is optional. A person may represent two entities, so a portal that has
// picked one passes it; without it this returns the first row the policy allows.
export const fetchMyPartnership = async (entityId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, partnership: null };
  let q = supabase
    .from("government_partnerships")
    .select("id, entity_id, status, requested_at, activated_at, suspended_at, created_at, updated_at");
  if (entityId) q = q.eq("entity_id", entityId);
  const { data, error } = await q.order("created_at").limit(1);
  if (error) return { ok: false, error: error.message, partnership: null };
  const row = (data || [])[0] || null;
  return {
    ok: true,
    partnership: row,
    status: partnershipStatus(row),
    active: isActivePartner(row),
  };
};

// The columns the authenticated role may read back (0014's column grant). Every
// read AND every write names them, because the grant leaves out
// created_by_app_user_id and deactivated_by_app_user_id: a bare
// return=representation insert or update asks for every column and PostgREST
// answers 403 42501 "permission denied for table".
const LINK_COLUMNS =
  "id, partnership_id, entity_id, jurisdiction_id, token, label, is_active, expires_at, max_redemptions, created_at, deactivated_at";
const CODE_COLUMNS =
  "id, partnership_id, entity_id, jurisdiction_id, code, label, is_active, expires_at, max_redemptions, created_at, deactivated_at";

// url travels with the row so no component has to rebuild it, and so the value a
// partner copies is the same string everywhere it appears.
const withUrl = (row) => (row ? { ...row, url: sponsoredEntryUrl(row.token) } : row);

export const fetchPartnerLinks = async (partnershipId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, links: [] };
  let q = supabase.from("partner_access_links").select(LINK_COLUMNS);
  if (partnershipId) q = q.eq("partnership_id", partnershipId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message, links: [] };
  return { ok: true, links: (data || []).map(withUrl) };
};

export const fetchPartnerCodes = async (partnershipId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, codes: [] };
  let q = supabase.from("partner_access_codes").select(CODE_COLUMNS);
  if (partnershipId) q = q.eq("partnership_id", partnershipId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message, codes: [] };
  return { ok: true, codes: data || [] };
};

// ── writes: the partner issues and switches off its own access (2p) ─────────
//
// These are the partner's OWN PostgREST writes, which 0014's column grants and
// row policies allow, and nothing about them is decided here:
//   • The body carries partnership_id, jurisdiction_id and a label. Those are
//     the columns the insert grant names. entity_id is not sent: the guard trigger
//     takes it from the partnership, so a partner cannot file a token under
//     another entity.
//   • The token is never sent. partner_access_guard() generates it and discards
//     whatever arrived.
//   • Attribution is never sent. created_by_app_user_id is not in the insert
//     grant, and the database stamps the issuer and writes the audit row itself,
//     so the record says who issued a token whatever this browser claims.
//   • Authority is the database's. partner_may_manage_access() refuses an insert
//     unless the partnership is ACTIVE, the identity VERIFIED, the member a
//     contributor or administrator, and the jurisdiction granted by equality.
const LABEL_MAX = 120;
const cleanLabel = (label) => {
  const text = typeof label === "string" ? label.trim().slice(0, LABEL_MAX) : "";
  return text || null;
};

const issue = async (table, columns, { partnershipId, jurisdictionId, label } = {}) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, row: null };
  if (!partnershipId || !jurisdictionId) return { ok: false, error: "missing-partnership-or-jurisdiction", row: null };
  const { data, error } = await supabase
    .from(table)
    .insert({ partnership_id: partnershipId, jurisdiction_id: jurisdictionId, label: cleanLabel(label) })
    .select(columns)
    .single();
  if (error) return { ok: false, error: error.message, errorCode: error.code || null, row: null };
  return { ok: true, row: data };
};

export const createPartnerLink = async (args) => {
  const res = await issue("partner_access_links", LINK_COLUMNS, args);
  return { ...res, link: withUrl(res.row) };
};

export const createPartnerCode = async (args) => {
  const res = await issue("partner_access_codes", CODE_COLUMNS, args);
  return { ...res, code: res.ok ? res.row : null };
};

// Switching a token off stops NEW activations through it and touches no
// resident: partner_redemptions is append-only and a switched-off token is only
// refused at the next redemption. is_active is one of the two columns the update
// grant names; the guard writes deactivated_at to match. A row the policy does
// not let this person update comes back as no row, which .single() reports as an
// error rather than as a success that changed nothing.
const switchOff = async (table, columns, id) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, row: null };
  if (!id) return { ok: false, error: "missing-id", row: null };
  const { data, error } = await supabase
    .from(table)
    .update({ is_active: false })
    .eq("id", id)
    .select(columns)
    .single();
  if (error) return { ok: false, error: error.message, errorCode: error.code || null, row: null };
  return { ok: true, row: data };
};

export const deactivatePartnerLink = async (id) => {
  const res = await switchOff("partner_access_links", LINK_COLUMNS, id);
  return { ...res, link: withUrl(res.row) };
};

export const deactivatePartnerCode = async (id) => {
  const res = await switchOff("partner_access_codes", CODE_COLUMNS, id);
  return { ...res, code: res.ok ? res.row : null };
};

// The six numbers 2p names, and nothing else. There is no user column on
// public.partner_analytics to render by accident.
export const ANALYTICS_METRICS = [
  { key: "link_visits", label: "Link visits", means: "How many times a resident opened a partnership link. Counted once a day per browser." },
  { key: "code_redemptions", label: "Code entries", means: "How many residents entered a partnership code." },
  { key: "link_redemptions", label: "Link entries", means: "How many residents arrived through a partnership link and reached the entry step." },
  { key: "sponsored_activations", label: "Sponsored activations", means: "How many residents actually received sponsored Golden access. Lower than entries when somebody already held a paid plan." },
  { key: "course_starts", label: "Course starts", means: "How many sponsored residents started the course." },
  { key: "course_completions", label: "Course completions", means: "How many sponsored residents finished it." },
];

export const ANALYTICS_PRIVACY_NOTE =
  "These are counts. ADUAtlas does not show a partner which residents took part, their contact details, their address or anything about their property.";

// The metrics as display rows. course starts and completions carry `measured`,
// which is false until ADUAtlas records a single course event anywhere. A zero that
// nobody measured is not "no resident started", and a partner dashboard printing it
// as though it were would be the 2b mistake on a city's own numbers.
export const analyticsMetrics = (analytics) =>
  ANALYTICS_METRICS.map((m) => {
    const measured =
      m.key === "course_starts" || m.key === "course_completions"
        ? Boolean(analytics?.course_progress_instrumented)
        : true;
    const value = Number(analytics?.[m.key] ?? 0);
    return {
      ...m,
      value: measured ? value : null,
      measured,
      text: measured ? value.toLocaleString("en-US") : "Not measured yet",
    };
  });

export const fetchPartnerAnalytics = async (partnershipId) => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, analytics: null, metrics: [] };
  let q = supabase
    .from("partner_analytics")
    .select(
      "partnership_id, entity_id, entity_name, entity_type, partnership_status, activated_at, active_links, active_codes, link_visits, code_redemptions, link_redemptions, sponsored_activations, course_starts, course_completions, course_progress_instrumented"
    );
  if (partnershipId) q = q.eq("partnership_id", partnershipId);
  const { data, error } = await q.limit(1);
  if (error) return { ok: false, error: error.message, analytics: null, metrics: [] };
  const row = (data || [])[0] || null;
  return { ok: true, analytics: row, metrics: analyticsMetrics(row) };
};

// ── the public badge ────────────────────────────────────────────────────────
// One row per entity, so a false is an answer rather than a missing row. Render it
// beside the identity badge from src/lib/regulatory.js, never instead of it.
export const fetchPublicPartnership = async (entityId) => {
  if (!supabaseEnabled || !supabase) return { ok: false, error: DISABLED.error, partnership: null };
  const { data, error } = await supabase
    .from("government_partnerships_public")
    .select("id, entity_id, entity_name, entity_type, jurisdiction_id, is_education_partner, partner_since")
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, partnership: null };
  return { ok: true, partnership: data || null, isEducationPartner: Boolean(data?.is_education_partner) };
};

export const fetchPublicPartnerships = async (entityIds) => {
  if (!supabaseEnabled || !supabase) return { ok: false, error: DISABLED.error, byEntityId: {} };
  const ids = (entityIds || []).filter(Boolean);
  if (!ids.length) return { ok: true, byEntityId: {} };
  const { data, error } = await supabase
    .from("government_partnerships_public")
    .select("id, entity_id, entity_name, entity_type, jurisdiction_id, is_education_partner, partner_since")
    .in("entity_id", ids);
  if (error) return { ok: false, error: error.message, byEntityId: {} };
  const byEntityId = {};
  for (const row of data || []) byEntityId[row.entity_id] = row;
  return { ok: true, byEntityId };
};

// ── the resident's own sponsorship ──────────────────────────────────────────
// Their own attribution and nobody else's: who sponsored their access and when.
// Used on the entry confirmation and in the portal, so a resident can see the
// partnership behind their access even after it has ended.
export const mySponsoredAccess = async () => {
  const session = await requireSession();
  if (session.error) return { ok: false, error: session.error, sponsorship: null };
  const { data, error } = await supabase.rpc("my_sponsored_access");
  if (error) return { ok: false, error: error.message, sponsorship: null };
  return { ok: true, sponsorship: data || null, sponsored: Boolean(data) };
};

// ── writes: everything goes through the endpoint ────────────────────────────
//
// THE ONE RULE OF THIS SECTION. The browser sends a token and nothing else. It
// never sends an account id, an email, a tier, a plan, a price or a partnership
// id, because /api/partner-redeem resolves the signed-in person from the request's
// own session and takes the tier from the database. A payload that named the
// account would be a way to hand somebody else's account an entitlement, and a
// payload that named a plan would be the tier coming from the request.
const postEntry = async (body) => {
  if (typeof fetch !== "function") return { ok: false, error: "no-fetch" };
  let session = null;
  try {
    const { data } = (await supabase?.auth?.getSession?.()) || {};
    session = data?.session || null;
  } catch {
    session = null;
  }
  const headers = { "Content-Type": "application/json" };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  try {
    const res = await fetch("/api/partner-redeem", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (res.status === 204) return { ok: true };
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: payload?.error || `http-${res.status}`,
        message: payload?.message || null,
        throttled: res.status === 429 || Boolean(payload?.throttled),
      };
    }
    return { ok: true, ...(payload || {}) };
  } catch {
    return { ok: false, error: "network" };
  }
};

// What the entry page may show before anybody signs in: the partner, the
// jurisdiction and the plan. LINKS ONLY. A code is never resolved for display.
export const fetchSponsoredEntryContext = async (token) => {
  const t = normaliseSponsorToken(token);
  if (!t) return { ok: false, error: "not-redeemable", context: null };
  const res = await postEntry({ action: "context", token: t });
  if (!res.ok) return { ok: false, error: res.error, context: null };
  return { ok: true, context: res.context || null };
};

// One visit a day per browser, recorded server side. Fire and forget: a missing
// endpoint, a blocked request or a link that is no longer live costs the count and
// nothing else, and the resident never sees it.
export const recordSponsoredEntryVisit = (token, sessionId) => {
  const t = normaliseSponsorToken(token);
  if (!t) return;
  postEntry({ action: "visit", token: t, sid: sessionId || null }).catch(() => {});
};

// Redeem a link or a code for the signed-in resident.
//
// The result distinguishes the four things that can happen, because they are four
// different sentences to a homeowner and only one of them is a problem:
//   granted          sponsored Golden access is now on the account
//   already          nothing changed because this account already has access
//   needs_review     ADUAtlas has to look at the account; nothing was changed
//   not redeemable   the link or code is not available; one message, no detail
export const redeemSponsoredAccess = async ({ kind, token } = {}) => {
  const useCode = kind === SPONSORED_ENTRY_KIND.CODE;
  const value = useCode ? normaliseSponsorCode(token) : normaliseSponsorToken(token);
  if (!value) {
    return {
      ok: false,
      granted: false,
      error: "not-redeemable",
      message: NOT_REDEEMABLE_COPY,
    };
  }
  const session = await requireSession();
  if (session.error) return { ok: false, granted: false, error: session.error };
  const res = await postEntry({
    action: "redeem",
    kind: useCode ? SPONSORED_ENTRY_KIND.CODE : SPONSORED_ENTRY_KIND.LINK,
    token: value,
  });
  if (!res.ok) {
    return {
      ok: false,
      granted: false,
      error: res.error,
      throttled: Boolean(res.throttled),
      message: res.message || NOT_REDEEMABLE_COPY,
    };
  }
  return {
    ok: true,
    granted: Boolean(res.granted),
    already: Boolean(res.already),
    outcome: res.outcome || null,
    plan: res.plan || null,
    sponsoredBy: res.entity_name || null,
    jurisdiction: res.jurisdiction_name || null,
    message: res.message || null,
  };
};
