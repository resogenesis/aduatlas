// /api/admin/builders/* — builder directory management. Dispatched by
// api/admin/[...action].js. Service role + requireAdmin.
//
//   GET  builders/list                    every builder (any status)
//   POST builders/save     { builder }    create or update (id optional); returns the row
//   POST builders/upload   { id, kind: "logo"|"photo", dataUrl, filename? }
//   POST builders/remove-photo { id, path }
//   POST builders/delete   { id }         hard delete (cascades saves, intros, events)
//   POST builders/approve  { id }         profile_status approved, active, audit stamp, referral code
//   POST builders/set-status { id, status }   draft | pending | approved | inactive
//   GET  builders/intros                  intro requests with homeowner + builder
//   POST builders/intro-update { id, status?, admin_note? }
//                                         status requested | declined by hand; 'sent'
//                                         is never set here (see introUpdate)
//   POST builders/intro-forward { id }    send the homeowner's message to the builder
//   GET  builders/referrals               per-builder counts from referral_stats()
//   POST builders/mark-project-signed { builder_id, email | user_id, confirmed_by, signed_on, note }
//                                         claimed listings only; the note is required
//   POST builders/link-owner { id, email }   give an admin-created builder its portal login
//   POST builders/unlink-owner { id }        release a claimed listing from its portal account
//   POST builders/issue-claim-code { id }    generate the code a builder enters to claim this row
//   POST builders/invite   { id }         invite an unclaimed listing to claim itself
//   POST builders/verify   { id }         verified_at / verified_by (claimed rows only)
//   POST builders/unverify { id }         clear the Verified badge
//
// Referral attribution (migrations 0005 + 0006 + 0007): every builder gets a
// unique referral_code at creation, printed as https://aduatlas.com/?ref=<code>,
// and raw events (link_visited, email_captured, account_created,
// package_purchased, package_refunded, builder_profile_viewed,
// builder_contacted, project_signed) land in public.referral_events. Counts
// only. The commercial terms on the row (intro_days, membership_price_cents,
// success_fee_cents) are RECORDED with defaults and never edited here.
// Nothing in this API bills a builder.
//
// Two kinds of listing (0007). UNCLAIMED: seeded by ADUAtlas, no
// owner_user_id, no working referral link, no analytics, no badge. CLAIMED:
// a 'pro' account owns the row, either through claim_my_builder() with a code
// issued here or through link-owner. Tracking resolves a code only for a
// claimed, approved builder (builder_tracking_active). "Verified" is a
// separate admin step after the claim and means only "profile claimed and
// business information verified by ADUAtlas".
//
// UNKNOWN MEANS UNKNOWN (0008). turnkey and build_approach are nullable:
// null means the company never stated it, and no surface may print a default
// in its place. A save carries the admin's answer as true / false / null, and
// on a database without 0008 (both columns still NOT NULL with defaults) the
// write is retried without them and the response says so in `warning`.
//
// PROVENANCE, PRICING AND SCOPE (0017). Three of the builder attributes 2f puts
// in Amy's hands had nowhere to live, so the research behind a listing was
// discarded at import. source_urls and sources_checked_on record which pages of
// the company's OWN site a fact came from and when ADUAtlas last read them,
// which is 2l's provenance rule applied to a builder fact instead of a
// regulatory one. pricing_note and pricing_source_url record what the company
// itself publishes about price: null is "not established", never zero and never
// "contact for pricing", and nothing here derives a price from a build method,
// a comparable company or a square-foot rule. These are not the recorded
// COMMERCIAL TERMS of 0006 ($49 membership, $500 success fee), which are what
// ADUAtlas charges a builder and are a different thing entirely.
// serves_residential and serves_commercial are NULLABLE tri-states for the same
// reason turnkey is (2b): "the company told us no" and "we never found out" are
// different facts, and a boolean defaulting to false would manufacture a claim
// about every company in the directory.
//
// A save writes only the 0017 fields the body actually sent, so a caller that
// posts a partial builder cannot erase the pages a fact came from, and a new
// builder takes the column defaults: no sources, no pricing, both capabilities
// unknown. On a database without 0017 the six are dropped and, if the admin had
// entered any of them, the response says so in `warning`.
//
// THE TWO ROUTES THAT SEND MAIL (0016). Seeding a directory nobody is told
// about invites nobody, and an introduction that reaches nobody is not an
// introduction, so `invite` mails an unclaimed listing its claim invitation and
// `intro-forward` mails a homeowner's introduction to the builder. Both go
// through api/send-email.js in its "admin" mode, and neither composes a word of
// copy: the invitation is the wording locked in section 5.2 of PHASE_1.md
// ("increase your visibility to homeowners", never a promise of traffic, leads
// or sales) and it lives in the template, beside every other template, so no
// two places can describe the offer differently.
//
// WHAT THE TIMESTAMPS MEAN. builders.invited_at is stamped only AFTER the send
// succeeded, so it never claims an invitation that failed to leave, and the
// response says whether this listing had been invited before, because 0016
// keeps the FIRST date and a re-sent invitation does not move it. Re-inviting is
// allowed: it carries the code the row already holds, and issue-claim-code is
// still the way to retire that code and hand out a different one.
// intro_requests.forwarded_at is the record of a forward and the reason a
// second call is refused with the date rather than silently mailing the builder
// twice; forwarding also moves the row to status 'sent'.
//
// 'sent' MEANS FORWARDED (contract C2). forwarded_at says ADUAtlas actually
// forwarded the homeowner's message to the builder, and intro-forward is the only
// path that writes it, after the mail left. A hand status change can therefore
// never produce 'sent': intro-update refuses it, because under the 0016 trigger a
// transition into 'sent' stamped forwarded_at, which hid the Forward button and
// made the real forward answer 409 for a builder who had received nothing. Once
// a forward is on record the row cannot be set back to 'requested' either, since
// the builder has the message.
//
// PRIVACY, decision 8 and 2h. The homeowner starts every conversation, and
// their details reach a builder only if they volunteer them, so a forward
// carries the homeowner's MESSAGE and never their address or name. Nothing here
// puts a homeowner address in a request body either: the admin mode resolves
// the recipient from the record id, so this module names a record and never an
// address. The intro_requests row stays the system of record; the mail only
// tells the builder something is waiting.
//
// The claim code is shown to the admin ONCE, in the issue-claim-code
// response. Every other builder payload leaving this module goes through
// present(), which drops claim_code and leaves claim_code_issued (boolean)
// so the console can say "code issued" and offer a re-issue.
import { randomBytes } from "node:crypto";
import { requireAdmin, readBody } from "../_admin.js";

