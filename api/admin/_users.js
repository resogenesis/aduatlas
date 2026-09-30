// GET /api/admin/users — list users for the admin table. Admin-only.
//
// Each row also says HOW an account holds its access: bought, sponsored or
// comped (decision 2r, and Richard's decision of 2026-09-27 for comps). A
// sponsored Golden, a comped Golden and a bought Golden are identical on
// paid_at and paid_tier, so this list used to show a city's sponsorship and an
// admin's comp as a sale. Whether MONEY bought the plan is read from migration
// 0019's authority, public.qualifying_paid_plan(), through the service-role-only
// view public.homeowner_upgrade_basis, the same place api/create-checkout.js
// reads the upgrade credit from. It is deliberately not rebuilt here from
// paid_origin: the ledger rule (a granted sponsorship in partner_redemptions)
// holds even when the column is empty, and a second copy of the rule would
// drift. paid_origin is read only to say WHY no money bought a plan.
//
//   access          'bought'     qualifying money bought the plan held
//                   'comped'     an admin granted the plan at no charge
//                                (paid_origin 'admin_comp', migration 0023)
//                   'sponsored'  any other live access that no qualifying money
//                                bought, which 0019 allows only for a sponsorship
//                   'unknown'    live access we cannot place (the origin data
//                                could not be read, or the row has no plan)
//                   null         no live access
//   origin_recorded true when users.paid_origin states the answer, false when
//                   it rests on 0019's rules instead (for 'bought', rule 5: no
//                   origin recorded and no sponsorship on record). The console
//                   shows such an account as "Not recorded", never as "Bought",
//                   so an inferred purchase is never presented as a recorded one.
//   revenue         list price in dollars this account adds to the overview's
//                   revenue: the price of the plan money bought, 0 for sponsored
//                   and comped access, null when unknown.
//                   api/admin/_overview.js sums the same value, so the two
//                   screens cannot disagree.
import { requireAdmin } from "../_admin.js";
import { planById } from "../../src/lib/plans.js";

export const BASIS_COLUMNS = "user_id, paid_tier, paid_at, refunded_at, paid_origin, qualifying_paid_plan";

const priceDollars = (planId) => {
  const plan = planById(planId);
  return plan ? plan.priceCents / 100 : 0;
};

export const ADMIN_COMP = "admin_comp";

// One account's access, from its homeowner_upgrade_basis row. Pass undefined
// when the origin data could not be read: live access is then "unknown".
//
// A recorded comp is checked FIRST, so "a comp is never revenue" does not rest
// on any other rule: on a database with 0023 qualifying_paid_plan() is already
// null for it (rule 3b), and a comp can never be counted as money here even if
// that ever changed.
export const accessOf = (basis) => {
  if (!basis) return { access: "unknown", origin_recorded: false, revenue: null, plan: null };
  const live = Boolean(basis.paid_at) && !basis.refunded_at;
  if (!live) return { access: null, origin_recorded: null, revenue: 0, plan: null };
  const held = planById(basis.paid_tier)?.id || null;
  if (held && basis.paid_origin === ADMIN_COMP) {
    return { access: "comped", origin_recorded: true, revenue: 0, plan: held };
  }
  const bought = planById(basis.qualifying_paid_plan)?.id || null;
  if (bought) {
    return { access: "bought", origin_recorded: basis.paid_origin === "purchase", revenue: priceDollars(bought), plan: bought };
  }
  if (held) {
    return { access: "sponsored", origin_recorded: basis.paid_origin === "sponsorship", revenue: 0, plan: held };
  }
  return { access: "unknown", origin_recorded: false, revenue: null, plan: null };
};

const NO_ACCESS = { access: null, origin_recorded: null, revenue: 0 };

// homeowner_upgrade_basis rows for these user ids, keyed by id, or null when
// the view cannot be read (a database without 0019). Chunked so the id list
// never makes an overlong URL.
const basisFor = async (svc, ids) => {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await svc
      .from("homeowner_upgrade_basis")
      .select(BASIS_COLUMNS)
      .in("user_id", ids.slice(i, i + 100));
    if (error) {
      console.error("admin users: origin data unavailable:", error.message);
      return null;
    }
    for (const row of data || []) out.set(row.user_id, row);
  }
  return out;
};

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

  const rows = data || [];
  const basis = await basisFor(ctx.svc, rows.map((u) => u.id));

  res.status(200).json({
    origin_available: Boolean(basis),
    users: rows.map((u) => {
      const live = Boolean(u.paid_at) && !u.refunded_at;
      const origin = live ? accessOf(basis ? basis.get(u.id) : undefined) : NO_ACCESS;
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        paid: live,
        paid_tier: live ? u.paid_tier : null,
        access: origin.access,
        origin_recorded: origin.origin_recorded,
        revenue: origin.revenue,
        created_at: u.created_at,
      };
    }),
  });
}
