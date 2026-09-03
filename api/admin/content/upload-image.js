// POST /api/admin/content/upload-image — upload an admin-supplied image to
// the public `site-content` Storage bucket. Admin-only. Body:
// { key, dataUrl, filename? } where dataUrl is a base64 data: URL (the client
// downscales the image before sending — see src/lib/imageResize.js). Returns
// { ok, url }; the admin UI then calls save-draft with { url, alt }.
import { requireAdmin, readBody } from "../../_admin.js";

const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/;
// Vercel's default Node function body limit is ~4.5MB; base64 adds ~33%
// overhead, so cap the decoded image well under that. The client downscales
// before upload (src/lib/imageResize.js), so this should rarely bind.
const MAX_BYTES = 3 * 1024 * 1024;
const BUCKET = "site-content";

const safeSegment = (s) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const { key, dataUrl, filename } = readBody(req);
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "key required" });
    return;
  }

  const match = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) {
    res.status(400).json({ error: "dataUrl must be a base64 image/png|jpeg|webp data URL" });
    return;
  }
  const [, contentType, , base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_BYTES) {
    res.status(400).json({ error: "image too large (max 8MB)" });
    return;
  }

  const ext = contentType.split("/")[1];
  const path = `${safeSegment(key)}/${Date.now()}-${safeSegment(filename) || "image"}.${ext}`;

  const { error: uploadErr } = await ctx.svc.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (uploadErr) {
    res.status(500).json({ error: uploadErr.message });
    return;
  }

  const { data } = ctx.svc.storage.from(BUCKET).getPublicUrl(path);
  res.status(200).json({ ok: true, url: data.publicUrl });
}