const BUCKET = "builders";
const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/;
const MAX_BYTES = 4 * 1024 * 1024;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };
const STATE_RE = /^[A-Z]{2}$/;
// website, external_link and external_tracking_url must be absolute http(s)
// URLs. The database enforces this for a builder's own edits inside
// save_my_builder() (0006), and for external_tracking_url with a check in
// 0007; this is the same rule applied to admin saves, so a bare "acme.com"
// is rejected with a message rather than stored as a link the profile page
// cannot open.
const URL_RE = /^https?:\/\/\S+$/i;
const URL_MAX = 300;
const SPECIALTIES = ["detached", "attached", "garage_conversion", "jadu", "prefab", "two_story"];
const SERVICE_TYPES = ["design_build", "general_contractor", "prefab_manufacturer", "architect", "permit_expediter"];
const APPROACH = ["custom", "prefab", "both"];
const BUILD_METHODS = ["site_built", "modular", "manufactured", "panelized", "kit"];
const PROFILE_STATUS = ["draft", "pending", "approved", "inactive"];
const INTRO_STATUS = ["requested", "sent", "declined"];
// What a person may choose by hand. 'sent' is recorded by intro-forward alone.
const INTRO_MANUAL_STATUS = ["requested", "declined"];
// 0007: how ADUAtlas works with this builder. marketplace follows the
// standard recorded terms; affiliate and partner follow their own agreement
// and the standard $500 fee does not apply (fee_applies on project_signed).
const RELATIONSHIP_TYPES = ["marketplace", "affiliate", "partner"];
// Who confirmed a signed project. The RPC refuses anything else.
const CONFIRMED_BY = ["builder", "homeowner", "both"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 0017. A researched listing in data/seed/builders-az.json cites at most 7
// pages, so 20 is room to spare rather than a limit Amy will meet; pricing_note
// holds what the company publishes about price, not a price list.
const SOURCE_URLS_MAX = 20;
const PRICING_NOTE_MAX = 2000;

// Columns added by migrations 0006, 0007 and 0017. save() drops them and
// retries when the database says they do not exist yet, so an admin on an older
// database can still edit the older fields (deploy order is 0005, 0006, 0007,
// 0017).
const COLUMNS_0006 = ["contact_name", "address_line", "city", "zip", "service_states", "build_methods", "turnkey", "licensed_states", "profile_status", "admin_notes", "commercial_terms"];
const COLUMNS_0007 = ["relationship_type", "external_tracking_url"];
const COLUMNS_0017 = ["source_urls", "sources_checked_on", "pricing_note", "pricing_source_url", "serves_residential", "serves_commercial"];
// 42703 / 42883 / 42P01 are Postgres (column, function, relation missing);
// PGRST204 / PGRST202 are PostgREST's schema-cache versions of the same.
const isNotMigrated = (error) => ["42703", "42883", "42P01", "PGRST204", "PGRST202"].includes(error?.code);
// A database without 0008 still has NOT NULL on turnkey and build_approach,
// so a "not stated" save is rejected there. 23502 is that rejection; 23514 is
// the check constraint, in case 0008 widened one column and not the other.
const rejectsNull = (error, keys) => ["23502", "23514"].includes(error?.code) && keys.some((k) => (error.message || "").includes(k));
const fail = (res, error, migration = "0006") => res.status(500).json({ error: isNotMigrated(error) ? `Migration ${migration} is not applied yet (${error.message})` : error.message });

// Referral and claim codes: 8 chars, uppercase, no 0/O/1/I (mirrors the
// check constraints in 0005 for referral_code and 0007 for claim_code). 32
// symbols divide a byte evenly, so `byte % 32` is unbiased.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_TRIES = 5;
const genCode = () => Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % 32]).join("");
const isCodeCollision = (error, column) => error?.code === "23505" && new RegExp(column).test(error.message || "");

const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

// Tri-state answers (0008). null is "the company never stated it", a real
// answer that the interface omits rather than filling in. undefined means the
// body sent something that is neither an answer nor a blank, and the caller
// rejects the save instead of guessing.
const triBool = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (v === true || v === "true" || v === "yes") return true;
  if (v === false || v === "false" || v === "no") return false;
  return undefined;
};
const oneOf = (v, allow) => {
  if (v === null || v === undefined || v === "") return null;
  return allow.includes(v) ? v : undefined;
};

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
const strList = (v, allow) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).filter((x) => !allow || allow.includes(x)) : []);
const text = (v, max) => {
  const s = v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};
// Two-letter state codes, upper-cased and de-duplicated. Returns null when any
// entry is not a state code so the caller can reject the whole save: a
// licensed state that silently vanished would be a data-quality problem the
// admin never sees.
const stateList = (v) => {
  const codes = (Array.isArray(v) ? v : []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  if (codes.some((s) => !STATE_RE.test(s))) return null;
  return [...new Set(codes)];
};
const safe = (s) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
// Trimmed link, null when empty, or false when present but not http(s).
const link = (v) => {
  const s = text(v, URL_MAX);
  if (s === null) return null;
  return URL_RE.test(s) ? s : false;
};
// The pages a fact came from (0017): the same http(s) rule as website and
// external_link, applied to every entry. Returns false when the body sent
// something that is not a list of URLs, so the caller refuses the whole save:
// a source that silently vanished would leave a fact reading as sourced when
// its evidence had been dropped, which is the opposite of what provenance is
// for. Blanks are dropped and duplicates collapse; the count is the caller's
// check, so an over-long list is refused rather than quietly truncated.
const linkList = (v) => {
  if (!Array.isArray(v)) return false;
  const urls = v.map((x) => text(x, URL_MAX)).filter(Boolean);
  if (urls.some((s) => !URL_RE.test(s))) return false;
  return [...new Set(urls)];
};
// A date the admin typed, null for "never recorded", or undefined when the body
// sent something that is not a past-or-present date. A provenance stamp nobody
// can trust is worse than no stamp, so the caller refuses rather than storing
// it, and ADUAtlas cannot have read a page tomorrow. A day that does not exist
// is caught by round-tripping the parse rather than by Date.parse alone, which
// reads "2026-02-31" as the 3rd of March and would store a date nobody checked.
const dateOrNull = (v) => {
  const s = text(v, 40);
  if (s === null) return null;
  if (!DATE_RE.test(s)) return undefined;
  const parsed = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) return undefined;
  return s > new Date().toISOString().slice(0, 10) ? undefined : s;
};

// The builder row as the console may see it: claim_code never leaves here
// except from issueClaimCode, once. Rows from a database without 0007 have
// no claim_code key and come back with claim_code_issued false.
const present = (b) => {
  if (!b) return b;
  const { claim_code: code, ...rest } = b;
  return { ...rest, claim_code_issued: Boolean(code) };
};

