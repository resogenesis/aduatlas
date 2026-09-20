// /api/admin/builders/* — builder directory management. Dispatched by
// api/admin/[...action].js. Service role + requireAdmin.
//
//   GET  builders/list                    every builder (active and not)
//   POST builders/save     { builder }    create or update (id optional); returns the row
//   POST builders/upload   { id, kind: "logo"|"photo", dataUrl, filename? }
//   POST builders/remove-photo { id, path }
//   POST builders/delete   { id }         hard delete (cascades saves + intros)
//   GET  builders/intros                  intro requests with homeowner + builder
//   POST builders/intro-update { id, status?, admin_note? }
import { requireAdmin, readBody } from "../_admin.js";

const BUCKET = "builders";
const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/;
const MAX_BYTES = 4 * 1024 * 1024;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };
const SPECIALTIES = ["detached", "attached", "garage_conversion", "jadu", "prefab", "two_story"];
const SERVICE_TYPES = ["design_build", "general_contractor", "prefab_manufacturer", "architect", "permit_expediter"];
const APPROACH = ["custom", "prefab", "both"];
const INTRO_STATUS = ["requested", "sent", "declined"];

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
const strList = (v, allow) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).filter((x) => !allow || allow.includes(x)) : []);
const safe = (s) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);

const list = async (req, res, ctx) => {
  const { data, error } = await ctx.svc.from("builders").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ items: data || [] });
};

const save = async (req, res, ctx) => {
  const b = readBody(req).builder || {};
  if (!b.name || !/^[A-Z]{2}$/.test(b.state || "")) return res.status(400).json({ error: "name and two-letter state required" });
  const row = {
    name: String(b.name).trim().slice(0, 120),
    slug: slugify(b.slug || b.name) || `builder-${Date.now()}`,
    description: b.description ? String(b.description).slice(0, 4000) : null,
    website: b.website || null,
    external_link: b.external_link || null,
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
  const q = b.id ? ctx.svc.from("builders").update(row).eq("id", b.id) : ctx.svc.from("builders").insert(row);
  const { data, error } = await q.select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
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

const ROUTES = {
  list: { GET: list },
  save: { POST: save },
  upload: { POST: upload },
  "remove-photo": { POST: removePhoto },
  delete: { POST: del },
  intros: { GET: intros },
  "intro-update": { POST: introUpdate },
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
