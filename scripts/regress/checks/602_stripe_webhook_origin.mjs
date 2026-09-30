// DEF-20 (the Stripe webhook recorded no entitlement origin), guarded by behaviour.
//
// Decision 2r and migration 0019: users.paid_origin says whether the entitlement
// in (paid_at, paid_tier) was a PURCHASE or a SPONSORSHIP ('purchase' |
// 'sponsorship' | NULL = not recorded). RC1's api/stripe-webhook.js wrote no
// origin at all, so every real purchase landed as "not recorded" and the upgrade
// credit and Amy's revenue rested on an inference.
//
// WHY THIS CHECK RUNS THE HANDLER HERE. Staging has no Stripe keys, so its
// deployed /api/stripe-webhook answers 500 "not configured" and no event can be
// delivered to it. This check therefore imports the CANDIDATE's own
// api/stripe-webhook.js (REGRESS_WEBHOOK_MODULE overrides the path, which is how
// the RC1 copy was shown red), serves it on a local socket and posts Stripe
// events signed with a secret generated in this process. No Stripe key is used:
// signature verification is local. The handler writes to the TARGET's database
// (the runner refuses production) and touches only regress- accounts it creates,
// which it deletes afterwards. Mail is disabled (RESEND_API_KEY is unset while
// it runs), so no welcome email is sent.
//
// What it proves, each against the real 0019 constraint and triggers:
//   1. a first purchase records paid_origin = 'purchase';
//   2. an UPGRADE from a recorded purchase still records 'purchase'. 0019's
//      trigger clears a same-value restatement when the tier moves, so a
//      one-statement fix fails exactly here;
//   3. a purchase after a refund records 'purchase';
//   4. a checkout Stripe collected no money on never turns a sponsorship into a
//      purchase: same tier keeps 'sponsorship', a new tier becomes unknown;
//   5. a sponsored homeowner who then really pays is recorded as a purchase,
//      so the credit follows the money (2r: not a permanent flag);
//   6. a forged signature is refused and writes nothing.
// The sponsorship fixture is recorded on the column only. The ledger rule
// (partner_redemptions) belongs to the database and is proved by
// supabase/tests/invariants/240_upgrade_credit.sql; redeeming a real partner
// code here would change a persona's partner analytics.
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const meta = {
  name: "602 stripe webhook records the entitlement origin",
  rules: [
    "a completed, paid checkout records paid_origin = 'purchase' beside the tier",
    "an upgrade from a recorded purchase is still recorded as a purchase",
    "a purchase after a refund is recorded as a purchase",
    "no money collected never overwrites a sponsorship with a purchase",
    "a sponsored homeowner who really pays is recorded as a purchase and earns the credit for it",
    "an event with a forged signature is refused and writes nothing",
  ],
};