// ── the email endpoint, in admin mode ────────────────────────────────────────
// An invitation and an introduction forward are the only mail ADUAtlas sends to
// an address the caller does not own, so api/send-email.js has an "admin" mode
// for them: it verifies the caller's bearer token exactly as requireAdmin does
// above, and it resolves the RECIPIENT ITSELF from the record id in the body. No
// address is passed from here, and a `to` would be ignored if it were.
//
// The admin's own token is forwarded, which is what the endpoint verifies, so
// where this posts must be ADUAtlas and nowhere else: APP_BASE_URL first (the
// same variable every emailed link is built from), then the platform's own
// deployment host, and the request's Host header last and only when it looks
// like a host, for `vercel dev`. A Host header is a caller's string, and a
// caller's string must never become somewhere this function sends a token.
const EMAIL_PATH = "/api/send-email";
const TEMPLATE_INVITATION = "builder-invitation";
const TEMPLATE_INTRO_FORWARD = "intro-forward";

const emailEndpoint = (req) => {
  const configured = (process.env.APP_BASE_URL || "").trim();
  if (configured) return `${configured.replace(/\/+$/, "")}${EMAIL_PATH}`;
  const deployment = (process.env.VERCEL_URL || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (/^[A-Za-z0-9.-]+$/.test(deployment)) return `https://${deployment}${EMAIL_PATH}`;
  const host = String(req?.headers?.host || "");
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return null;
  const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
  return `${scheme}://${host}${EMAIL_PATH}`;
};

// Returns { ok, id? } or { ok: false, status, error }. The endpoint's own status
// travels back so a refusal it made (a row that changed under us, a declined
// introduction) is answered as the conflict it is rather than as a gateway
// fault. The caller decides what a failure means; both callers record nothing
// when the mail did not leave.
const sendAdminEmail = async (req, payload) => {
  const url = emailEndpoint(req);
  if (!url) return { ok: false, error: "APP_BASE_URL is not configured, so ADUAtlas cannot reach its own email endpoint" };
  // requireAdmin already proved this header carries an admin's token; it is
  // forwarded unchanged, because the email endpoint verifies it for itself.
  const authorization = req.headers.authorization || req.headers.Authorization || "";
  if (!authorization) return { ok: false, error: "no authorization to forward to the email endpoint" };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, status: resp.status, error: body?.error || `the email endpoint answered HTTP ${resp.status}` };
    return { ok: true, id: body?.id || null };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || "the email endpoint could not be reached" };
  }
};

// A refusal from the email endpoint is this route's refusal too; anything else
// (unreachable, misconfigured, Resend down) is a gateway fault.
const sendStatus = (sent) => (sent.status >= 400 && sent.status < 500 ? sent.status : 502);

// Create with a fresh referral code; retry only when that code collides.
const insertBuilder = async (ctx, row) => {
  let result;
  for (let i = 0; i < CODE_TRIES; i++) {
    result = await ctx.svc.from("builders").insert({ ...row, referral_code: genCode() }).select().maybeSingle();
    if (!isCodeCollision(result.error, "referral_code")) break;
  }
  return result;
};
// UPDATE never carries referral_code, so an existing code is left alone.
const updateBuilder = (ctx, id, row) => ctx.svc.from("builders").update(row).eq("id", id).select().maybeSingle();

// Profiles created before migration 0005 may have no code; give them one on
// their next save or on approval. An existing code is never touched (builders
// print the link).
const backfillReferralCode = async (ctx, builder) => {
  if (!builder || builder.referral_code) return builder;
  for (let i = 0; i < CODE_TRIES; i++) {
    const { data, error } = await ctx.svc
      .from("builders")
      .update({ referral_code: genCode() })
      .eq("id", builder.id)
      .is("referral_code", null)
      .select()
      .maybeSingle();
    if (!error) return data || builder;
    if (!isCodeCollision(error, "referral_code")) {
      console.error("referral_code backfill error:", error.message);
      return builder;
    }
  }
  return builder;
};

// A row that is approved but carries no audit stamp (admin-created rows land
// approved by default, and rows that existed before 0006 were defaulted to
// approved) is stamped with the admin who last touched it. Pre-0006 rows have
// no profile_status at all and are skipped.
const stampApproval = async (ctx, builder) => {
  if (!builder || builder.profile_status !== "approved" || builder.approved_at) return builder;
  const { data, error } = await ctx.svc
    .from("builders")
    .update({ approved_at: new Date().toISOString(), approved_by: ctx.row.id })
    .eq("id", builder.id)
    .is("approved_at", null)
    .select()
    .maybeSingle();
  if (error) {
    console.error("approval stamp error:", error.message);
    return builder;
  }
  return data || builder;
};

const list = async (req, res, ctx) => {
  const { data, error } = await ctx.svc.from("builders").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ items: (data || []).map(present) });
};

