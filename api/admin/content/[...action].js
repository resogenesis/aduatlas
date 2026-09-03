// /api/admin/content/* — every content-management admin endpoint lives in
// this one Vercel catch-all function (list, versions, save-draft, publish,
// rollback, upload-image) rather than one file each, to stay under the
// Hobby plan's 12-serverless-function cap. Dispatches on the path segment
// after /content/ (req.query.action[0]) + HTTP method. Same URLs, same
// request/response shapes as if each were its own file — see src/lib/adminApi.js.
import { requireAdmin, readBody } from "../../_admin.js";

const TYPES = ["text", "image", "blocks"];
const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/;
// Vercel's default Node function body limit is ~4.5MB; base64 adds ~33%
// overhead, so cap the decoded image well under that. The client downscales
// before upload (src/lib/imageResize.js), so this should rarely bind.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const BUCKET = "site-content";
const safeSegment = (s) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);

// GET /api/admin/content/list — every touched site_content row.
const list = async (req, res, ctx) => {
  const { data, error } = await ctx.svc
    .from("site_content")
    .select("key, page, label, type, draft_value, published_value, updated_at, updated_by, published_at, published_by");
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ items: data || [] });
};

// GET /api/admin/content/versions?key=... — last (up to 3) archived values.
const versions = async (req, res, ctx) => {
  const key = (req.query?.key || "").trim();
  if (!key) return res.status(400).json({ error: "key required" });
  const { data, error } = await ctx.svc
    .from("site_content_versions")
    .select("id, value, published_at, published_by")
    .eq("key", key)
    .order("published_at", { ascending: false })
    .limit(3);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ versions: data || [] });
};

// POST /api/admin/content/save-draft — upsert one field's draft_value.
const saveDraft = async (req, res, ctx) => {
  const { key, type, page, label, value } = readBody(req);
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!TYPES.includes(type)) return res.status(400).json({ error: "invalid type" });
  if (value === undefined) return res.status(400).json({ error: "value required" });

  const { error } = await ctx.svc.from("site_content").upsert(
    {
      key,
      type,
      page: page || null,
      label: label || null,
      draft_value: value,
      updated_at: new Date().toISOString(),
      updated_by: ctx.row.email,
    },
    { onConflict: "key" }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
};

// POST /api/admin/content/publish — { keys: [...] }. Archives the value
// about to be replaced, then copies draft_value -> published_value. Keys
// with no draft_value are skipped.
const publish = async (req, res, ctx) => {
  const { keys } = readBody(req);
  if (!Array.isArray(keys) || !keys.length) return res.status(400).json({ error: "keys required" });

  const now = new Date().toISOString();
  const published = [];
  const skipped = [];

  for (const key of keys) {
    const { data: row, error: fetchErr } = await ctx.svc
      .from("site_content")
      .select("draft_value, published_value")
      .eq("key", key)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!row || row.draft_value === null || row.draft_value === undefined) {
      skipped.push(key);
      continue;
    }
    if (row.published_value !== null && row.published_value !== undefined) {
      const { error: archiveErr } = await ctx.svc.from("site_content_versions").insert({
        key,
        value: row.published_value,
        published_at: now,
        published_by: ctx.row.email,
      });
      if (archiveErr) return res.status(500).json({ error: archiveErr.message });
    }
    const { error: updateErr } = await ctx.svc
      .from("site_content")
      .update({ published_value: row.draft_value, published_at: now, published_by: ctx.row.email })
      .eq("key", key);
    if (updateErr) return res.status(500).json({ error: updateErr.message });
    published.push(key);
  }
  res.status(200).json({ ok: true, published, skipped });
};

// POST /api/admin/content/rollback — { key, versionId }. Archives the
// current published value, then restores the chosen version.
const rollback = async (req, res, ctx) => {
  const { key, versionId } = readBody(req);
  if (!key || !versionId) return res.status(400).json({ error: "key and versionId required" });

  const { data: version, error: versionErr } = await ctx.svc
    .from("site_content_versions")
    .select("value")
    .eq("id", versionId)
    .eq("key", key)
    .maybeSingle();
  if (versionErr) return res.status(500).json({ error: versionErr.message });
  if (!version) return res.status(404).json({ error: "version not found" });

  const { data: row, error: rowErr } = await ctx.svc
    .from("site_content")
    .select("published_value")
    .eq("key", key)
    .maybeSingle();
  if (rowErr) return res.status(500).json({ error: rowErr.message });

  const now = new Date().toISOString();
  if (row?.published_value !== null && row?.published_value !== undefined) {
    const { error: archiveErr } = await ctx.svc.from("site_content_versions").insert({
      key,
      value: row.published_value,
      published_at: now,
      published_by: ctx.row.email,
    });
    if (archiveErr) return res.status(500).json({ error: archiveErr.message });
  }

  const { error: updateErr } = await ctx.svc
    .from("site_content")
    .update({ draft_value: version.value, published_value: version.value, published_at: now, published_by: ctx.row.email })
    .eq("key", key);
  if (updateErr) return res.status(500).json({ error: updateErr.message });
  res.status(200).json({ ok: true });
};

// POST /api/admin/content/upload-image — { key, dataUrl, filename? }.
const uploadImage = async (req, res, ctx) => {
  const { key, dataUrl, filename } = readBody(req);
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });

  const match = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 image/png|jpeg|webp data URL" });
  const [, contentType, , base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "image too large (max 8MB)" });

  const ext = contentType.split("/")[1];
  const path = `${safeSegment(key)}/${Date.now()}-${safeSegment(filename) || "image"}.${ext}`;

  const { error: uploadErr } = await ctx.svc.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (uploadErr) return res.status(500).json({ error: uploadErr.message });

  const { data } = ctx.svc.storage.from(BUCKET).getPublicUrl(path);
  res.status(200).json({ ok: true, url: data.publicUrl });
};

const ROUTES = {
  list: { GET: list },
  versions: { GET: versions },
  "save-draft": { POST: saveDraft },
  publish: { POST: publish },
  rollback: { POST: rollback },
  "upload-image": { POST: uploadImage },
};

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  const route = ROUTES[action];
  if (!route) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const fn = route[req.method];
  if (!fn) {
    res.status(405).json({ error: `${req.method} not allowed` });
    return;
  }
  await fn(req, res, ctx);
}
