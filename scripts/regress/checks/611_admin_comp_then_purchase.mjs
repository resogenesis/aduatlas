// Admin comp is NOT a permanent flag (decision 2r, Richard's decision of
// 2026-09-27, migration 0023), guarded end to end.
//
// A comp gives a level for $0 and earns no credit. But 2r is explicit that an
// origin describes ONE entitlement, never the person: "a sponsored homeowner may
// later make a qualifying purchase and must receive credit for that money", and
// the same holds for a comped one. An implementation that marked comped ACCOUNTS
// as "no credit" would pass check 610 and fail this one.
//
// HOW. The comp goes through the REAL admin API on the target. The purchase
// cannot: staging has no Stripe keys, so its /api/stripe-webhook answers 500.
// So, exactly as check 602 does, this imports the CANDIDATE's own
// api/stripe-webhook.js, serves it on a local socket and posts a Stripe event
// signed with a secret generated in this process (no Stripe key is used). The
// handler writes to the TARGET's database (the runner refuses production) and
// touches only regress- accounts this check creates and deletes. Mail is off.
//
// What it proves:
//   1. before any money, the comped account's upgrade basis is NO-CREDIT
//      (fails on RC2a, where the comp is inferred as a purchase);
//   2. after a real, collected Platinum payment on the same account, the
//      purchase is recorded as 'purchase' and the basis is the plan bought;
//   3. a fresh webhook purchase still records 'purchase' and earns its credit,
//      so 0023 did not quietly deny credit to real buyers.
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const meta = {
  name: "611 admin comp is not a permanent flag (comp, then a real purchase)",
  rules: [
    "before any money, a comped account earns no upgrade credit",
    "a comped homeowner who later really pays is recorded as a purchase and earns the credit for that money",
    "a webhook purchase on a fresh account still records 'purchase' and earns its credit",
  ],
};

const CENTS = { roadmap: 7900, report: 27900, concierge: 50000 };
const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_FROM", "APP_BASE_URL"];

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `comp-then-purchase-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE" }));
  }

  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const whsec = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const admin = { Authorization: `Bearer ${await ctx.token("admin")}`, "Content-Type": "application/json" };
  const tag = `${ctx.prefix}-comppay`;
  const mail = (s) => `${tag}-${s}@rehearsal.aduatlas.test`;
  const created = [];
  let server;

  process.env.STRIPE_SECRET_KEY = "sk_test_regress_placeholder_not_a_key";
  process.env.STRIPE_WEBHOOK_SECRET = whsec;
  process.env.SUPABASE_URL = ctx.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ctx.serviceKey;
  process.env.APP_BASE_URL = ctx.base;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;

  try {
    const modulePath = process.env.REGRESS_WEBHOOK_MODULE || fileURLToPath(new URL("../../../api/stripe-webhook.js", import.meta.url));
    const handler = (await import(pathToFileURL(modulePath).href)).default;
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    server = http.createServer((req, res) => {
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (b) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(b)); return res; };
      handler(req, res).catch((e) => { res.statusCode = 599; res.end(String(e)); });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const hook = `http://127.0.0.1:${server.address().port}/api/stripe-webhook`;
    let n = 0;
    const pay = async (email, tier, amount) => {
      n += 1;
      const payload = JSON.stringify({
        id: `evt_${tag}_${n}`, object: "event", type: "checkout.session.completed", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000),
        data: { object: { id: `cs_test_${tag}_${n}`, object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid", amount_total: amount, currency: "usd", customer: null, customer_email: email, customer_details: { email }, metadata: { tier, referral_code: "", upgraded_from: "", credit_cents: "0", quiz_answers: "" } } },
      });
      const r = await fetch(hook, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: whsec }) }, body: payload });
      return r.status;
    };
    const basis = async (email) => {
      const r = await ctx.fetchJson(`${rest}/homeowner_upgrade_basis?select=user_id,paid_tier,paid_at,refunded_at,paid_origin,qualifying_paid_plan&email=eq.${encodeURIComponent(email)}`, { headers: H });
      if (r.status >= 300) throw new Error(`homeowner_upgrade_basis read failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
      return r.body[0] || null;
    };
    const live = (b) => Boolean(b?.paid_at) && !b?.refunded_at;
    const fmt = (b) => (b ? `tier=${b.paid_tier} live=${live(b)} origin=${b.paid_origin ?? "not recorded"} basis=${b.qualifying_paid_plan ?? "NO-CREDIT"}` : "no row");

    // 1. A comped Golden, through the real admin API.
    const comped = mail("comped");
    created.push(comped);
    const ins = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ email: comped }) });
    if (ins.status >= 300 || !ins.body?.[0]?.id) throw new Error(`fixture insert failed: ${ins.status} ${JSON.stringify(ins.body).slice(0, 160)}`);
    const r = await ctx.fetchJson(`${ctx.base}/api/admin/update-user`, { method: "POST", headers: admin, body: JSON.stringify({ id: ins.body[0].id, paid: true, paid_tier: "roadmap" }) });
    const before = await basis(comped);
    add(
      "comped-account-earns-no-credit-before-paying",
      meta.rules[0],
      r.status === 200 && live(before) && before?.paid_tier === "roadmap" && before?.paid_origin === "admin_comp" && before?.qualifying_paid_plan === null,
      `admin comp HTTP ${r.status}; ${fmt(before)}`
    );

    // 2. The same homeowner pays $279 for Platinum.
    const s2 = await pay(comped, "report", CENTS.report);
    const after = await basis(comped);
    add(
      "comped-homeowner-who-pays-earns-the-credit",
      meta.rules[1],
      s2 === 200 && live(after) && after?.paid_tier === "report" && after?.paid_origin === "purchase" && after?.qualifying_paid_plan === "report",
      `webhook HTTP ${s2}; before: ${fmt(before)}; after: ${fmt(after)}`
    );

    // 3. A fresh purchase, no comp anywhere.
    const buyer = mail("buyer");
    created.push(buyer);
    const s3 = await pay(buyer, "roadmap", CENTS.roadmap);
    const bought = await basis(buyer);
    add(
      "fresh-webhook-purchase-still-records-purchase",
      meta.rules[2],
      s3 === 200 && live(bought) && bought?.paid_origin === "purchase" && bought?.qualifying_paid_plan === "roadmap",
      `webhook HTTP ${s3}; ${fmt(bought)}`
    );
  } finally {
    if (server) server.close();
    for (const e of created) {
      await ctx.fetchJson(`${rest}/users?email=eq.${encodeURIComponent(e)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
    }
    await ctx.fetchJson(`${rest}/stripe_events?event_id=like.evt_${tag}_*`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return out;
}
