// POST /api/admin/content/publish — make one or more drafts live. Admin-only.
// Body: { keys: ["home.quizhero.heading", ...] }. For each key: archives the
// value about to be replaced into site_content_versions (so it's always
// possible to roll back), then copies draft_value -> published_value. Keys
// with no draft_value are skipped. The site_content_versions_prune trigger
// keeps only the 3 most recent archived versions per key.
import { requireAdmin, readBody } from "../../_admin.js";

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

  const { keys } = readBody(req);
  if (!Array.isArray(keys) || !keys.length) {
    res.status(400).json({ error: "keys required" });
    return;
  }

  const now = new Date().toISOString();
  const published = [];
  const skipped = [];

  for (const key of keys) {
    const { data: row, error: fetchErr } = await ctx.svc
      .from("site_content")
      .select("draft_value, published_value")
      .eq("key", key)
      .maybeSingle();

    if (fetchErr) {
      res.status(500).json({ error: fetchErr.message });
      return;
    }
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
      if (archiveErr) {
        res.status(500).json({ error: archiveErr.message });
        return;
      }
    }

    const { error: updateErr } = await ctx.svc
      .from("site_content")
      .update({ published_value: row.draft_value, published_at: now, published_by: ctx.row.email })
      .eq("key", key);
    if (updateErr) {
      res.status(500).json({ error: updateErr.message });
      return;
    }
    published.push(key);
  }

  res.status(200).json({ ok: true, published, skipped });
}