const save = async (req, res, ctx) => {
  const b = readBody(req).builder || {};
  if (!b.name || !STATE_RE.test(b.state || "")) return res.status(400).json({ error: "name and two-letter state required" });
  if (b.profile_status !== undefined && !PROFILE_STATUS.includes(b.profile_status)) return res.status(400).json({ error: "profile_status must be draft, pending, approved or inactive" });
  if (b.relationship_type !== undefined && !RELATIONSHIP_TYPES.includes(b.relationship_type)) return res.status(400).json({ error: "relationship_type must be marketplace, affiliate or partner" });
  const serviceStates = stateList(b.service_states);
  if (!serviceStates) return res.status(400).json({ error: "service_states must be two-letter state codes" });
  const licensedStates = stateList(b.licensed_states);
  if (!licensedStates) return res.status(400).json({ error: "licensed_states must be two-letter state codes" });
  const buildMethods = strList(b.build_methods);
  if (buildMethods.some((m) => !BUILD_METHODS.includes(m))) return res.status(400).json({ error: `build_methods must be from ${BUILD_METHODS.join(", ")}` });
  const website = link(b.website);
  if (website === false) return res.status(400).json({ error: "website must be a full URL starting with http:// or https://" });
  const externalLink = link(b.external_link);
  if (externalLink === false) return res.status(400).json({ error: "external_link must be a full URL starting with http:// or https://" });
  const trackingUrl = link(b.external_tracking_url);
  if (trackingUrl === false) return res.status(400).json({ error: "external_tracking_url must be a full URL starting with http:// or https://" });
  // Left blank means "not stated" and is stored as null (0008). A value that
  // is neither an answer nor blank is refused, so a typo cannot become a
  // silent unknown or a silent default.
  const approach = oneOf(b.build_approach, APPROACH);
  if (approach === undefined) return res.status(400).json({ error: `build_approach must be ${APPROACH.join(", ")}, or left blank for not stated` });
  const turnkey = triBool(b.turnkey);
  if (turnkey === undefined) return res.status(400).json({ error: "turnkey must be true, false, or left blank for not stated" });
  // The 0017 answers. Residential and commercial go through the SAME tri-state
  // as turnkey, so a typo in a raw API call is a 400 and can never become a
  // capability claim about a company that never made one. Left blank is null,
  // which every surface omits under 2b.
  const residential = triBool(b.serves_residential);
  if (residential === undefined) return res.status(400).json({ error: "serves_residential must be true, false, or left blank for not stated" });
  const commercial = triBool(b.serves_commercial);
  if (commercial === undefined) return res.status(400).json({ error: "serves_commercial must be true, false, or left blank for not stated" });
  // Provenance. An absent key is left alone further down; a key that is present
  // has to be a list of real URLs, a real date and a real link or the save is
  // refused. The two pricing fields stay independent: the source is where the
  // company said it, and Amy is not forced to fill either one because it exists.
  const sourceUrls = b.source_urls === undefined ? null : linkList(b.source_urls);
  if (sourceUrls === false) return res.status(400).json({ error: "source_urls must be a list of full URLs starting with http:// or https://" });
  if (sourceUrls && sourceUrls.length > SOURCE_URLS_MAX) return res.status(400).json({ error: `source_urls holds at most ${SOURCE_URLS_MAX} pages` });
  const checkedOn = dateOrNull(b.sources_checked_on);
  if (checkedOn === undefined) return res.status(400).json({ error: "sources_checked_on must be a past or present date (YYYY-MM-DD), or left blank for never recorded" });
  const pricingSourceUrl = link(b.pricing_source_url);
  if (pricingSourceUrl === false) return res.status(400).json({ error: "pricing_source_url must be a full URL starting with http:// or https://" });

  // The 0005 shape. Status, referral code, pricing terms, owner, claim,
  // verification and audit columns are never taken from the body here:
  // approve / set-status own the status, insertBuilder owns the code,
  // issue-claim-code / link-owner own the claim, verify owns the badge and
  // the terms keep their defaults.
  const row = {
    name: String(b.name).trim().slice(0, 120),
    slug: slugify(b.slug || b.name) || `builder-${Date.now()}`,
    description: b.description ? String(b.description).slice(0, 4000) : null,
    website,
    external_link: externalLink,
    contact_email: b.contact_email || null,
    contact_phone: b.contact_phone || null,
    state: b.state,
    cities: strList(b.cities),
    service_zips: strList(b.service_zips),
    specialties: strList(b.specialties, SPECIALTIES),
    service_types: strList(b.service_types, SERVICE_TYPES),
    build_approach: approach,
    videos: strList(b.videos).slice(0, 2),
    active: b.active !== false,
    featured: Boolean(b.featured),
  };
  // The 0006 shape (see COLUMNS_0006).
  const extra = {
    contact_name: text(b.contact_name, 120),
    address_line: text(b.address_line, 200),
    city: text(b.city, 80),
    zip: text(b.zip, 12),
    service_states: serviceStates,
    build_methods: buildMethods,
    turnkey,
    licensed_states: licensedStates,
    admin_notes: text(b.admin_notes, 4000),
    commercial_terms: text(b.commercial_terms, 4000),
  };
  if (b.profile_status !== undefined) extra.profile_status = b.profile_status;
  // The 0007 shape (see COLUMNS_0007). An absent relationship_type leaves the
  // column alone on update and takes the database default on insert.
  const extra7 = { external_tracking_url: trackingUrl };
  if (b.relationship_type !== undefined) extra7.relationship_type = b.relationship_type;
  // The 0017 shape (see COLUMNS_0017). A field the body did not send is left
  // out of the write entirely: on an update the stored value stays, so a
  // partial save cannot wipe provenance or invent an answer, and on an insert
  // the column defaults apply, which is no sources, no pricing and both
  // capabilities unknown. Nothing is derived from anything else on the row.
  const extra17 = {};
  if (b.source_urls !== undefined) extra17.source_urls = sourceUrls;
  if (b.sources_checked_on !== undefined) extra17.sources_checked_on = checkedOn;
  if (b.pricing_note !== undefined) extra17.pricing_note = text(b.pricing_note, PRICING_NOTE_MAX);
  if (b.pricing_source_url !== undefined) extra17.pricing_source_url = pricingSourceUrl;
  if (b.serves_residential !== undefined) extra17.serves_residential = residential;
  if (b.serves_commercial !== undefined) extra17.serves_commercial = commercial;

  // Widest shape first, then without 0017, then without 0007, then the 0005
  // columns alone. A save that carried none of the 0017 fields leaves extra17
  // empty, which makes the first two shapes the same write and keeps the
  // console from being told something was dropped when nothing was entered.
  const note0017 = Object.keys(extra17).length
    ? "Migration 0017 is not applied yet, so the sources, pricing and residential or commercial answers were not saved."
    : null;
  const ladderNote = (...notes) => notes.filter(Boolean).join(" ") || null;
  const attempts = [
    [{ ...row, ...extra, ...extra7, ...extra17 }, null],
    [{ ...row, ...extra, ...extra7 }, ladderNote(note0017)],
    [{ ...row, ...extra }, ladderNote(note0017, "Migration 0007 is not applied yet, so the relationship type and tracking link were not saved.")],
    [row, ladderNote(note0017, "Migration 0006 is not applied yet, so the new fields were not saved.")],
  ];
  // "Not stated" needs 0008. Before it the two columns cannot hold null, so
  // the second pass leaves them out of the write (the stored value stays as it
  // is) and the admin is told the unknown was not recorded.
  const unstated = [
    ["turnkey", "Turnkey", turnkey],
    ["build_approach", "Build approach", approach],
  ].filter(([, , value]) => value === null);
  const unstatedKeys = unstated.map(([key]) => key);
  const note0008 = `Migration 0008 is not applied yet, so ${unstated.map(([, label]) => label).join(" and ")} could not be left as not stated.`;
  let result;
  let warning;
  for (const strip of unstatedKeys.length ? [false, true] : [false]) {
    for (const [shape, note] of attempts) {
      const body = strip ? omit(shape, unstatedKeys) : shape;
      result = b.id ? await updateBuilder(ctx, b.id, body) : await insertBuilder(ctx, body);
      warning = [note, strip ? note0008 : null].filter(Boolean).join(" ") || null;
      if (!isNotMigrated(result.error)) break;
    }
    if (!rejectsNull(result.error, unstatedKeys)) break;
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  if (!result.data) return res.status(404).json({ error: "builder not found" });
  const builder = await backfillReferralCode(ctx, await stampApproval(ctx, result.data));
  res.status(200).json({ ok: true, builder: present(builder), ...(warning ? { warning } : {}) });
};

// Approval is the moment a profile becomes visible in the homeowner directory
// (builders_public reads approved + active rows). It also guarantees the row
// has a referral link, so a self-serve builder gets theirs the moment they
// are approved. The link only RESOLVES once the row is also claimed (0007).
const approve = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const patch = { profile_status: "approved", active: true, approved_at: new Date().toISOString(), approved_by: ctx.row.id };
  const { data, error } = await updateBuilder(ctx, id, patch);
  if (error) return fail(res, error);
  if (!data) return res.status(404).json({ error: "builder not found" });
  res.status(200).json({ ok: true, builder: present(await backfillReferralCode(ctx, data)) });
};

