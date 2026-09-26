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
//   GET  builders/referrals               per-builder counts from referral_stats()
//   POST builders/mark-project-signed { builder_id, email | user_id, note? }
//   POST builders/link-owner { id, email }   give an admin-created builder its portal login
//
// Referral attribution (migrations 0005 + 0006): every builder gets a unique
// referral_code at creation, printed as https://aduatlas.com/?ref=<code>, and
// raw events (link_visited, email_captured, account_created, package_purchased,
// builder_profile_viewed, builder_contacted, project_signed) land in
// public.referral_events. Counts only. The commercial terms on the row
// (intro_days, membership_price_cents, success_fee_cents) are RECORDED with
// defaults and never edited here. Nothing in this API bills a builder.
import { randomBytes } from "node:crypto";
import { requireAdmin, readBody } from "../_admin.js";

const BUCKET = "builders";
const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/;
const MAX_BYTES = 4 * 1024 * 1024;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };
const STATE_RE = /^[A-Z]{2}$/;
// website and external_link must be absolute http(s) URLs: same rule as the
// check constraints in supabase/migrations/0006_builder_accounts.sql. A
// bare "acme.com" is rejected with a message rather than stored as a link
// the profile page cannot open.
const URL_RE = /^https?:\/\/\S+$/i;
const URL_MAX = 300;
const SPECIALTIES = ["detached", "attached", "garage_conversion", "jadu", "prefab", "two_story"];
const SERVICE_TYPES = ["design_build", "general_contractor", "prefab_manufacturer", "architect", "permit_expediter"];
const APPROACH = ["custom", "prefab", "both"];
const BUILD_METHODS = ["site_built", "modular", "manufactured", "panelized", "kit"];
const PROFILE_STATUS = ["draft", "pending", "approved", "inactive"];
const INTRO_STATUS = ["requested", "sent", "declined"];

// Columns added by migration 0006. save() drops them and retries when the
// database says they do not exist yet, so an admin on a 0005 database can
// still edit the 0005 fields (deploy order is 0005 then 0006).
const COLUMNS_0006 = ["contact_name", "address_line", "city", "zip", "service_states", "build_methods", "turnkey", "licensed_states", "profile_status", "admin_notes", "commercial_terms"];
// 42703 / 42883 / 42P01 are Postgres (column, function, relation missing);
// PGRST204 / PGRST202 are PostgREST's schema-cache versions of the same.
const isNotMigrated = (error) => ["42703", "42883", "42P01", "PGRST204", "PGRST202"].includes(error?.code);
const fail = (res, error) => res.status(500).json({ error: isNotMigrated(error) ? `Migration 0006 is not applied yet (${error.message})` : error.message });

// Referral codes: 8 chars, uppercase, no 0/O/1/I (mirrors the check constraint
// in supabase/migrations/0005_builder_referrals.sql). 32 symbols divide a byte
// evenly, so `byte % 32` is unbiased.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_TRIES = 5;
const genReferralCode = () => Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % 32]).join("");
const isCodeCollision = (error) => error?.code === "23505" && /referral_code/.test(error.message || "");

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

