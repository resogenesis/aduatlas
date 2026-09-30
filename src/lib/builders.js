// Builder directory, both sides.
//
// THE PUBLIC PROFILE is one builder's page, readable by anyone and by a
// crawler, defined by the anon-safe view builders_public_profile (0007) and read
// through fetchPublicBuilder below. It carries who the company is, where it
// works, what it builds and its own website, and imagery only for a listing the
// company has claimed. No contact email, no phone, nothing commercial or
// internal. Everything else about the directory is paid.
//
// ONE PROFILE IS PUBLIC; THE DIRECTORY IS NOT (0015, decision 2a). anon holds no
// grant on builders_public_profile any more and reads one row at a time by slug
// through get_public_builder(). The only other anonymous builder read is
// get_featured_builders(), capped at six rows. Nothing anonymous returns the set,
// because "an individual builder profile page is public and indexable" and "the
// directory as a whole is never publicly browsable" are one decision.
//
// HOMEOWNER reads go through the restricted view builders_public (migration
// 0006, one column added in 0007: verified, one more in 0010: claimed):
// approved, active builders, directory columns only, for paid homeowners. Before
// 0010 the view has no `claimed` column and before 0007 no `verified` column, so
// a read retries with the older column lists; before 0006 the view does not
// exist and the read falls back to the 0005 table select with
// HOMEOWNER_BUILDER_COLUMNS. The app keeps working on every schema. Saves and
// introduction requests write only the homeowner's own rows.
//
// CONTACT DETAILS ARE GATED ON THE CLAIM (0010, decision 2d), never on the plan.
// An unclaimed listing's email and phone are hidden from everyone, a paying
// homeowner included, because ADUAtlas compiled that record from public material
// and nobody at the company agreed to receive the traffic. A claimed listing may
// show them to a paid homeowner. An anonymous visitor never gets them either
// way: builders_public_profile has never carried the columns. canShowContact
// below is the client twin of the view's condition and FAILS CLOSED, so a row
// whose ownership is not stated (an older schema, or the paid directory
// fallback) shows no contact details rather than guessing at one.
//
// AN INTRODUCTION REQUEST ALSO REACHES A HUMAN. requestIntro writes the
// intro_requests row, which is the record, and then notifies the ADUAtlas
// operations inbox, because a request nobody reads is not an introduction. An
// admin forwards it to the builder from the console
// (api/admin/builders/intro-forward), and the homeowner's contact details are
// never in that forward: decision 8 gives them to a builder only if the
// homeowner volunteers them. The notification is best effort and cannot cost
// anyone their request.
//
// BUILDER (role "pro") calls go through security-definer RPCs that find the
// caller's OWN row through owner_user_id: my_builder, save_my_builder,
// submit_my_builder, my_referral_stats and, from 0007, claim_my_builder. A
// builder never reads anything about a homeowner here; the stats are
// aggregate counts.
//
// TWO KINDS OF LISTING (0007). UNCLAIMED: seeded by ADUAtlas, approved, no
// owner, no referral link, no analytics, no badge. CLAIMED: a builder account
// has taken the row over (claim code, or an admin linked the account).
// Claiming turns tracking on: a referral code resolves, and visits, email
// captures and purchases are attributed, only while the row is claimed AND
// approved (isTrackingActive below mirrors builder_tracking_active in SQL).
// The badge is a separate admin step after the claim, it reads "Verified on
// ADUAtlas" (decision 2e), and it means only "profile claimed and business
// information verified by ADUAtlas"; never "Certified". FOUR STATES, kept
// distinct and never blurred: unclaimed, claimed but not verified, verified,
// and a relationship type of affiliate or partner, which on its own is NOT
// verification and never appears on a homeowner surface at all
// (relationship_type is in neither public view).
// Affiliates keep their own terms and may use their own tracking link
// (referralLinkFor); the standard fee does not apply to them. The commercial
// relationship is never shown to a homeowner and is not in either public view.
//
// UNKNOWN MEANS UNKNOWN (0008). turnkey and build_approach are null when the
// company never stated it. Null is not an answer and must never be printed as
// one: isTurnkeyKnown and isApproachKnown below say whether there is anything
// to show, and a surface with nothing to show omits the attribute.
//
// SOURCED FACTS, PUBLISHED PRICING AND WHO A COMPANY BUILDS FOR (0017,
// decisions 2f and 2b). Three more things the record carries, all of them
// maintained in Amy's console and nowhere else.
//   source_urls, sources_checked_on   the pages of the COMPANY'S OWN site a fact
//     on the record came from, and when ADUAtlas last read them. The Arizona
//     research read them for all 96 companies and the schema had nowhere to put
//     them, so the evidence was discarded at import; a regulatory fact already
//     carries its provenance under 2l and a builder fact now does too. A null
//     checked date is "never recorded", not "checked today".
//   pricing_note, pricing_source_url  what the COMPANY ITSELF publishes about
//     price, in its own words, with the page it was published on. Never an
//     ADUAtlas estimate, never a figure derived from a build method, never a
//     range carried over from another company. No note means no price was
//     established, which is not "free", not $0 and not "contact for pricing".
//     It is also NOT the recorded ADUAtlas terms from 0006 ($49 a month, $500 a
//     signed project): those are what ADUAtlas charges the BUILDER.
//   serves_residential, serves_commercial  tri-state for exactly the reason
//     turnkey is. null is "the company never said"; false is the company saying
//     no. A NOT NULL boolean defaulting to false would have manufactured an
//     answer for every company ADUAtlas researched, which is the defect 0008
//     fixed once already.
// hasPricing, isResidentialKnown and isCommercialKnown below are the ONE
// definition of "known" for these three, so no surface has to invent its own
// truthiness test; a surface with nothing to show omits the attribute, exactly
// as it does for turnkey. All six columns are service-role writable only and
// none of the column lists below asks for them, so no homeowner or anonymous
// read returns them: the console reads the builders table through the service
// role. If a later view exposes one, the caller renders it only where the
// helper says it is known and omits it otherwise.
//
// The principle from the 2026-09-24 call: ADUAtlas helps the homeowner find
// the right builder; it does not sell open access to the homeowner.
import { supabase, supabaseEnabled } from "./supabase";
import { sendEmail, TEMPLATES } from "./email";

