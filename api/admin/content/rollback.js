// POST /api/admin/content/rollback — restore a content field to a prior
// archived version. Admin-only. Body: { key, versionId }. Archives the
// current published value first (so a rollback is itself reversible), then
// sets both published_value and draft_value to the restored version's value
// so the editor reflects reality.
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

  const { key, versionId } = readBody(req);
  if (!key || !versionId) {
    res.status(400).json({ error: "key and versionId required" });
    return;
  }

  const { data: version, error: versionErr } = await ctx.svc
    .from("site_content_versions")
    .select("value")
    .eq("id", versionId)
    .eq("key", key)
    .maybeSingle();
  if (versionErr) {
    res.status(500).json({ error: versionErr.message });
    return;
  }
  if (!version) {
    res.status(404).json({ error: "version not found" });
    return;
  }

  const { data: row, error: rowErr } = await ctx.svc
    .from("site_content")
    .select("published_value")
    .eq("key", key)
    .maybeSingle();
  if (rowErr) {
    res.status(500).json({ error: rowErr.message });
    return;
  }

  const now = new Date().toISOString();

  if (row?.published_value !== null && row?.published_value !== undefined) {
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
    .update({
      draft_value: version.value,
      published_value: version.value,
      published_at: now,
      published_by: ctx.row.email,
    })
    .eq("key", key);
  if (updateErr) {
    res.status(500).json({ error: updateErr.message });
    return;
  }

  res.status(200).json({ ok: true });
}