// inactive also clears `active` so the referral code stops resolving in
// capture_lead and the webhook (both check active). approved routes through
// approve() so the audit stamp and code are never skipped.
const setStatus = async (req, res, ctx) => {
  const { id, status } = readBody(req);
  if (!id || !PROFILE_STATUS.includes(status)) return res.status(400).json({ error: "id and status (draft|pending|approved|inactive) required" });
  if (status === "approved") return approve(req, res, ctx);
  const patch = status === "inactive" ? { profile_status: status, active: false } : { profile_status: status };
  const { data, error } = await updateBuilder(ctx, id, patch);
  if (error) return fail(res, error);
  if (!data) return res.status(404).json({ error: "builder not found" });
  res.status(200).json({ ok: true, builder: present(data) });
};

const upload = async (req, res, ctx) => {
  const { id, kind, dataUrl, filename } = readBody(req);
  if (!id || !["logo", "photo"].includes(kind)) return res.status(400).json({ error: "id and kind (logo|photo) required" });
  const match = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 PNG, JPEG or WebP" });
  const contentType = match[1];
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > MAX_BYTES) return res.status(400).json({ error: "image too large (max 4MB)" });

  const { data: b, error: bErr } = await ctx.svc.from("builders").select("id, photos").eq("id", id).maybeSingle();
  if (bErr) return res.status(500).json({ error: bErr.message });
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (kind === "photo" && (b.photos || []).length >= 3) return res.status(400).json({ error: "a profile holds up to 3 photos" });

  const path = `${id}/${kind}-${Date.now()}-${safe(filename) || kind}.${EXT[contentType]}`;
  const { error: upErr } = await ctx.svc.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const patch = kind === "logo" ? { logo_path: path } : { photos: [...(b.photos || []), path] };
  const { data, error } = await ctx.svc.from("builders").update(patch).eq("id", id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true, builder: present(data), path });
};

const removePhoto = async (req, res, ctx) => {
  const { id, path } = readBody(req);
  if (!id || !path) return res.status(400).json({ error: "id and path required" });
  const { data: b } = await ctx.svc.from("builders").select("photos, logo_path").eq("id", id).maybeSingle();
  if (!b) return res.status(404).json({ error: "builder not found" });
  const patch = b.logo_path === path ? { logo_path: null } : { photos: (b.photos || []).filter((p) => p !== path) };
  await ctx.svc.storage.from(BUCKET).remove([path]);
  const { data, error } = await ctx.svc.from("builders").update(patch).eq("id", id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true, builder: present(data) });
};

const del = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { error } = await ctx.svc.from("builders").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
};

const intros = async (req, res, ctx) => {
  // "*" on intro_requests rather than a column list: forwarded_at (0016) is
  // wanted where it exists and must not 500 the whole tab where it does not.
  // The response is built field by field below, so selecting the row does not
  // widen what leaves here.
  const { data, error } = await ctx.svc
    .from("intro_requests")
    .select("*, users!inner(email, paid_tier, paid_at, refunded_at, builder_packet), builders!inner(name, contact_email, contact_phone, website)")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const items = (data || []).map((r) => ({
    id: r.id,
    message: r.message,
    status: r.status,
    admin_note: r.admin_note,
    created_at: r.created_at,
    // null on a database without 0016, which the tab reads as "not forwarded".
    forwarded_at: r.forwarded_at || null,
    homeowner_email: r.users?.email,
    // The stored tier id ('roadmap', 'report', 'concierge'); the console prints
    // the plan NAME for it. homeowner_plan_live says whether that plan is a live,
    // unrefunded one, so a refunded or never-paid account is not read as a buyer.
    homeowner_tier: r.users?.paid_tier || null,
    homeowner_plan_live: Boolean(r.users?.paid_at) && !r.users?.refunded_at,
    homeowner_address: r.users?.builder_packet?.address || null,
    builder_name: r.builders?.name,
    builder_contact: r.builders?.contact_email || r.builders?.contact_phone || r.builders?.website || null,
    // Whether a forward can leave at all. builder_contact above may be a phone
    // number or a website, and intro-forward is email or nothing.
    builder_can_forward: Boolean(r.builders?.contact_email),
  }));
  res.status(200).json({ items });
};

// A hand change to an introduction: turning one down, reopening one that was
// turned down, or a note. It never records a forward (contract C2): 'sent' is
// refused here whatever the database's triggers would do with it, so the status
// control cannot claim the builder was mailed, cannot hide Forward to builder, and
// cannot make the real forward answer "already forwarded". Re-sending the status
// a row already has is a no-op rather than a refusal, so a console that posts the
// whole row back is not punished for it.
const introUpdate = async (req, res, ctx) => {
  const { id, status, admin_note } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  if (status !== undefined && !INTRO_STATUS.includes(status)) return res.status(400).json({ error: "invalid status" });
  const { data: intro, error: iErr } = await ctx.svc.from("intro_requests").select("*").eq("id", id).maybeSingle();
  if (iErr) return res.status(500).json({ error: iErr.message });
  if (!intro) return res.status(404).json({ error: "introduction request not found" });

  const patch = {};
  if (status !== undefined && status !== intro.status) {
    if (!INTRO_MANUAL_STATUS.includes(status)) {
      return res.status(409).json({
        error: "Introduction sent is recorded only when Forward to builder actually mails the builder, so it cannot be chosen by hand. Nothing was changed.",
      });
    }
    if (status === "requested" && intro.forwarded_at) {
      return res.status(409).json({
        error: `this introduction was forwarded to the builder on ${String(intro.forwarded_at).slice(0, 10)}, so it cannot go back to Requested. Nothing was changed.`,
      });
    }
    patch.status = status;
  }
  if (admin_note !== undefined) patch.admin_note = admin_note || null;
  if (!Object.keys(patch).length) return res.status(200).json({ ok: true, intro });

  // The status filter closes the race with a forward landing between the read
  // above and this write: a row that moved under us is reported, not overwritten.
  let q = ctx.svc.from("intro_requests").update(patch).eq("id", id);
  if (patch.status) q = q.eq("status", intro.status);
  const { data, error } = await q.select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(409).json({ error: "this introduction changed while you were editing it. Refresh and try again." });
  res.status(200).json({ ok: true, intro: data });
};