const BUCKET = "builders";
const PUBLIC_VIEW = "builders_public";
const PUBLIC_PROFILE_VIEW = "builders_public_profile";
const MAX_SUGGESTIONS = 5;

export const SPECIALTY_LABELS = {
  detached: "Detached ADU",
  attached: "Attached ADU",
  garage_conversion: "Garage conversion",
  jadu: "Interior / JADU",
  prefab: "Prefab / factory-built",
  two_story: "Two-story / above garage",
};
export const SERVICE_TYPE_LABELS = {
  design_build: "Design-build",
  general_contractor: "General contractor",
  prefab_manufacturer: "Prefab manufacturer",
  architect: "Architect / designer",
  permit_expediter: "Permit expediter",
};
export const APPROACH_LABELS = { custom: "Custom builds", prefab: "Prefab only", both: "Custom and prefab" };
export const BUILD_METHOD_LABELS = {
  site_built: "Site built",
  modular: "Modular",
  manufactured: "Manufactured or factory built",
  panelized: "Panelized",
  kit: "Kit",
};
export const PROFILE_STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending review",
  approved: "Approved",
  inactive: "Inactive",
};
// Commercial relationship on the builder row (0007). Marketplace follows the
// standard recorded terms; an affiliate follows its own agreement and may use
// its own tracking link; partner is an agreed arrangement recorded in free
// text. Nobody is forced into one model.
export const RELATIONSHIP_LABELS = {
  marketplace: "Marketplace",
  affiliate: "Affiliate",
  partner: "Partner",
};
// The one sentence that explains the turnkey flag, shared by the admin form,
// the builder profile editor and the homeowner-facing pages so the meaning
// never drifts between surfaces.
export const TURNKEY_HELP = "Takes the project end to end, from selection and design through the build.";
// A tri-state answer, in words, keyed by the value a form control carries (0017,
// decision 2b). "" is the absence of an answer, which is what null means in the
// column; it is a THIRD option and never a cleared checkbox, because a checkbox
// has two states and cannot tell "they told us no" from "nobody ever asked".
// serves_residential, serves_commercial and turnkey all read these three words:
// two attributes of the same kind worded differently would read as two different
// kinds of fact.
export const SERVES_LABELS = { "": "Not stated", yes: "Yes", no: "No" };
// The badge, decision 2e. Three strings, one place, every surface: the profile,
// the paid directory card, the builder's own dashboard and the admin console all
// read these rather than writing the words again.
//
// VERIFIED_BADGE_LABEL is the badge itself. It reads "Verified on ADUAtlas" and
// not "Verified", because the bare word invites a homeowner to read a general
// endorsement into a narrow check of business information.
// VERIFIED_HELP is what the check covers. VERIFIED_LIMITS is what it does not,
// spelled out rather than implied: the spec forbids any sentence near the badge
// that suggests ADUAtlas certifies the work.
export const VERIFIED_BADGE_LABEL = "Verified on ADUAtlas";
export const VERIFIED_HELP = "Profile claimed and business information verified by ADUAtlas";
export const VERIFIED_LIMITS =
  "It does not mean ADUAtlas has judged construction quality, workmanship, licensing beyond what was checked, financial condition or project performance.";

