// GET /api/admin/overview — aggregate stats for the admin dashboard.
// Admin-only (service role + requireAdmin). Revenue is the list price of the
// plans qualifying money bought; treat it as a headline figure, not accounting
// truth.
//
// ONLY MONEY IS REVENUE (decision 2r, and Richard's decision of 2026-09-27 for
// comps). A Golden granted by a government Education Partner, and any plan an
// admin comps by hand, are written on paid_at and paid_tier exactly as a
// purchase is, so totalling paid_tier at list price counted every sponsored
// resident and every comp as a sale. Each live account is now classified by
// accessOf() in ./_users.js, which reads migration 0019's authority
// (qualifying_paid_plan, through homeowner_upgrade_basis) and, for comps,
// migration 0023's recorded origin:
//   paid       accounts whose plan was bought, counted by the plan money
//              bought. paid.not_recorded counts those whose purchase is inferred
//              by 0019's rule 5 (no origin recorded and no sponsorship on
//              record) rather than recorded by the Stripe webhook, and
//              revenue_not_recorded is the part of revenue that rests on it.
//   comped     accounts an admin gave a plan at no charge, by plan. Never
//              revenue, and never in the sponsored count either: a comp is
//              ADUAtlas's own decision and a sponsorship is a partner's.
//   sponsored  accounts holding sponsored access. Never revenue.
//   unknown    live accounts that cannot be placed. Never revenue.
// When the origin data cannot be read (a database without 0019) the revenue
// and the bought, comped and sponsored figures are null, not a guess (2b).
import { requireAdmin } from "../_admin.js";
import { PLAN_IDS } from "../../src/lib/plans.js";
import { accessOf, BASIS_COLUMNS } from "./_users.js";

// PostgREST returns at most 1000 rows per request, so a single select would
// quietly undercount once there are more accounts than that.
const PAGE = 1000;
const fetchAll = async (build) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { rows: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
};

const isLive = (u) => Boolean(u.paid_at) && !u.refunded_at;
const sum = (xs) => xs.reduce((s, x) => s + (x.o.revenue || 0), 0);

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const { svc } = ctx;

  const { rows: users, error } = await fetchAll(() =>
    svc.from("users").select("id, email, role, paid_at, paid_tier, refunded_at, created_at").order("id")
  );
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const { rows: basisRows, error: basisError } = await fetchAll(() =>
    svc.from("homeowner_upgrade_basis").select(BASIS_COLUMNS).order("user_id")
  );
  if (basisError) console.error("admin overview: origin data unavailable:", basisError.message);
  const basis = basisRows ? new Map(basisRows.map((b) => [b.user_id, b])) : null;

  const list = users || [];
  const originOf = (u) => (isLive(u) ? accessOf(basis ? basis.get(u.id) : undefined) : null);
  const live = list.map((u) => ({ u, o: originOf(u) })).filter((x) => x.o);
  const bought = live.filter((x) => x.o.access === "bought");
  const comped = live.filter((x) => x.o.access === "comped");
  const sponsored = live.filter((x) => x.o.access === "sponsored");
  const unknown = live.filter((x) => x.o.access === "unknown");
  const boughtPlan = (id) => bought.filter((x) => x.o.plan === id).length;
  const compedPlan = (id) => comped.filter((x) => x.o.plan === id).length;

  const { count: leads } = await svc
    .from("leads")
    .select("*", { count: "exact", head: true });

  const recent = [...list]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map((u) => ({
      email: u.email,
      role: u.role,
      tier: isLive(u) ? u.paid_tier : null,
      access: originOf(u)?.access ?? null,
      origin_recorded: originOf(u)?.origin_recorded ?? null,
      created_at: u.created_at,
    }));

  res.status(200).json({
    users: {
      total: list.length,
      homeowner: list.filter((u) => u.role === "homeowner").length,
      pro: list.filter((u) => u.role === "pro").length,
      admin: list.filter((u) => u.role === "admin").length,
    },
    origin_available: Boolean(basis),
    paid: basis
      ? {
          total: bought.length,
          roadmap: boughtPlan(PLAN_IDS.GOLDEN),
          report: boughtPlan(PLAN_IDS.PLATINUM),
          concierge: boughtPlan(PLAN_IDS.CONCIERGE),
          not_recorded: bought.filter((x) => !x.o.origin_recorded).length,
        }
      : null,
    comped: basis
      ? {
          total: comped.length,
          roadmap: compedPlan(PLAN_IDS.GOLDEN),
          report: compedPlan(PLAN_IDS.PLATINUM),
          concierge: compedPlan(PLAN_IDS.CONCIERGE),
        }
      : null,
    sponsored: basis ? { total: sponsored.length } : null,
    unknown: unknown.length,
    revenue: basis ? sum(bought) : null,
    revenue_not_recorded: basis ? sum(bought.filter((x) => !x.o.origin_recorded)) : null,
    leads: leads || 0,
    recent,
  });
}