// Create with a fresh referral code; retry only when that code collides.
const insertBuilder = async (ctx, row) => {
  let result;
  for (let i = 0; i < REFERRAL_TRIES; i++) {
    result = await ctx.svc.from("builders").insert({ ...row, referral_code: genReferralCode() }).select().maybeSingle();
    if (!isCodeCollision(result.error)) break;
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
  for (let i = 0; i < REFERRAL_TRIES; i++) {
    const { data, error } = await ctx.svc
      .from("builders")
      .update({ referral_code: genReferralCode() })
      .eq("id", builder.id)
      .is("referral_code", null)
      .select()
      .maybeSingle();
    if (!error) return data || builder;
    if (!isCodeCollision(error)) {
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
  res.status(200).json({ items: data || [] });
};

const save = async (req, res, ctx) => {
  const b = readBody(req).builder || {};
  if (!b.name || !STATE_RE.test(b.state || "")) return res.status(400).json({ error: "name and two-letter state required" });
  if (b.profile_status !== undefined && !PROFILE_STATUS.includes(b.profile_status)) return res.status(400).json({ error: "profile_status must be draft, pending, approved or inactive" });
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

  // The 0005 shape. Status, referral code, pricing terms, owner and audit
  // columns are never taken from the body here: approve / set-status own the
  // status, insertBuilder owns the code, and the terms keep their defaults.
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
    build_approach: APPROACH.includes(b.build_approach) ? b.build_approach : "both",
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
    turnkey: Boolean(b.turnkey),
    licensed_states: licensedStates,
    admin_notes: text(b.admin_notes, 4000),
    commercial_terms: text(b.commercial_terms, 4000),
  };
  if (b.profile_status !== undefined) extra.profile_status = b.profile_status;

  let result = b.id ? await updateBuilder(ctx, b.id, { ...row, ...extra }) : await insertBuilder(ctx, { ...row, ...extra });
  let warning;
  if (isNotMigrated(result.error)) {
    result = b.id ? await updateBuilder(ctx, b.id, row) : await insertBuilder(ctx, row);
    warning = "Migration 0006 is not applied yet, so the new fields were not saved.";
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  if (!result.data) return res.status(404).json({ error: "builder not found" });
  const builder = await backfillReferralCode(ctx, await stampApproval(ctx, result.data));
  res.status(200).json({ ok: true, builder, ...(warning ? { warning } : {}) });
};

// Approval is the moment a profile becomes visible in the homeowner directory
// (builders_public reads approved + active rows). It also guarantees the row
// has a referral link, so a self-serve builder gets theirs the moment they
// are approved.
const approve = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const patch = { profile_status: "approved", active: true, approved_at: new Date().toISOString(), approved_by: ctx.row.id };
  const { data, error } = await updateBuilder(ctx, id, patch);
  if (error) return fail(res, error);
  if (!data) return res.status(404).json({ error: "builder not found" });
  res.status(200).json({ ok: true, builder: await backfillReferralCode(ctx, data) });
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
  res.status(200).json({ ok: true, builder: data });
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
  res.status(200).json({ ok: true, builder: data, path });
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
  res.status(200).json({ ok: true, builder: data });
};

const del = async (req, res, ctx) => {
  const { id } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const { error } = await ctx.svc.from("builders").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
};

const intros = async (req, res, ctx) => {
  const { data, error } = await ctx.svc
    .from("intro_requests")
    .select("id, message, status, admin_note, created_at, updated_at, users!inner(email, paid_tier, builder_packet), builders!inner(name, contact_email, contact_phone, website)")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const items = (data || []).map((r) => ({
    id: r.id,
    message: r.message,
    status: r.status,
    admin_note: r.admin_note,
    created_at: r.created_at,
    homeowner_email: r.users?.email,
    homeowner_tier: r.users?.paid_tier,
    homeowner_address: r.users?.builder_packet?.address || null,
    builder_name: r.builders?.name,
    builder_contact: r.builders?.contact_email || r.builders?.contact_phone || r.builders?.website || null,
  }));
  res.status(200).json({ items });
};

const introUpdate = async (req, res, ctx) => {
  const { id, status, admin_note } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const patch = {};
  if (status !== undefined) {
    if (!INTRO_STATUS.includes(status)) return res.status(400).json({ error: "invalid status" });
    patch.status = status;
  }
  if (admin_note !== undefined) patch.admin_note = admin_note || null;
  const { data, error } = await ctx.svc.from("intro_requests").update(patch).eq("id", id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true, intro: data });
};

// Attribution only: referral_stats() (rewritten in 0006 over referral_events)
// returns per-builder counts of visits, emails, accounts, purchases,
// purchase_amount_cents, profile_views, contacts and projects_signed, plus the
// 0005 leads_count / paid_count / paid_by_tier. No payout math here.
const referrals = async (req, res, ctx) => {
  const { data, error } = await ctx.svc.rpc("referral_stats");
  if (error) return fail(res, error);
  res.status(200).json({ items: data || [] });
};

// The one event only an admin can record. The homeowner is named by account
// email (users.email is citext, so the match is case-insensitive) or by
// users.id; either way the service client resolves it here and the caller
// never learns anything about the homeowner beyond "found" or "not found".
const markProjectSigned = async (req, res, ctx) => {
  const { builder_id, user_id, email, note } = readBody(req);
  if (!builder_id) return res.status(400).json({ error: "builder_id required" });
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
  const { data: b, error: bErr } = await ctx.svc.from("builders").select("id").eq("id", builder_id).maybeSingle();
  if (bErr) return res.status(500).json({ error: bErr.message });
  if (!b) return res.status(404).json({ error: "builder not found" });
  const { data, error } = await ctx.svc.rpc("admin_mark_project_signed", { p_builder_id: builder_id, p_user_id: uid, p_note: text(note, 2000) });
  if (error) return fail(res, error);
  res.status(200).json({ ok: true, event: data });
};

// The admin half of claiming. ADUAtlas seeds the directory, so most rows
// start with no owner_user_id and the builder cannot log in to a portal for
// a profile that is already theirs. This joins an existing 'pro' account
// (matched by citext email, so case does not matter) to one builder row.
// owner_user_id is unique, so a pro account owns at most one builder; a
// builder that already has an owner is not reassigned here (unlink first).
// The self-serve half (a builder finding and claiming its own listing) is a
// later pass. Nothing about the account beyond "found" is returned.
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
  const { data, error } = await ctx.svc.from("builders").update({ owner_user_id: u.id }).eq("id", id).is("owner_user_id", null).select().maybeSingle();
  if (error) return error.code === "23505" ? res.status(409).json({ error: "that account already owns another builder profile" }) : fail(res, error);
  if (!data) return res.status(409).json({ error: "this builder already has a portal account" });
  res.status(200).json({ ok: true, builder: data });
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
  referrals: { GET: referrals },
  "mark-project-signed": { POST: markProjectSigned },
  "link-owner": { POST: linkOwner },
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