// Claim codes and referral codes share one alphabet: 8 chars from
// A-HJ-NP-Z2-9 (no 0/O/1/I). Mirrors the check constraints in 0005 and 0007.
export const CLAIM_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

// Raw event kinds in public.referral_events (0006). Stages are derived in
// reporting, never stored; "qualified lead" is deliberately not a concept here.
export const EVENT_KINDS = ["link_visited", "email_captured", "account_created", "package_purchased", "package_refunded", "builder_profile_viewed", "builder_contacted", "project_signed"];
export const EVENT_KIND_LABELS = {
  link_visited: "Referral link clicks",
  email_captured: "Emails captured",
  account_created: "Sign ups",
  package_purchased: "Purchases",
  package_refunded: "Refunds",
  builder_profile_viewed: "Profile views",
  builder_contacted: "Homeowner inquiries",
  project_signed: "Signed projects",
};

// A builder's share link. The code is generated by ADUAtlas on approval and
// never chosen or rotated by the builder.
export const REFERRAL_BASE_URL = "https://aduatlas.com/?ref=";
export const referralLink = (code) => (code ? `${REFERRAL_BASE_URL}${code}` : null);

// ── listing state helpers (0007) ────────────────────────────────────────────
// These read whichever row shape the caller has: a builders_public row (has
// `verified`, no owner or dates), the owner's own row from my_builder(), or
// the admin's full row.

// A builder account owns the row. Read from whichever shape the caller has:
// `claimed` on a row from builders_public (0010) or builders_public_profile
// (0009), owner_user_id on the owner's own row or the admin's full row. Neither
// field says WHO owns it.
export const isClaimed = (b) => (typeof b?.claimed === "boolean" ? b.claimed : Boolean(b?.owner_user_id));

// Whether the row states ownership at all. False for a record from a database
// without 0009 or 0010 and for the paid directory fallback read, which selects
// from the table and carries neither column. A caller that gets false knows
// nothing either way and must not assert either way.
export const isClaimKnown = (b) => typeof b?.claimed === "boolean" || b?.owner_user_id != null;

// The client twin of the contact condition in 0010, decision 2d: email and
// phone belong to a CLAIMED listing. It fails closed on purpose. Unknown
// ownership shows no contact details, because the failure to withhold is the
// one that cannot be taken back: it hands out a company's inbox and phone line
// on the strength of a $79 purchase and a scraped web page.
//
// This is belt and braces. The view already withholds the values, so on a
// database with 0010 there is nothing to hide; this stops the paid fallback
// read (which selects the table columns directly on an older schema) from
// rendering what the view would have withheld.
export const canShowContact = (b) => isClaimKnown(b) && isClaimed(b);

// The client twin of builder_tracking_active(b) in 0007: claimed and
// approved. The server is the authority; this only decides what to show.
export const isTrackingActive = (b) => Boolean(b?.owner_user_id) && b?.profile_status === "approved";

// The Verified badge. builders_public computes `verified` server-side (claimed
// and checked); a full row is read the same way, so a listing whose account
// is gone is not shown as Verified even if verified_at is still set.
export const isVerified = (b) => {
  if (!b) return false;
  if (typeof b.verified === "boolean") return b.verified;
  return Boolean(b.verified_at) && Boolean(b.owner_user_id);
};

