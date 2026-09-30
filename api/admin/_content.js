// /api/admin/content/* — every content-management admin endpoint lives in
// this module, dispatched by api/admin/[...action].js (list, versions, save-draft, publish,
// rollback, revert-to-default, upload-image) rather than one file each, to stay under the
// Hobby plan's 12-serverless-function cap. Dispatches on the path segment
// after /content/ (req.query.action[0]) + HTTP method. Same URLs, same
// request/response shapes as if each were its own file — see src/lib/adminApi.js.
import { requireAdmin, readBody } from "../_admin.js";
import { isAdminEditable } from "../../src/lib/contentRegistry/editable.js";

const notEditable = (res, key) =>
  res.status(403).json({ error: `"${key}" is not admin-editable right now (course content only)` });

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
  // A short plain-text preview of each version, so a restore can say which text
  // it brings back. The value itself is unchanged.
  res.status(200).json({ versions: (data || []).map((v) => ({ ...v, preview: previewOf(v.value) })) });
};

// The first words of a stored value: a text field's text, an image's alt text or
// address, or the paragraphs, headings and list items of a blocks field.
const previewOf = (value) => {
  if (value == null) return "";
  const parts = [];
  const walk = (v) => {
    if (parts.join(" ").length > 200) return;
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") ["text", "h", "p", "remember", "list", "alt", "url"].forEach((k) => v[k] !== undefined && walk(v[k]));
  };
  walk(value);
  const s = parts.join(" ").replace(/\s+/g, " ").trim();
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

// POST /api/admin/content/save-draft — upsert one field's draft_value.
const saveDraft = async (req, res, ctx) => {
  const { key, type, page, label, value } = readBody(req);
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!isAdminEditable(key)) return notEditable(res, key);
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
  const blocked = keys.find((k) => !isAdminEditable(k));
  if (blocked) return notEditable(res, blocked);

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
  if (!isAdminEditable(key)) return notEditable(res, key);

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

// POST /api/admin/content/revert-to-default — { key }. Takes the key back to the
// text written in the code (R3-10, the B09 mechanism).
//
// A published value overrides the code default for as long as it exists, and
// the first publish of a key archives nothing (there was no earlier published
// value), so before this route the first publish could never be undone and a
// later correction to the code default never reached a learner whose key had
// been published once. This clears BOTH the published value and the draft, which
// is what "no row value" means to every reader: get_site_content() returns only
// non-null published values, and api/course.js serves the authored chapter or
// introduction when the published value is null. The row itself is kept, and
// the value being removed is archived first, so the History list can restore it
// exactly as rollback restores any other version.
const revertToDefault = async (req, res, ctx) => {
  const { key } = readBody(req);
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!isAdminEditable(key)) return notEditable(res, key);

  const { data: row, error: rowErr } = await ctx.svc
    .from("site_content")
    .select("draft_value, published_value")
    .eq("key", key)
    .maybeSingle();
  if (rowErr) return res.status(500).json({ error: rowErr.message });
  const hasPublished = row?.published_value !== null && row?.published_value !== undefined;
  const hasDraft = row?.draft_value !== null && row?.draft_value !== undefined;
  if (!row || (!hasPublished && !hasDraft)) return res.status(200).json({ ok: true, already_default: true, archived: false });

  const now = new Date().toISOString();
  if (hasPublished) {
    const { error: archiveErr } = await ctx.svc.from("site_content_versions").insert({
      key,
      value: row.published_value,
      published_at: now,
      published_by: ctx.row.email,
    });
    // Nothing is cleared when the text being removed could not be kept.
    if (archiveErr) return res.status(500).json({ error: `nothing was changed: the current text could not be archived first (${archiveErr.message})` });
  }
  const { error: updateErr } = await ctx.svc
    .from("site_content")
    .update({ draft_value: null, published_value: null, published_at: now, published_by: ctx.row.email })
    .eq("key", key);
  if (updateErr) return res.status(500).json({ error: updateErr.message });
  res.status(200).json({ ok: true, already_default: false, archived: hasPublished, had_published: hasPublished, had_draft: hasDraft });
};

// POST /api/admin/content/upload-image — { key, dataUrl, filename? }.
const uploadImage = async (req, res, ctx) => {
  const { key, dataUrl, filename } = readBody(req);
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  if (!isAdminEditable(key)) return notEditable(res, key);

  const match = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 image/png|jpeg|webp data URL" });
  const [, contentType, , base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "image too large (max 3MB)" });

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
  "revert-to-default": { POST: revertToDefault },
  "upload-image": { POST: uploadImage },
};

// Vercel's build for this project (framework "Other"/Vite, not Next.js)
// mis-generates the catch-all rewrite for [...action].js — its route config
// maps to a query param literally named "...action" instead of "action"
// (confirmed via `vercel build` + inspecting .vercel/output/config.json), so
// req.query.action is undefined in production. Work around it defensively:
// first look for ANY query key ending in "action" (covers the mangled name
// if Vercel ever fixes/changes it), then fall back to parsing the action
// straight out of the URL path, which is correct regardless of how the
// rewrite names its query param.
//
// PATH FIRST (2026-09-26). api/admin/[...action].js now restores the full
// original URL before this module runs (the deep-path routing fix found on
// staging), so /content/<action> is always in req.url. After that fix the
// catch-all query key holds the matched segment, "content", not the action, so
// reading it first answered "not found" for every content action. The query key
// remains only as a fallback, and it can never answer "content".
const actionFromRequest = (req) => {
  const pathname = (req.url || "").split("?")[0];
  const segments = pathname.split("/").filter(Boolean);
  const i = segments.indexOf("content");
  if (i >= 0 && segments.length > i + 1) return segments[i + 1];
  const keys = Object.keys(req.query || {});
  const actionKey = keys.find((k) => /action$/i.test(k));
  if (actionKey) {
    const v = req.query[actionKey];
    const a = Array.isArray(v) ? v[0] : v;
    if (a && a !== "content") return a;
  }
  return segments[segments.length - 1];
};

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const action = actionFromRequest(req);
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