// Forwarding an introduction: the homeowner asked for one, and until now the
// only effect was a row nobody outside ADUAtlas ever saw. The forward refuses
// for a builder with no contact email, and refuses a SECOND time with the date
// of the first, because a builder mailed the same introduction twice is worse
// than an admin told "already done".
//
// The homeowner's identity is not in the request and not in the mail. This
// route names the intro_requests row; api/send-email.js resolves the builder's
// address and builds the body from the record, and the body carries the
// homeowner's message and nothing that identifies them (decision 8). status
// 'sent' and forwarded_at are written only after the mail left.
const introForward = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { data: intro, error: iErr } = await ctx.svc
    .from("intro_requests")
    .select("*, builders!inner(id, name, contact_email)")
    .eq("id", id)
    .maybeSingle();
  if (iErr) return fail(res, iErr, "0016");
  if (!intro) return res.status(404).json({ error: "introduction request not found" });
  // forwarded_at is the only honest record that a builder was mailed, so
  // without it there is no protection against forwarding twice and the route
  // refuses rather than sending something it cannot record. A missing COLUMN
  // shows up as a missing KEY, because the select above asked for every column
  // the table actually has.
  if (!("forwarded_at" in intro)) {
    return res.status(500).json({ error: "Migration 0016 is not applied yet (intro_requests.forwarded_at), so a forward cannot be recorded" });
  }
  if (intro.forwarded_at) {
    return res.status(409).json({
      error: `this introduction was already forwarded on ${intro.forwarded_at}`,
      already_forwarded: true,
      forwarded_at: intro.forwarded_at,
    });
  }
  // The same refusal the email endpoint makes, made here so the console gets a
  // conflict with a reason instead of a failed send: an introduction an admin
  // turned down is not forwarded.
  if (intro.status === "declined") {
    return res.status(409).json({ error: "this introduction was declined, so it is not forwarded" });
  }
  const builder = intro.builders || null;
  if (!builder?.contact_email) {
    return res.status(409).json({ error: "this builder has no contact email, so there is nowhere to forward the introduction" });
  }

  const sent = await sendAdminEmail(req, { template: TEMPLATE_INTRO_FORWARD, introId: id });
  if (!sent.ok) return res.status(sendStatus(sent)).json({ error: `the introduction was not forwarded (${sent.error})`, sent: false });

  // The null filter closes the race between the check above and this write: two
  // admins forwarding at the same moment both send, and the second learns that.
  const { data, error } = await ctx.svc
    .from("intro_requests")
    .update({ status: "sent", forwarded_at: new Date().toISOString() })
    .eq("id", id)
    .is("forwarded_at", null)
    .select()
    .maybeSingle();
  if (error) {
    console.error("forwarded_at stamp error:", error.message);
    return res.status(200).json({
      ok: true,
      sent: true,
      forwarded_at: null,
      builder_name: builder.name,
      warning: `The introduction was forwarded, but the row was not updated (${error.message}), so it still reads as waiting here.`,
    });
  }
  if (!data) {
    return res.status(200).json({
      ok: true,
      sent: true,
      already_forwarded: true,
      builder_name: builder.name,
      warning: "Another forward was recorded at the same moment, so this builder has now had the introduction twice.",
    });
  }
  res.status(200).json({ ok: true, sent: true, forwarded_at: data.forwarded_at, builder_name: builder.name, intro: data });
};

// Attribution only: referral_stats() (rewritten in 0006 over referral_events,
// plus a "conversations" placeholder of 0 in 0007 until messaging ships)
// returns per-builder counts of visits, emails, accounts, purchases,
// purchase_amount_cents (gross), refunds, refunded_amount_cents,
// net_amount_cents, profile_views, contacts, conversations and
// projects_signed, plus the 0005 leads_count / paid_count / paid_by_tier. No
// payout math here.
//
// CONVERSATIONS ARE COUNTED HERE, NOT TAKEN FROM THE RPC. referral_stats() still
// returns the 0007 placeholder of 0 for every builder, while messaging (0011, 2h)
// is in Phase 1, so the console showed a zero next to "messaging ships in the next
// pass". The figure is now the number of builder_conversations rows naming the
// builder, read with the service role. If that read fails, or returns fewer rows
// than the table holds (PostgREST caps a response at its max-rows setting, so a
// long table can come back cut short without an error), the figure is null,
// which the console prints as n/a: an unknown count is never shown as 0 (2b).
const referrals = async (req, res, ctx) => {
  const { data, error } = await ctx.svc.rpc("referral_stats");
  if (error) return fail(res, error);
  const { data: convs, error: cErr, count: total } = await ctx.svc
    .from("builder_conversations")
    .select("builder_id", { count: "exact" });
  const complete = !cErr && Array.isArray(convs) && typeof total === "number" && convs.length === total;
  const counts = new Map();
  for (const c of complete ? convs : []) counts.set(c.builder_id, (counts.get(c.builder_id) || 0) + 1);
  const items = (data || []).map((row) => ({ ...row, conversations: complete ? counts.get(row.builder_id) || 0 : null }));
  res.status(200).json({ items });
};

// The one event only an admin can record (0007 shape). The homeowner is named
// by account email (users.email is citext, so the match is case-insensitive)
// or by users.id; either way the service client resolves it here and the
// caller never learns anything about the homeowner beyond "found" or "not
// found". The RPC names the SIGNING builder (the fee attaches there), records
// the homeowner's ORIGIN builder from users.referred_by_builder_id, requires
// who confirmed it and the signed date, and sets fee_applies from the signing
// builder's relationship_type.
//
// Only a CLAIMED listing can carry one: the fee belongs to a company that took
// its profile over, and an unclaimed listing has nobody behind it. The RPC
// refuses one too; this answers 409 with the same sentence. The note is
// required, because a recorded fee needs evidence behind it.
//
// One event per homeowner and builder. The RPC returns { event, inserted,
// origin_builder_name }: `inserted` is the ONLY thing that says whether this
// call recorded it, because a repeat hands back the event already on record
// and it looks identical to a fresh one.
const markProjectSigned = async (req, res, ctx) => {
  const { builder_id, user_id, email, confirmed_by, signed_on, note } = readBody(req);
  if (!builder_id) return res.status(400).json({ error: "builder_id required" });
  if (!CONFIRMED_BY.includes(confirmed_by)) return res.status(400).json({ error: "confirmed_by must be builder, homeowner or both" });
  const signedOn = String(signed_on || "").trim();
  if (!DATE_RE.test(signedOn) || Number.isNaN(Date.parse(signedOn))) return res.status(400).json({ error: "signed_on must be a date (YYYY-MM-DD)" });
  if (signedOn > new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: "signed_on cannot be in the future" });
  const signedNote = text(note, 2000);
  if (!signedNote) return res.status(400).json({ error: "a note is required, saying what was signed and how it was confirmed" });
  // The listing is checked before the homeowner is looked up, so a call that
  // cannot succeed never resolves an account.
  const { data: b, error: bErr } = await ctx.svc.from("builders").select("id, owner_user_id").eq("id", builder_id).maybeSingle();
  if (bErr) return fail(res, bErr);
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (!b.owner_user_id) return res.status(409).json({ error: "a signed project can only be recorded for a claimed listing" });
  let uid = user_id || null;
  if (!uid) {
    const e = String(email || "").trim();
    if (!e || !e.includes("@")) return res.status(400).json({ error: "homeowner email or user_id required" });
    const { data: u, error: uErr } = await ctx.svc.from("users").select("id, role").eq("email", e).maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!u) return res.status(404).json({ error: "no account with that email" });
    if (u.role === "pro") return res.status(400).json({ error: "that email belongs to a builder account, not a homeowner" });
    uid = u.id;
  }
  const { data, error } = await ctx.svc.rpc("admin_mark_project_signed", {
    p_builder_id: builder_id,
    p_user_id: uid,
    p_confirmed_by: confirmed_by,
    p_signed_on: signedOn,
    p_note: signedNote,
  });
  if (error) return fail(res, error, "0007");
  // already_recorded comes from `inserted` alone. An event that is present in
  // the response says nothing about which call wrote it.
  const result = (Array.isArray(data) ? data[0] : data) || {};
  res.status(200).json({
    ok: true,
    already_recorded: result.inserted === false,
    event: result.event || null,
    origin_builder_name: result.origin_builder_name || null,
  });
};

