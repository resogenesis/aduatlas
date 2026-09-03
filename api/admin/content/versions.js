// GET /api/admin/content/versions?key=... — last (up to 3) archived published
// values for one content key, for the admin UI's "History" / rollback control.
// Admin-only.
import { requireAdmin } from "../../_admin.js";

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const key = (req.query?.key || "").trim();
  if (!key) {
    res.status(400).json({ error: "key required" });
    return;
  }

  const { data, error } = await ctx.svc
    .from("site_content_versions")
    .select("id, value, published_at, published_by")
    .eq("key", key)
    .order("published_at", { ascending: false })
    .limit(3);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ versions: data || [] });
}
