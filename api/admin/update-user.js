// POST /api/admin/update-user — change a user's role / tier / paid state.
// Admin-only. Body: { id, role?, paid_tier?|null, paid?:boolean }.
import { requireAdmin, readBody } from "../_admin.js";

const ROLES = ["homeowner", "pro", "admin"];
const TIERS = ["roadmap", "report", "concierge"];

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

  const { id, role, paid_tier, paid } = readBody(req);
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }

  // Guard against self-lockout: an admin can't strip their own admin role.
  if (id === ctx.row.id && role && role !== "admin") {
    res.status(400).json({ error: "can't remove your own admin role" });
    return;
  }

  const patch = {};
  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      res.status(400).json({ error: "invalid role" });
      return;
    }
    patch.role = role;
  }
  if (paid_tier !== undefined) {
    if (paid_tier !== null && !TIERS.includes(paid_tier)) {
      res.status(400).json({ error: "invalid tier" });
      return;
    }
    patch.paid_tier = paid_tier;
  }
  if (paid === true) {
    patch.paid_at = new Date().toISOString();
    patch.refunded_at = null;
  } else if (paid === false) {
    patch.paid_at = null;
  }

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  const { error } = await ctx.svc.from("users").update(patch).eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(200).json({ ok: true });
}