// ── unknown means unknown (0008) ────────────────────────────────────────────
// ADUAtlas seeds listings from a company's own public material. Where that
// material did not state something, the column is null and there is nothing to
// print. These two say whether an answer exists; they are false for null and
// for a row that predates the column. A caller that gets false omits the
// attribute rather than showing No, Not listed or a dash.
export const isTurnkeyKnown = (b) => typeof b?.turnkey === "boolean";
export const isApproachKnown = (b) => typeof b?.build_approach === "string" && b.build_approach !== "";

// The same question for the 0017 attributes. serves_residential and
// serves_commercial are NULLABLE booleans, so `if (b.serves_residential)` would
// print "no" over a company nobody has asked: ask whether there is an answer
// before reading one. Both are false for a row from a database without 0017,
// which carries no such key and therefore states nothing either way.
export const isResidentialKnown = (b) => typeof b?.serves_residential === "boolean";
export const isCommercialKnown = (b) => typeof b?.serves_commercial === "boolean";
// Pricing exists only where the COMPANY established it (decision 2b). Absent,
// empty and whitespace all mean not established, and nothing downstream may turn
// that into "contact for pricing", "from $0" or a range guessed from a build
// method. pricing_source_url on its own establishes nothing: the note is the
// claim, the URL is where the claim was published.
export const hasPricing = (b) => typeof b?.pricing_note === "string" && b.pricing_note.trim() !== "";

// An affiliate that brought its own tracking link. Its clicks are counted by
// the partner program, not by ADUAtlas, and the dashboard says so.
export const usesExternalTracking = (b) => b?.relationship_type === "affiliate" && Boolean(b?.external_tracking_url);

// The link a builder shares: an affiliate's own link when it has one, else
// the ADUAtlas referral link while tracking is active (claimed, approved and
// not switched off by an admin: the same `active` guard the server lookups
// keep), else null. An unclaimed listing never gets a link.
export const referralLinkFor = (b) => {
  if (!b) return null;
  if (usesExternalTracking(b)) return b.external_tracking_url;
  if (!isTrackingActive(b) || b.active === false) return null;
  return referralLink(b.referral_code);
};