// The admin half of claiming. ADUAtlas seeds the directory, so most rows
// start with no owner_user_id and the builder cannot log in to a portal for
// a profile that is already theirs. This joins an existing 'pro' account
// (matched by citext email, so case does not matter) to one builder row and
// stamps the claim the same way claim_my_builder() does (claimed_at now, any
// outstanding claim code cleared). owner_user_id is unique, so a pro account
// owns at most one builder; a builder that already has an owner is not
// reassigned here (release it with unlink-owner first). The self-serve half is issue-claim-code
// below plus claim_my_builder() in the portal. Nothing about the account
// beyond "found" is returned.
const linkOwner = async (req, res, ctx) => {
  const { id, email } = readBody(req);
  const e = String(email || "").trim();
  if (!id || !e || !e.includes("@")) return res.status(400).json({ error: "id and the builder account email required" });

  const { data: b, error: bErr } = await ctx.svc.from("builders").select("id, owner_user_id").eq("id", id).maybeSingle();
  if (bErr) return fail(res, bErr);
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (b.owner_user_id) return res.status(409).json({ error: "this builder already has a portal account" });

  const { data: u, error: uErr } = await ctx.svc.from("users").select("id, role").eq("email", e).maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });
  if (!u || u.role !== "pro") return res.status(404).json({ error: "no builder account with that email. The builder signs up first, then you link it here." });

  const { data: owned, error: oErr } = await ctx.svc.from("builders").select("id").eq("owner_user_id", u.id).maybeSingle();
  if (oErr) return fail(res, oErr);
  if (owned) return res.status(409).json({ error: owned.id === id ? "that account already owns this builder" : "that account already owns another builder profile" });

  // The unique constraint on owner_user_id closes the race between the check
  // above and this write: a second linker gets 23505, reported as a conflict.
  // On a database without 0007 the claim columns do not exist yet, so the
  // write falls back to the owner alone.
  //
  // Verification is cleared with the claim, exactly as claim_my_builder does:
  // ADUAtlas checked the company that held the listing before, so the badge
  // never travels to a new owner. The new owner earns it again.
  const claim = { owner_user_id: u.id, claimed_at: new Date().toISOString(), claim_code: null, verified_at: null, verified_by: null };
  let { data, error } = await ctx.svc.from("builders").update(claim).eq("id", id).is("owner_user_id", null).select().maybeSingle();
  if (isNotMigrated(error)) ({ data, error } = await ctx.svc.from("builders").update({ owner_user_id: u.id }).eq("id", id).is("owner_user_id", null).select().maybeSingle());
  if (error) return error.code === "23505" ? res.status(409).json({ error: "that account already owns another builder profile" }) : fail(res, error);
  if (!data) return res.status(409).json({ error: "this builder already has a portal account" });
  res.status(200).json({ ok: true, builder: present(data) });
};

// The other half of ownership (2f names claimed status as Amy's; 2g names
// ownership changes and badge invalidation). A claim that went to the wrong
// account, or a company that changed hands, is fixed here without touching the
// database: the listing is released from its portal account and becomes
// UNCLAIMED again. A transfer is a release followed by link-owner.
//
// Only owner_user_id is written. builders_on_claim (0007) is the one choke point
// every owner write passes through, and on an ownership change it clears
// verified_at, verified_by and claimed_at, so the Verified badge and the free
// period both stay with the owner who earned them. The response reports what the
// row actually holds afterwards rather than assuming the trigger ran; on a
// database where it did not, the badge is cleared here and the response says so.
// The builder account itself is not deleted: it simply owns no listing now.
const unlinkOwner = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { data: b, error: bErr } = await ctx.svc.from("builders").select("*").eq("id", id).maybeSingle();
  if (bErr) return fail(res, bErr);
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (!b.owner_user_id) return res.status(409).json({ error: "this listing is not claimed, so there is no portal account to release" });

  // The owner filter closes the race with another release or a claim between the
  // read above and this write.
  const { data, error } = await ctx.svc
    .from("builders")
    .update({ owner_user_id: null })
    .eq("id", id)
    .eq("owner_user_id", b.owner_user_id)
    .select()
    .maybeSingle();
  if (error) return fail(res, error);
  if (!data) return res.status(409).json({ error: "the owner of this listing changed while you were releasing it. Reopen the listing and check." });

  let row = data;
  let warning = null;
  if ("verified_at" in row && row.verified_at) {
    const { data: cleared, error: vErr } = await ctx.svc
      .from("builders")
      .update({ verified_at: null, verified_by: null })
      .eq("id", id)
      .is("owner_user_id", null)
      .select()
      .maybeSingle();
    if (vErr || !cleared) {
      warning = `The listing was released, but its Verified badge could not be cleared (${vErr?.message || "the row changed"}). Remove Verified by hand.`;
    } else {
      row = cleared;
      warning = "The database did not clear the Verified badge on release, so it was cleared here. Check that migration 0007 is applied.";
    }
  }
  res.status(200).json({
    ok: true,
    builder: present(row),
    was_verified: Boolean(b.verified_at),
    verified_cleared: !row.verified_at,
    ...(warning ? { warning } : {}),
  });
};

