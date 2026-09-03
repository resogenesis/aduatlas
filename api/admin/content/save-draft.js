// POST /api/admin/content/save-draft — upsert one content field's draft
// value. Admin-only. Never touches published_value — publish.js is the only
// path that makes a draft go live. Body: { key, type, page?, label?, value }.
import { requireAdmin, readBody } from "../../_admin.js";

const TYPES = ["text", "image", "blocks"];

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

  const { key, type, page, label, value } = readBody(req);
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "key required" });
    return;
  }
  if (!TYPES.includes(type)) {
    res.status(400).json({ error: "invalid type" });
    return;
  }
  if (value === undefined) {
    res.status(400).json({ error: "value required" });
    return;
  }

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

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(200).json({ ok: true });
}