export const publicUrl = (path) => {
  if (!supabaseEnabled || !path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

const myAppUserId = async () => {
  if (!supabaseEnabled) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  return data?.id || null;
};

// PostgREST reports a relation that is not in its schema cache as PGRST205;
// older versions surfaced Postgres's own 42P01. A missing column in a select
// is Postgres's 42703 (PGRST204 for a body). A missing RPC is PGRST202 or
// 42883. All of them mean "a migration is not applied yet", never a user
// error.
const isMissingRelation = (error) => Boolean(error) && (error.code === "42P01" || error.code === "PGRST205");
const isMissingColumn = (error) => Boolean(error) && (error.code === "42703" || error.code === "PGRST204");
const isMissingFunction = (error) => Boolean(error) && (error.code === "42883" || error.code === "PGRST202");
const rpcError = (error) => (isMissingFunction(error) ? "not-available" : error.message);

// The directory columns exposed by builders_public as of 0006, verbatim.
// Nothing from the contact-name, account, referral, tracking, commercial or
// admin side of the record is in the view, so nothing here can ask for it.
export const PUBLIC_VIEW_COLUMNS_0006 = [
  "id", "slug", "name", "description", "logo_path", "website", "external_link",
  "contact_email", "contact_phone", "state", "city", "cities", "service_zips", "service_states",
  "specialties", "service_types", "build_approach", "build_methods", "turnkey", "licensed_states",
  "photos", "videos", "featured", "created_at",
].join(", ");

// 0007 added the Verified flag. Still nothing about the claim code, the claim
// date, who verified, an affiliate's own tracking link, or the commercial
// relationship. relationship_type is the arrangement between ADUAtlas and the
// company; no homeowner surface reads it, so it is not in the view and not asked
// for here.
export const PUBLIC_VIEW_COLUMNS_0007 = `${PUBLIC_VIEW_COLUMNS_0006}, verified`;

// The current view (0010): the same columns, with contact_email and
// contact_phone now null unless the listing is claimed, plus `claimed` itself so
// the directory card and the profile can tell the two kinds of listing apart
// (decisions 2d and 2e). `claimed` is a boolean about the listing and says
// nothing about who owns it.
export const PUBLIC_VIEW_COLUMNS = `${PUBLIC_VIEW_COLUMNS_0007}, claimed`;

// The PUBLIC builder profile page (builders_public_profile, 0007 plus `claimed`
// from 0009), verbatim. Everything a visitor who has not paid may see about one
// company. logo_path and photos come back empty for a listing the company has
// not claimed, which the view decides, not this list. `claimed` says only that
// a builder account owns the row, never who owns it: the public page needs it to
// state where an unclaimed listing came from (decision 2a).
export const PUBLIC_PROFILE_COLUMNS = [
  "id", "slug", "name", "description", "state", "city", "cities", "service_states",
  "specialties", "service_types", "build_methods", "build_approach", "turnkey",
  "licensed_states", "website", "verified", "logo_path", "photos", "claimed",
].join(", ");

// Fallback for a database that has 0005 but not 0006: the column-level SELECT
// grant from 0005, verbatim. referral_code is deliberately absent, and
// Postgres rejects `select *` under column-level privileges, so the read must
// name its columns. Rows from this path have none of the 0006 or 0007 fields;
// every consumer below treats them as empty.
export const HOMEOWNER_BUILDER_COLUMNS = [
  "id", "slug", "name", "description", "logo_path", "website", "external_link",
  "contact_email", "contact_phone", "state", "cities", "service_zips", "specialties",
  "service_types", "build_approach", "photos", "videos", "active", "featured",
  "created_at", "updated_at",
].join(", ");

// One homeowner read, four schemas. `build(table, columns, legacy)` returns the
// query; it runs against the 0010 view first, again without `claimed` when that
// column does not exist yet, again with the 0006 column list when `verified`
// does not either, and against the 0005 table (with `legacy` set so the caller
// can add the `active` filter the view applies itself) when the view does not
// exist at all. A row from any of the older shapes carries no `claimed`, so
// canShowContact withholds contact details on it: the same answer the 0010 view
// gives for an unclaimed listing, on a schema that cannot tell us which it is.
const readDirectory = async (build) => {
  let { data, error } = await build(PUBLIC_VIEW, PUBLIC_VIEW_COLUMNS, false);
  if (isMissingColumn(error)) ({ data, error } = await build(PUBLIC_VIEW, PUBLIC_VIEW_COLUMNS_0007, false));
  if (isMissingColumn(error)) ({ data, error } = await build(PUBLIC_VIEW, PUBLIC_VIEW_COLUMNS_0006, false));
  if (isMissingRelation(error)) ({ data, error } = await build("builders", HOMEOWNER_BUILDER_COLUMNS, true));
  return { data, error };
};

// Directory. Filtering happens client-side on the (small) approved set so the
// search box feels instant.
export const fetchBuilders = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled", items: [] };
  const { data, error } = await readDirectory((table, columns, legacy) => {
    let q = supabase.from(table).select(columns);
    if (legacy) q = q.eq("active", true);
    return q.order("featured", { ascending: false }).order("name");
  });
  if (error) return { ok: false, error: error.message, items: [] };
  return { ok: true, items: data || [] };
};

export const fetchBuilder = async (slug) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await readDirectory((table, columns) => supabase.from(table).select(columns).eq("slug", slug).maybeSingle());
  if (error) return { ok: false, error: error.message };
  return { ok: true, builder: data || null };
};

// One builder's PUBLIC page, for anyone: signed out, signed in and unpaid, or
// a crawler. The row can only ever hold the public fields, so nothing has to be
// stripped here.
//
// THE ANONYMOUS READ IS ONE ROW, BY SLUG (migration 0015, decision 2a). anon no
// longer holds SELECT on builders_public_profile: a view that hands an anonymous
// caller every live listing, filterable, IS the browsable directory that 2a says
// never exists publicly, whatever this app chooses to render. So the read goes
// through get_public_builder(), which returns the same row the view defines, one
// at a time, the way get_featured_builders() has served the anonymous featured
// strip since 0007. There is deliberately no anonymous call here that returns a
// set.
//
// The direct view read stays behind it as the fallback for a database that does
// not have 0015 yet, so the page keeps working on every schema. `builder` is
// null when the slug matches no active approved listing; `error` is
// "not-available" when neither surface exists, so the page can say so instead of
// showing a database message. turnkey and build_approach may be null: ask
// isTurnkeyKnown / isApproachKnown before rendering either.
export const fetchPublicBuilder = async (slug) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled", builder: null };
  if (!slug) return { ok: true, builder: null };
  const { data, error } = await supabase.rpc("get_public_builder", { p_slug: slug });
  if (!error) {
    // A set-returning function comes back as an array of at most one row.
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, builder: row || null };
  }
  // Anything other than "0015 is not applied yet" is reported as itself: a
  // permission error must never be retried as a wider read.
  if (!isMissingFunction(error)) return { ok: false, error: error.message, builder: null };
  const legacy = await supabase
    .from(PUBLIC_PROFILE_VIEW)
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (legacy.error) {
    return {
      ok: false,
      error: isMissingRelation(legacy.error) ? "not-available" : legacy.error.message,
      builder: null,
    };
  }
  return { ok: true, builder: legacy.data || null };
};

