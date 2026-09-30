// WP2 (b), at the door: a signed-in homeowner is never sold a plan their account
// already holds, or one below it.
//
// RC2's /api/create-checkout took the order whatever the caller held, so a
// Platinum homeowner could pay $79 for Golden (and, before RC3's webhook rule,
// be moved down to it). RC3 answers a caller whose ACCESS TOKEN proves an
// account holding the requested tier or a higher one with
//   409 { error: "already_has_plan", message, heldTier, requestedTier }
// right after the tier is validated, before any price lookup or Stripe call. It
// reads the tier HELD (the entitlement LEVEL of 2r), so a sponsored Golden is
// refused Golden and may still buy Platinum. An anonymous caller is never
// refused on the strength of a body email: that would tell a stranger whether an
// address holds a paid account.
//
// OBSERVABLE WITHOUT STRIPE. The refusal comes before Stripe configuration is
// consulted, so on a target with no Stripe keys (staging today) a refused caller
// gets 409 from RC3 and 400 "unconfigured tier" from RC2. Expectations are
// derived from what each persona's row actually holds (read with the service
// role), not assumed.
//
// NEVER A CHARGE. A refused request never reaches Stripe on RC3. Requests that
// are NOT refused (the controls) would open a Checkout Session on a target with
// Stripe configured; a session is a payment page, not a charge, and nobody pays
// it. Even so, the whole check runs only when REGRESS_ENV_FILE proves Stripe TEST
// mode, or the target's webhook reports Stripe not configured at all; otherwise
// it SKIPS. A session URL that is not a test-mode session fails the check.
//
// The exported scenarios() is reused by WP2's local harness, which serves the
// candidate's own handler with Stripe's network blocked and counts every request
// that tries to reach Stripe, so it can prove "before any Stripe call" exactly.
import { planById, planRank, PLANS } from "../../../src/lib/plans.js";
import { probeWebhook, stripeMode, targetEnv } from "./621_stripe_webhook_paid_only.mjs";

export const meta = {
  name: "620 checkout refuses a plan the account already holds",
  rules: [
    "a signed-in homeowner asking for the plan they hold is refused with 409 and a plain message naming it",
    "a signed-in homeowner asking for a plan below the one they hold is refused with 409",
    "the refusal reads the tier held, not its origin: a sponsored Golden is refused Golden",
    "control: a signed-in homeowner with nothing live is not refused",
    "control: a sponsored Golden may still buy Platinum (the level is below)",
    "control: an anonymous caller is never refused on a body email, even one that holds a paid account",
  ],
};

const HOLDERS = ["golden_purchased", "platinum_purchased", "concierge_purchased", "golden_sponsored"];
const DASHES_OR_ARROWS = /[‒-―←-⇿]|->|=>|<-/;