const PRICE = { roadmap: 7900, report: 27900, concierge: 50000 };
const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_FROM", "APP_BASE_URL"];

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `webhook-origin-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE" }));
  }

  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const whsec = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  process.env.STRIPE_SECRET_KEY = "sk_test_regress_placeholder_not_a_key";
  process.env.STRIPE_WEBHOOK_SECRET = whsec;
  process.env.SUPABASE_URL = ctx.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ctx.serviceKey;
  process.env.APP_BASE_URL = ctx.base;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const tag = `${ctx.prefix}-wh`;
  const mail = (s) => `${tag}-${s}@rehearsal.aduatlas.test`;
  const created = [];
  let server;
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
    const post = async (event, secret = whsec) => {
      const payload = JSON.stringify(event);
      const r = await fetch(hook, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }) }, body: payload });
      return { status: r.status, body: await r.text() };
    };

    let n = 0;
    const ev = (type, object) => ({ id: `evt_${tag}_${++n}`, object: "event", type, api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), data: { object } });
    const checkout = (email, tier, { status = "paid", amount = PRICE[tier] } = {}) =>
      ev("checkout.session.completed", { id: `cs_test_${tag}_${n + 1}`, object: "checkout.session", mode: "payment", status: "complete", payment_status: status, amount_total: amount, currency: "usd", customer: null, customer_email: email, customer_details: { email }, metadata: { tier, referral_code: "", upgraded_from: "", credit_cents: "0", quiz_answers: "" } });
    const refund = (email, amount) =>
      ev("charge.refunded", { id: `ch_${tag}_${n + 1}`, object: "charge", customer: null, billing_details: { email }, receipt_email: email, amount_refunded: amount, refunds: { data: [{ amount }] } });
    const basis = async (email) => {
      const r = await ctx.fetchJson(`${rest}/homeowner_upgrade_basis?select=paid_tier,paid_at,refunded_at,paid_origin,qualifying_paid_plan&email=eq.${encodeURIComponent(email)}`, { headers: H });
      if (r.status >= 300) throw new Error(`homeowner_upgrade_basis read failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
      return r.body[0] || null;
    };
    const fmt = (b) => (b ? `tier=${b.paid_tier} live=${Boolean(b.paid_at) && !b.refunded_at} origin=${b.paid_origin ?? "not recorded"} credit basis=${b.qualifying_paid_plan ?? "none"}` : "no row");
    const mkSponsored = async (email) => {
      created.push(email);
      const r = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ email, paid_tier: "roadmap", paid_at: new Date().toISOString(), paid_origin: "sponsorship" }) });
      if (r.status >= 300) throw new Error(`sponsored fixture insert failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    };

    // 1. First purchase: payment precedes signup, so there is no row yet.
    const buyer = mail("buyer");
    created.push(buyer);
    let r = await post(checkout(buyer, "roadmap"));
    let b = await basis(buyer);
    add("first-purchase-records-purchase", meta.rules[0], r.status === 200 && b?.paid_tier === "roadmap" && b?.paid_origin === "purchase", `HTTP ${r.status}; ${fmt(b)}`);

    // 2. Upgrade Golden -> Platinum (the $200 difference).
    r = await post(checkout(buyer, "report", { amount: PRICE.report - PRICE.roadmap }));
    b = await basis(buyer);
    add("upgrade-keeps-a-recorded-purchase", meta.rules[1], r.status === 200 && b?.paid_tier === "report" && b?.paid_origin === "purchase", `HTTP ${r.status}; ${fmt(b)}`);

    // 3. Refund, then buy again.
    r = await post(refund(buyer, PRICE.report - PRICE.roadmap));
    const refunded = await basis(buyer);
    r = await post(checkout(buyer, "roadmap"));
    b = await basis(buyer);
    add(
      "purchase-after-refund-records-purchase",
      meta.rules[2],
      !refunded?.paid_at && Boolean(refunded?.refunded_at) && r.status === 200 && b?.paid_tier === "roadmap" && !b?.refunded_at && b?.paid_origin === "purchase",
      `after refund: ${fmt(refunded)}; after rebuy: HTTP ${r.status}; ${fmt(b)}`
    );

    // 4. A checkout with no money collected, on a sponsored Golden.
    const nomoney = mail("sponsored-nomoney");
    await mkSponsored(nomoney);
    r = await post(checkout(nomoney, "roadmap", { status: "no_payment_required", amount: 0 }));
    const same = await basis(nomoney);
    const r2 = await post(checkout(nomoney, "report", { status: "no_payment_required", amount: 0 }));
    const moved = await basis(nomoney);
    add(
      "no-money-never-overwrites-sponsorship",
      meta.rules[3],
      // RC3 (unpaid grants nothing): a no-payment session no longer moves the tier at all.
      r.status === 200 && same?.paid_origin === "sponsorship" && r2.status === 200 && moved?.paid_tier === "roadmap" && moved?.paid_origin === "sponsorship",
      `same tier: ${fmt(same)}; new tier: ${fmt(moved)}`
    );

    // 5. A sponsored Golden who then pays $279 for Platinum.
    const payer = mail("sponsored-paid");
    await mkSponsored(payer);
    r = await post(checkout(payer, "report"));
    b = await basis(payer);
    add("sponsored-then-paid-records-purchase", meta.rules[4], r.status === 200 && b?.paid_tier === "report" && b?.paid_origin === "purchase" && b?.qualifying_paid_plan === "report", `HTTP ${r.status}; ${fmt(b)}`);

    // 6. Forged signature.
    const forged = mail("forged");
    r = await post(checkout(forged, "concierge"), `whsec_${crypto.randomBytes(24).toString("base64url")}`);
    b = await basis(forged);
    add("forged-signature-writes-nothing", meta.rules[5], r.status === 400 && b === null, `HTTP ${r.status}; ${fmt(b)}`);
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
