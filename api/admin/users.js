// GET /api/admin/users — list users for the admin table. Admin-only.
import { requireAdmin } from "../_admin.js";

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const { data, error } = await ctx.svc
    .from("users")
    .select("id, email, role, paid_at, paid_tier, refunded_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({
    users: (data || []).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      paid: Boolean(u.paid_at) && !u.refunded_at,
      paid_tier: Boolean(u.paid_at) && !u.refunded_at ? u.paid_tier : null,
      created_at: u.created_at,
    })),
  });
}