export const fetchFeaturedBuilders = async () => {
  if (!supabaseEnabled) return [];
  const { data, error } = await supabase.rpc("get_featured_builders");
  return error ? [] : data || [];
};

export const fetchSaved = async () => {
  if (!supabaseEnabled) return new Set();
  const { data } = await supabase.from("saved_builders").select("builder_id");
  return new Set((data || []).map((r) => r.builder_id));
};

export const toggleSaved = async (builderId, saved) => {
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const q = saved
    ? supabase.from("saved_builders").delete().eq("user_id", userId).eq("builder_id", builderId)
    : supabase.from("saved_builders").insert({ user_id: userId, builder_id: builderId });
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true, saved: !saved };
};

export const fetchMyIntros = async () => {
  if (!supabaseEnabled) return [];
  const { data } = await supabase.from("intro_requests").select("id, builder_id, status, created_at");
  return data || [];
};

// Records that the signed-in homeowner viewed or contacted a builder
// (log_builder_event, 0006). The server accepts only those two kinds, counts
// one a day per builder, and ignores builder accounts. These two events are
// recorded for ANY approved listing, claimed or not: they are outreach data
// and no link is involved. Best effort: a failure (including "0006 not
// applied yet") is swallowed and never reaches the UI.
export const logBuilderEvent = async (builderId, kind) => {
  if (!supabaseEnabled || !builderId || !kind) return;
  try {
    await supabase.rpc("log_builder_event", { p_builder_id: builderId, p_kind: kind });
  } catch {
    // best effort only
  }
};

// The template name belongs to the AUTH map in api/send-email.js. TEMPLATES is
// the frontend's copy of that list and is used when it carries this entry, so
// the two cannot drift apart.
const INTRO_REQUEST_OPS = TEMPLATES.INTRO_REQUEST_OPS || "intro-request-ops";

// The company name for the notification's subject line, so the nudge says which
// builder without an admin having to open the row to find out. The paid
// directory view is the only place this asks, and it is allowed to come back
// with nothing: an older schema, or a homeowner the view does not cover, simply
// means the notification names the introduction and not the company.
const builderNameById = async (builderId) => {
  if (!supabaseEnabled || !builderId) return "";
  try {
    const { data } = await supabase.from(PUBLIC_VIEW).select("name").eq("id", builderId).maybeSingle();
    return data?.name || "";
  } catch {
    return "";
  }
};

// Tells ADUAtlas a new introduction is waiting, so one does not sit unseen in
// the console until somebody happens to look. The recipient is the FIXED
// operations address the server holds: no `to` is passed, and one would be
// ignored, so this cannot be aimed at anybody else.
//
// What travels is the introduction's id and the company's name. The homeowner's
// words are NOT in it: the message is in the console row, which is what an admin
// acts on, and an email that does not carry it cannot leak it (decision 8). The
// field names are the ones the intro-request-ops template reads.
//
// Best effort, exactly as the refund flow treats its own ops mail: the
// intro_requests row is the record and it is already written, so a failure here
// is logged and never reaches the caller.
const notifyIntroRequested = async ({ introId, builderId }) => {
  try {
    const builderName = await builderNameById(builderId);
    const sent = await sendEmail({ template: INTRO_REQUEST_OPS, data: { introId, builderName } });
    if (!sent.ok) console.error("intro request ops notification failed:", sent.error);
  } catch (err) {
    console.error("intro request ops notification failed:", err.message);
  }
};