const liveTier = async (ctx, email) => {
  const r = await ctx.fetchJson(
    `${ctx.supabaseUrl}/rest/v1/users?select=paid_tier,paid_at,refunded_at&email=eq.${encodeURIComponent(email)}`,
    { headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` } }
  );
  if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`users read failed: ${r.status}`);
  const row = r.body[0];
  return row?.paid_at && !row.refunded_at ? planById(row.paid_tier)?.id || null : null;
};

const has = (ctx, name) => {
  try {
    ctx.creds(name);
    return true;
  } catch {
    return false;
  }
};

// opts.base: where /api/create-checkout lives (the target, or the local harness).
// opts.stripeCalls: optional () => number, how many requests have tried to reach
// Stripe so far; only the local harness can supply it.
export async function scenarios(ctx, { base = ctx.base, stripeCalls = null } = {}) {
  const results = [];
  const add = (name, rule, ok, detail) => results.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const skip = (name, rule, detail) => results.push({ name, rule, status: "skip", detail });
  const checkout = async (tier, { persona = null, email = "" } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (persona) headers.Authorization = `Bearer ${await ctx.token(persona)}`;
    const before = stripeCalls ? stripeCalls() : null;
    const r = await ctx.fetchJson(`${base}/api/create-checkout`, { method: "POST", headers, body: JSON.stringify({ tier, email }) });
    r.stripe = stripeCalls ? stripeCalls() - before : null;
    return r;
  };
  const noStripe = (r) => r.stripe === null || r.stripe === 0;
  const stripeNote = (r) => (r.stripe === null ? "Stripe calls not observable on a deployed target" : `${r.stripe} request(s) tried to reach Stripe`);
  const testSessionOnly = (r) => !(r.status === 200 && r.body?.url && !/cs_test_/.test(r.body.url));
  const show = (r) => {
    const b = r.body && typeof r.body === "object" ? r.body : { raw: String(r.body).slice(0, 120) };
    const safe = { ...b };
    if (safe.url) safe.url = /cs_test_/.test(safe.url) ? "<test-mode session url>" : "<NON-TEST session url>";
    return `HTTP ${r.status} ${JSON.stringify(safe).slice(0, 260)}; ${stripeNote(r)}`;
  };

  // What each persona holds, from the database.
  const held = {};
  for (const p of [...HOLDERS, "homeowner_unpaid"]) {
    if (has(ctx, p)) held[p] = await liveTier(ctx, ctx.creds(p).email);
  }

  // Refused cases: every tier at or below the one held.
  const same = [];
  const lower = [];
  for (const p of HOLDERS) {
    const h = held[p];
    if (!h) continue;
    for (const t of PLANS.filter((x) => x.rank <= planRank(h))) {
      const r = await checkout(t.id, { persona: p, email: ctx.creds(p).email });
      const b = r.body || {};
      const heldPlan = planById(h);
      const ok =
        r.status === 409 &&
        b.error === "already_has_plan" &&
        b.heldTier === h &&
        b.requestedTier === t.id &&
        typeof b.message === "string" &&
        b.message.includes(heldPlan.name) &&
        !DASHES_OR_ARROWS.test(b.message) &&
        noStripe(r);
      (t.id === h ? same : lower).push({ p, t: t.id, h, ok, detail: `${p} (holds ${h}) asks ${t.id}: ${show(r)}` });
    }
  }
  const fold = (name, rule, list, none) => {
    if (!list.length) return skip(name, rule, none);
    const bad = list.filter((x) => !x.ok);
    add(name, rule, bad.length === 0, (bad.length ? bad : list).map((x) => x.detail).join(" | "));
  };
  fold("refuses-plan-held", meta.rules[0], same, "no persona holds a live tier");
  fold("refuses-plan-below", meta.rules[1], lower, "no persona holds a tier above Golden");

  if (held.golden_sponsored === "roadmap") {
    const x = same.find((c) => c.p === "golden_sponsored");
    add("refuses-by-level-not-origin", meta.rules[2], Boolean(x?.ok), x?.detail || "not asked");
  } else {
    skip("refuses-by-level-not-origin", meta.rules[2], `golden_sponsored holds ${held.golden_sponsored ?? "nothing live"}, not a live Golden`);
  }

  // Controls: these must NOT be refused.
  if (has(ctx, "homeowner_unpaid") && held.homeowner_unpaid === null) {
    const r = await checkout("roadmap", { persona: "homeowner_unpaid", email: ctx.creds("homeowner_unpaid").email });
    add("unpaid-not-refused", meta.rules[3], r.status !== 409 && testSessionOnly(r), show(r));
  } else {
    skip("unpaid-not-refused", meta.rules[3], "homeowner_unpaid is not a persona with nothing live");
  }
  if (held.golden_sponsored === "roadmap") {
    const r = await checkout("report", { persona: "golden_sponsored", email: ctx.creds("golden_sponsored").email });
    add("sponsored-may-buy-up", meta.rules[4], r.status !== 409 && testSessionOnly(r), show(r));
  } else {
    skip("sponsored-may-buy-up", meta.rules[4], "golden_sponsored is not a live Golden");
  }
  const paidPersona = HOLDERS.find((p) => held[p] && planRank(held[p]) >= 1);
  if (paidPersona) {
    const r = await checkout("roadmap", { email: ctx.creds(paidPersona).email });
    add("anonymous-never-refused", meta.rules[5], r.status !== 409 && testSessionOnly(r) && !JSON.stringify(r.body || "").includes("already"), `anonymous, body email of ${paidPersona}: ${show(r)}`);
  } else {
    skip("anonymous-never-refused", meta.rules[5], "no persona holds a live tier to try the address of");
  }
  return results;
}

export default async function (ctx) {
  const skipAll = (detail, status = "skip") => meta.rules.map((rule, i) => ({ name: `checkout-refusal-${i + 1}`, rule, status, detail }));
  if (!ctx.serviceKey) return skipAll("no service role key in REGRESS_ENV_FILE, so what each persona holds cannot be read");
  const mode = stripeMode(targetEnv());
  if (mode === "live") return skipAll("REGRESS_ENV_FILE holds a LIVE Stripe key for a non-production target; nothing was sent", "fail");
  if (mode !== "test") {
    const probe = await probeWebhook(ctx);
    if (probe !== "unconfigured") {
      return skipAll(
        `Stripe looks configured on ${ctx.base} (webhook answers ${probe}) but REGRESS_ENV_FILE does not prove TEST mode (sk_test_/rk_test_ STRIPE_SECRET_KEY or STRIPE_MODE=test), so no checkout request is sent`
      );
    }
  }
  return scenarios(ctx);
}
