// GET /api/admin/content — list every site_content row that has been touched
// (draft and/or published). Admin-only. The admin UI merges this with
// src/lib/contentRegistry/index.js (the source of truth for which keys exist and
// their default value) so untouched fields still show real, editable copy.
import { requireAdmin } from "../../_admin.js";

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const { data, error } = await ctx.svc
    .from("site_content")
    .select("key, page, label, type, draft_value, published_value, updated_at, updated_by, published_at, published_by");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ items: data || [] });
}