// The homeowner asks for an introduction, which is the only way a conversation
// with a builder ever starts (decision 8). The row is what ADUAtlas works from;
// the notification above is a nudge on top of it and is allowed to fail without
// costing the homeowner their request, so what this returns does not depend on
// it. A second request for the same builder hits the unique constraint and is
// reported as "already-requested".
export const requestIntro = async (builderId, message) => {
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const note = (message || "").slice(0, 2000);
  const { data, error } = await supabase
    .from("intro_requests")
    .insert({ user_id: userId, builder_id: builderId, message: note || null })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "already-requested" : error.message };
  await logBuilderEvent(builderId, "builder_contacted");
  await notifyIntroRequested({ introId: data?.id || "", builderId });
  return { ok: true, intro: data };
};

const wantsTurnkey = (v) => v === true || v === "yes" || v === "true";

// Directory filter. Order of the controls follows the call: State, then ADU
// type, then Turnkey, then the builder (search); Licensed state and Build
// method sit alongside. A state matches a builder's home state or any state
// in its service area; a licensed state matches licensed_states only.
//
// Turnkey-only keeps turnkey === true and nothing else. A company that stated
// No is out, and so is a company that never stated it: an unknown is not a
// quiet yes. Build approach works the same way, since a null approach matches
// neither the approach asked for nor "both".
export const filterBuilders = (items, { q = "", state = "", specialty = "", approach = "", turnkey, licensedState = "", buildMethod = "" } = {}) => {
  const needle = q.trim().toLowerCase();
  const st = (state || "").toUpperCase();
  const lic = (licensedState || "").toUpperCase();
  const turnkeyOnly = wantsTurnkey(turnkey);
  return items.filter((b) => {
    if (st && b.state !== st && !(b.service_states || []).includes(st)) return false;
    if (specialty && !(b.specialties || []).includes(specialty)) return false;
    if (turnkeyOnly && b.turnkey !== true) return false;
    if (lic && !(b.licensed_states || []).includes(lic)) return false;
    if (buildMethod && !(b.build_methods || []).includes(buildMethod)) return false;
    if (approach && b.build_approach !== "both" && b.build_approach !== approach) return false;
    if (!needle) return true;
    const hay = [b.name, b.state, b.city, ...(b.cities || []), ...(b.service_zips || [])].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  });
};

// Rank builders for a homeowner's property: same state or service state,
// then city or ZIP match, then the desired ADU type, then turnkey when the
// homeowner wants it and a license in the project's state. At most five.
//
// Only relevance signals decide whether a builder is suggested at all. A
// featured builder with nothing in common with the property is not a
// suggestion for it; featured only breaks ties among builders that already
// match, so a paid placement never shows up under "Suggested for <city>" on
// placement alone.
//
// Turnkey scores only on turnkey === true. A company that never stated it
// scores nothing for it, the same as a company that stated No: an unknown
// earns no credit and costs none.
export const suggestForProperty = (items, { state, city, zip, aduType, turnkey } = {}) => {
  const type = (aduType || "").toLowerCase();
  const wanted = type.includes("garage") ? "garage_conversion" : type.includes("attach") ? "attached" : type.includes("prefab") || type.includes("modular") ? "prefab" : type.includes("jadu") || type.includes("interior") ? "jadu" : type.includes("detach") ? "detached" : null;
  const st = (state || "").toUpperCase();
  const turnkeyWanted = wantsTurnkey(turnkey);
  return items
    .map((b) => {
      let score = 0;
      if (st && (b.state === st || (b.service_states || []).includes(st))) score += 3;
      if (city && (b.cities || []).some((c) => c.toLowerCase() === city.toLowerCase())) score += 3;
      if (zip && (b.service_zips || []).some((z) => zip.startsWith(z))) score += 3;
      if (wanted && (b.specialties || []).includes(wanted)) score += 2;
      if (turnkeyWanted && b.turnkey === true) score += 2;
      if (st && (b.licensed_states || []).includes(st)) score += 2;
      return { b, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || Number(Boolean(y.b.featured)) - Number(Boolean(x.b.featured)) || (x.b.name || "").localeCompare(y.b.name || ""))
    .slice(0, MAX_SUGGESTIONS)
    .map((x) => x.b);
};

// "1247 Mulberry Ln, Pasadena, CA 91103" -> { city, state, zip }
export const parseAddress = (address = "") => {
  const m = address.match(/,\s*([^,]+?),\s*([A-Z]{2})\b\s*(\d{5})?/i);
  if (!m) return {};
  return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] || "" };
};