// The self-serve half of claiming, admin side: a fresh code for an UNCLAIMED
// row. ADUAtlas puts it in the invitation; the builder creates a 'pro'
// account and enters it, and claim_my_builder() (0007) turns the row into a
// claimed listing. Issuing again replaces the previous code, so an
// invitation that went astray can be retired. The code is returned in this
// response and nowhere else: list/save go through present(), which only says
// whether one is issued.
// One place mints a claim code, so an invitation can never carry a code issued
// some other way. The owner filter is the race guard and the reason a claimed
// row comes back with no data rather than an error: builders_on_claim (0007)
// refuses a new code for a row that has an owner, and a row claimed between the
// check and this write takes no code at all. Issuing again replaces the
// previous code, retiring an invitation that went astray.
const mintClaimCode = async (ctx, id) => {
  let result;
  for (let i = 0; i < CODE_TRIES; i++) {
    result = await ctx.svc.from("builders").update({ claim_code: genCode() }).eq("id", id).is("owner_user_id", null).select().maybeSingle();
    if (!isCodeCollision(result.error, "claim_code")) break;
  }
  return result;
};

const CLAIMED_ALREADY = "this builder is already claimed; a claim code is not needed";

const issueClaimCode = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { data: b, error: bErr } = await ctx.svc.from("builders").select("id, owner_user_id").eq("id", id).maybeSingle();
  if (bErr) return fail(res, bErr);
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (b.owner_user_id) return res.status(409).json({ error: CLAIMED_ALREADY });

  const result = await mintClaimCode(ctx, id);
  if (result.error) return fail(res, result.error, "0007");
  if (!result.data) return res.status(409).json({ error: CLAIMED_ALREADY });
  res.status(200).json({ ok: true, claim_code: result.data.claim_code, builder: present(result.data) });
};

// The invitation: the one thing missing between "ADUAtlas seeded 86 Arizona
// listings" and "a builder claims one". It is refused for a listing that is
// already CLAIMED, because inviting a company to claim what it already holds is
// a mistake, and for a listing with no contact email, because there is nobody
// to write to. An invitation always carries a code that works: if the row has
// no live code one is minted through mintClaimCode above, the same path
// issue-claim-code takes.
//
// ORDER MATTERS. The code is on the row before the mail goes, the mail goes
// before invited_at is stamped, and a failed send stamps nothing, so invited_at
// only ever means "an invitation left ADUAtlas". The code is NOT returned here:
// it is in the builder's inbox, and issue-claim-code stays the one place an
// admin reads it.
const invite = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  // select("*") because invited_at does not exist on a database without 0016,
  // and a named column list would fail there before this could say so.
  const { data: b, error: bErr } = await ctx.svc.from("builders").select("*").eq("id", id).maybeSingle();
  if (bErr) return fail(res, bErr);
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (b.owner_user_id) return res.status(409).json({ error: "this listing is already claimed, so there is nothing to invite it to claim" });
  if (!b.contact_email) return res.status(409).json({ error: "this listing has no contact email, so there is nobody to invite. Add one first." });

  const hadCode = Boolean(b.claim_code);
  let row = b;
  if (!hadCode) {
    const minted = await mintClaimCode(ctx, id);
    if (minted.error) return fail(res, minted.error, "0007");
    if (!minted.data) return res.status(409).json({ error: "this listing is already claimed, so there is nothing to invite it to claim" });
    row = minted.data;
  }

  const sent = await sendAdminEmail(req, { template: TEMPLATE_INVITATION, builderId: id });
  if (!sent.ok) {
    // Nothing is stamped. code_issued is reported anyway: the row now carries a
    // code that no invitation has ever delivered, which is what an admin needs
    // to know before trying again.
    return res.status(sendStatus(sent)).json({ error: `the invitation was not sent (${sent.error})`, sent: false, code_issued: !hadCode, builder: present(row) });
  }

  let stamped = null;
  let warning = null;
  const { data: after, error: sErr } = await ctx.svc
    .from("builders")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (sErr) {
    // The mail has left, so this is not a failure of the invitation. It is said
    // out loud instead: the console must not report a date the row does not
    // hold, and on a database without 0016 there is no column to hold one.
    console.error("invited_at stamp error:", sErr.message);
    warning = isNotMigrated(sErr)
      ? `The invitation was sent, but migration 0016 is not applied yet, so invited_at was not recorded (${sErr.message}).`
      : `The invitation was sent, but invited_at was not recorded (${sErr.message}).`;
  } else {
    stamped = after;
  }

  res.status(200).json({
    ok: true,
    sent: true,
    // b.invited_at is undefined on a database without 0016, which reads as
    // "never invited". The warning above is what says the date is unknown.
    already_invited: Boolean(b.invited_at),
    previously_invited_at: b.invited_at || null,
    invited_at: stamped?.invited_at || null,
    code_issued: !hadCode,
    ...(warning ? { warning } : {}),
    builder: present(stamped || row),
  });
};

// Verified means one thing: the profile is claimed and ADUAtlas has checked
// the business information. It never means ADUAtlas judged the work. An
// unclaimed row cannot be verified (409): there is nobody behind it yet.
const verify = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { data: b, error: bErr } = await ctx.svc.from("builders").select("id, owner_user_id").eq("id", id).maybeSingle();
  if (bErr) return fail(res, bErr);
  if (!b) return res.status(404).json({ error: "builder not found" });
  if (!b.owner_user_id) return res.status(409).json({ error: "only a claimed profile can be verified" });
  // The owner filter closes the race with an unlink between the check and the write.
  const { data, error } = await ctx.svc
    .from("builders")
    .update({ verified_at: new Date().toISOString(), verified_by: ctx.row.id })
    .eq("id", id)
    .not("owner_user_id", "is", null)
    .select()
    .maybeSingle();
  if (error) return fail(res, error, "0007");
  if (!data) return res.status(409).json({ error: "only a claimed profile can be verified" });
  res.status(200).json({ ok: true, builder: present(data) });
};

const unverify = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { data, error } = await updateBuilder(ctx, id, { verified_at: null, verified_by: null });
  if (error) return fail(res, error, "0007");
  if (!data) return res.status(404).json({ error: "builder not found" });
  res.status(200).json({ ok: true, builder: present(data) });
};

const ROUTES = {
  list: { GET: list },
  save: { POST: save },
  approve: { POST: approve },
  "set-status": { POST: setStatus },
  upload: { POST: upload },
  "remove-photo": { POST: removePhoto },
  delete: { POST: del },
  intros: { GET: intros },
  "intro-update": { POST: introUpdate },
  "intro-forward": { POST: introForward },
  referrals: { GET: referrals },
  "mark-project-signed": { POST: markProjectSigned },
  "link-owner": { POST: linkOwner },
  "unlink-owner": { POST: unlinkOwner },
  "issue-claim-code": { POST: issueClaimCode },
  invite: { POST: invite },
  verify: { POST: verify },
  unverify: { POST: unverify },
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
