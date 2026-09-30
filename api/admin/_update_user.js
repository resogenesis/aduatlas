// POST /api/admin/update-user — change a user's role, comp them a plan, or take
// their access away. Admin-only.
//
// Body: { id, role?, paid?: boolean, paid_tier? }
//   role                      "homeowner" | "pro" | "admin"
//   paid: true, paid_tier: T  COMP plan T: grant the level at no charge
//   paid: true                comp the plan already on the row
//   paid: false               take the access away (paid_tier: null is accepted
//                             beside it, for the console's older request shape)
// A paid_tier without paid is refused: it used to move a live account's level
// with nothing said about where it came from, which is how a comp became an
// inferred purchase.
//
// ADMIN-COMPED ACCESS IS ITS OWN ORIGIN (Richard's decision of 2026-09-27,
// migration 0023). An admin grant used to write paid_tier and paid_at and record
// no origin, so 0019's qualifying_paid_plan() rule 5 read it as a PURCHASE: the
// comped account earned a real Stripe coupon toward the next plan and counted as
// revenue. A comp now goes through public.admin_comp_entitlement(), which grants
// the level and records paid_origin = 'admin_comp' in ONE transaction. It has to
// be one transaction: 0019's trigger clears a same-value origin when the tier
// moves (comp Golden, then comp Platinum), so the origin must be restated in a
// second statement, the way api/stripe-webhook.js restates 'purchase', and two
// separate requests from here could leave a comp holding a NULL origin, which
// rule 5 reads as money. The function also refuses to comp over an entitlement
// money bought, because that would erase the only record of the payment (0023
// PART 4, rule 4).
//
// If the database does not have 0023 (a bundle deployed ahead of the migration,
// lane C of decision 2j) nothing is written and the admin is told why. Granting
// the level without its origin is exactly the defect, so there is no fallback.
//
// TAKING ACCESS AWAY leaves the fact honest. It clears paid_at and nothing else:
// the tier and the origin stay as the record of the entitlement that ended (a
// comp stays 'admin_comp', a purchase stays 'purchase'), the way a Stripe refund
// leaves them. It never sets refunded_at, because no money went back, and it
// never writes an origin. With paid_at null the account holds nothing and earns
// no credit (0019 rule 1), and 0019's trigger makes the old origin unknown the
// moment any later grant moves the entitlement.
import { requireAdmin, readBody } from "../_admin.js";
import { planById } from "../../src/lib/plans.js";

const ROLES = ["homeowner", "pro", "admin"];
const TIERS = ["roadmap", "report", "concierge"];

const planName = (id) => planById(id)?.name || id;

// PostgREST's "no such function" (PGRST202) or Postgres's own (42883).
const isMissingCompFunction = (error) =>
  Boolean(error) &&
  (error.code === "PGRST202" || error.code === "42883") &&
  /admin_comp_entitlement/.test(`${error.message || ""} ${error.details || ""} ${error.hint || ""}`);

const refusedBoughtMessage = (r) => {
  const plan = planName(r.qualifying_paid_plan || r.paid_tier);
  if (r.paid_origin === "purchase") {
    return `This account bought ${plan}, and the payment is on record. A comp would erase the record of that payment, so nothing was changed. The homeowner can upgrade at checkout, where what they paid counts toward the next plan.`;
  }
  return `This account's ${plan} counts as bought: no sponsorship or comp is on record for it. A comp would erase that, so nothing was changed. If it was really given by hand, take the access away first and then comp it.`;
};

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
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "id required" });
    return;
  }

  // ── validate everything before writing anything ───────────────────────────
  if (role !== undefined && !ROLES.includes(role)) {
    res.status(400).json({ error: "invalid role" });
    return;
  }
  // Guard against self-lockout: an admin can't strip their own admin role.
  if (id === ctx.row.id && role && role !== "admin") {
    res.status(400).json({ error: "can't remove your own admin role" });
    return;
  }
  if (paid !== undefined && typeof paid !== "boolean") {
    res.status(400).json({ error: "paid must be true or false" });
    return;
  }
  if (paid === undefined && paid_tier !== undefined) {
    res.status(400).json({ error: "send paid: true to comp a plan, or paid: false to take access away" });
    return;
  }
  if (paid === true && paid_tier !== undefined && !TIERS.includes(paid_tier)) {
    res.status(400).json({ error: "invalid tier" });
    return;
  }
  if (paid === false && paid_tier !== undefined && paid_tier !== null) {
    res.status(400).json({ error: "taking access away does not set a tier" });
    return;
  }
  if (role === undefined && paid === undefined) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  const out = { ok: true };

  // ── the entitlement first: it is the half that can be refused ─────────────
  if (paid === true) {
    let tier = paid_tier;
    if (tier === undefined) {
      const { data: existing, error: readError } = await ctx.svc
        .from("users")
        .select("paid_tier")
        .eq("id", id)
        .maybeSingle();
      if (readError) {
        res.status(500).json({ error: readError.message });
        return;
      }
      if (!existing) {
        res.status(404).json({ error: "no such user" });
        return;
      }
      tier = existing.paid_tier ?? null;
    }
    // A paid row with no paid_tier is ambiguous (the client falls back to the
    // highest tier), so a comp must name a plan.
    if (!TIERS.includes(tier)) {
      res.status(400).json({ error: "paid_tier required when comping a user" });
      return;
    }

    const { data: result, error } = await ctx.svc.rpc("admin_comp_entitlement", { p_user_id: id, p_tier: tier });
    if (error) {
      if (isMissingCompFunction(error)) {
        console.error("admin comp refused: public.admin_comp_entitlement is missing (migration 0023 not applied)");
        res.status(503).json({
          error: "Comped access cannot be recorded on this database yet (migration 0023 is not applied), so nothing was changed.",
        });
        return;
      }
      if (error.code === "P0002") {
        res.status(404).json({ error: "no such user" });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }
    if (result?.result === "refused_bought") {
      res.status(409).json({ error: refusedBoughtMessage(result), result: "refused_bought" });
      return;
    }
    if (result?.result !== "comped" && result?.result !== "unchanged") {
      res.status(500).json({ error: "the comp returned an unexpected answer, so its effect is not known" });
      return;
    }
    out.result = result.result;
    out.paid_tier = result.paid_tier ?? null;
    out.paid_origin = result.paid_origin ?? null;
  } else if (paid === false) {
    const { data: rows, error } = await ctx.svc.from("users").update({ paid_at: null }).eq("id", id).select("id");
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!rows || rows.length === 0) {
      res.status(404).json({ error: "no such user" });
      return;
    }
    out.result = "revoked";
  }

  if (role !== undefined) {
    const { data: rows, error } = await ctx.svc.from("users").update({ role }).eq("id", id).select("id");
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!rows || rows.length === 0) {
      res.status(404).json({ error: "no such user" });
      return;
    }
  }

  res.status(200).json(out);
}
