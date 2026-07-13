// GET /api/admin/overview — aggregate stats for the admin dashboard.
// Admin-only (service role + requireAdmin). Revenue is derived from paid_tier
// at list price; treat as a headline figure, not accounting truth.
import { requireAdmin } from "../_admin.js";

const PRICES = { roadmap: 99, report: 399, concierge: 0 };

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const { svc } = ctx;

  const { data: users, error } = await svc
    .from("users")
    .select("email, role, paid_at, paid_tier, refunded_at, created_at");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const list = users || [];
  const isPaid = (u) => Boolean(u.paid_at) && !u.refunded_at;
  const paid = list.filter(isPaid);
  const tier = (t) => paid.filter((u) => u.paid_tier === t).length;
  const revenue = paid.reduce((sum, u) => sum + (PRICES[u.paid_tier] || 0), 0);

  const { count: leads } = await svc
    .from("leads")
    .select("*", { count: "exact", head: true });

  const recent = [...list]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map((u) => ({
      email: u.email,
      role: u.role,
      tier: isPaid(u) ? u.paid_tier : null,
      created_at: u.created_at,
    }));

  res.status(200).json({
    users: {
      total: list.length,
      homeowner: list.filter((u) => u.role === "homeowner").length,
      pro: list.filter((u) => u.role === "pro").length,
      admin: list.filter((u) => u.role === "admin").length,
    },
    paid: { total: paid.length, roadmap: tier("roadmap"), report: tier("report"), concierge: tier("concierge") },
    revenue,
    leads: leads || 0,
    recent,
  });
}