// ── Builder portal (role "pro") ─────────────────────────────────────────────
// Every call below resolves the caller's own builder row server-side. The
// row comes back without commercial_terms, admin_notes or claim_code, and
// (0007) with claimed_at, verified_at, relationship_type and
// external_tracking_url: the owner may see their own affiliate link. `error`
// is "not-available" when the migration behind the call is not applied yet,
// otherwise the server's plain English message (for example "company name is
// required").

// { ok, builder } where builder is null when the account has no profile yet.
export const fetchMyBuilder = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled", builder: null };
  const { data, error } = await supabase.rpc("my_builder");
  if (error) return { ok: false, error: rpcError(error), builder: null };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, builder: row || null };
};

// Takes over a seeded listing with the code from ADUAtlas's invitation
// (claim_my_builder, 0007). The caller must be a builder account that owns no
// profile yet. On success the listing is theirs, its status is unchanged (an
// approved listing is live and tracked at once) and Verified is still the
// admin's step. A wrong code and a used code produce the same server message,
// "invalid or already used claim code"; a code that is not even the right
// shape gets that message here without a round trip.
export const claimMyBuilder = async (code) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const p_code = String(code || "").trim().toUpperCase();
  if (!CLAIM_CODE_RE.test(p_code)) return { ok: false, error: "invalid or already used claim code" };
  const { data, error } = await supabase.rpc("claim_my_builder", { p_code });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, builder: data };
};

// Creates the profile as a draft on first save (name and state required) or
// updates it. Only these keys are read; anything else in the patch is ignored:
//   name, description, address_line, city, state, zip, contact_name,
//   contact_email, contact_phone, website, external_link, cities,
//   service_zips, service_states, specialties, service_types, build_approach,
//   build_methods, turnkey, licensed_states, videos
// Status, referral code, claim and verification, relationship type, active,
// featured, photos, terms and audit fields are never writable from here.
export const saveMyBuilder = async (patch) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase.rpc("save_my_builder", { p: patch || {} });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, builder: data };
};

// draft -> pending. Approval is an admin action.
export const submitMyBuilder = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase.rpc("submit_my_builder");
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, builder: data };
};

export const emptyReferralStats = () => ({
  counts: Object.fromEntries(EVENT_KINDS.map((k) => [k, 0])),
  referred_users_count: 0,
  purchased_amount_cents: 0,
  refunded_amount_cents: 0,
  net_amount_cents: 0,
  conversations: 0,
});

// Aggregate counts for the caller's builder, zero-filled for every kind:
//   { counts: { link_visited, email_captured, account_created, package_purchased,
//               package_refunded, builder_profile_viewed, builder_contacted,
//               project_signed },
//     referred_users_count,
//     purchased_amount_cents,   // gross: what Stripe charged
//     refunded_amount_cents,    // what Stripe returned
//     net_amount_cents,         // gross minus refunds
//     conversations }           // 0 until portal messaging ships (next pass)
// stats is null when the account has no profile yet. Nothing identifying.
export const fetchMyReferralStats = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled", stats: null };
  const { data, error } = await supabase.rpc("my_referral_stats");
  if (error) return { ok: false, error: rpcError(error), stats: null };
  if (!data) return { ok: true, stats: null };
  const base = emptyReferralStats();
  const counts = { ...base.counts };
  for (const k of EVENT_KINDS) counts[k] = Number(data.counts?.[k]) || 0;
  const purchased = Number(data.purchased_amount_cents) || 0;
  const refunded = Number(data.refunded_amount_cents) || 0;
  return {
    ok: true,
    stats: {
      counts,
      referred_users_count: Number(data.referred_users_count) || 0,
      purchased_amount_cents: purchased,
      refunded_amount_cents: refunded,
      net_amount_cents: data.net_amount_cents != null ? Number(data.net_amount_cents) || 0 : purchased - refunded,
      conversations: Number(data.conversations) || 0,
    },
  };
};
