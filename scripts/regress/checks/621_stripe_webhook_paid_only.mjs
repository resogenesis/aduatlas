// WP2 (a): an unpaid or incomplete Stripe payment grants NOTHING.
//
// checkout.session.completed fires when the buyer finishes Stripe's form, which
// is not the same as Stripe holding the money. RC2's api/stripe-webhook.js
// granted the tier on that event whatever payment_status said, so a session
// Stripe had not collected on ('unpaid', or 'no_payment_required') opened the
// product, moved a sponsored homeowner's tier and revived a refunded account.
// RC3 grants only when the session says payment_status 'paid', on the completed
// event or on checkout.session.async_payment_succeeded, by the same code, and
// ignores checkout.session.async_payment_failed.
//
// WHERE IT RUNS. Against the DEPLOYED target's /api/stripe-webhook, with events
// built here and signed with the TARGET's own webhook secret. The webhook never
// calls Stripe, and none of these events names a real charge, so nothing here
// can move money. It SKIPS, with the reason, until all of this holds:
//   * the target's webhook answers like a configured one (400 on an unsigned
//     body, not 500 "not configured"): Stripe is configured there;
//   * REGRESS_ENV_FILE (or REGRESS_STRIPE_WEBHOOK_SECRET) holds the target's
//     STRIPE_WEBHOOK_SECRET, so an event can be signed for it;
//   * REGRESS_ENV_FILE proves TEST mode: a STRIPE_SECRET_KEY starting sk_test_
//     or rk_test_, or STRIPE_MODE=test. A live key on a non-production target
//     is reported as a failure and nothing is sent.
// Every account it touches is a regress- address on rehearsal.aduatlas.test
// (a reserved TLD, so a welcome email the target may try to send reaches no
// one), created and deleted here with the service role.
//
// The exported pieces (gate, signing, fixtures, event builders, scenarios) are
// reused by 622 and by the WP2 local harness, which serves the candidate's own
// handler on a local socket with a throwaway secret to prove the same rules
// before Stripe exists on staging.
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

export const meta = {
  name: "621 stripe webhook grants only a paid session",
  rules: [
    "a paid checkout session grants its tier (control: the harness can grant)",
    "an unpaid completed session grants nothing to a new address",
    "a no-payment-required session grants nothing",
    "an unpaid session never moves an existing sponsored tier or its origin",
    "an unpaid session never revives a refunded account",
    "an async payment that fails grants nothing, before or after the failure",
    "an async payment that succeeds grants the tier, recorded as a purchase, and only then",
  ],
};

export const PRICE = { roadmap: 7900, report: 27900, concierge: 50000 };

// ---- the target and its Stripe mode -------------------------------------------

export const targetEnv = () => {
  const f = (process.env.REGRESS_ENV_FILE || "").replace(/^~(?=$|\/)/, os.homedir());
  if (!f || !fs.existsSync(f)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
  );
};

// "test" | "live" | "unknown", from what this run was given. Never a value.
export const stripeMode = (env = targetEnv()) => {
  const key = process.env.REGRESS_STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || "";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if ((process.env.REGRESS_STRIPE_MODE || env.STRIPE_MODE || "").toLowerCase() === "test") return "test";
  return "unknown";
};

// An unsigned POST: a configured webhook refuses the signature (400); an
// unconfigured one says so (500). Neither writes anything.
export const probeWebhook = async (ctx) => {
  const r = await ctx.fetchJson(`${ctx.base}/api/stripe-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  if (r.status === 500 && /not configured/i.test(text)) return "unconfigured";
  if (r.status === 400 && /signature/i.test(text)) return "configured";
  return `HTTP ${r.status}`;
};

export const webhookGate = async (ctx) => {
  if (!ctx.serviceKey) return { ok: false, status: "skip", reason: "no service role key in REGRESS_ENV_FILE, so fixtures and results cannot be read" };
  const env = targetEnv();
  const mode = stripeMode(env);
  if (mode === "live") {
    return { ok: false, status: "fail", reason: "REGRESS_ENV_FILE holds a LIVE Stripe key for a non-production target; nothing was sent" };
  }
  const probe = await probeWebhook(ctx);
  if (probe !== "configured") {
    return {
      ok: false,
      status: "skip",
      reason: `Stripe is not configured on ${ctx.base} (its webhook answers ${probe === "unconfigured" ? '500 "not configured"' : probe}); this runs once Stripe TEST mode is configured there. WP2's local harness proves the rule meanwhile`,
    };
  }
  const secret = process.env.REGRESS_STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET || "";
  if (!/^whsec_/.test(secret)) {
    return { ok: false, status: "skip", reason: "the target's STRIPE_WEBHOOK_SECRET is not in REGRESS_ENV_FILE (or REGRESS_STRIPE_WEBHOOK_SECRET), so no event can be signed for it" };
  }
  if (mode !== "test") {
    return { ok: false, status: "skip", reason: "cannot confirm the target's Stripe is in TEST mode: add its sk_test_/rk_test_ STRIPE_SECRET_KEY, or STRIPE_MODE=test, to REGRESS_ENV_FILE" };
  }
  return { ok: true, secret };
};

// ---- signing and posting --------------------------------------------------------

// Stripe's scheme: v1 = HMAC-SHA256(secret, "<t>.<payload>"), the same thing
// stripe.webhooks.generateTestHeaderString produces.
export const signature = (payload, secret) => {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
};

export const postTo = (url, secret) => async (event) => {
  const payload = JSON.stringify(event);
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature(payload, secret) },
    body: payload,
  });
  return { status: r.status, body: await r.text() };
};

// ---- events ---------------------------------------------------------------------

export const eventFactory = (tag) => {
  let n = 0;
  const ev = (type, object) => ({
    id: `evt_${tag}_${++n}`,
    object: "event",
    type,
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  });
  const session = (email, tier, { status = "paid", amount = PRICE[tier] ?? 0, id } = {}) => ({
    id: id || `cs_test_${tag}_${n + 1}`,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    livemode: false,
    payment_status: status,
    amount_total: amount,
    currency: "usd",
    customer: null,
    customer_email: email,
    customer_details: { email },
    payment_intent: `pi_test_${tag}_${n + 1}`,
    metadata: { tier, referral_code: "", upgraded_from: "", credit_cents: "0", quiz_answers: "" },
  });
  return {
    completed: (email, tier, o) => ev("checkout.session.completed", session(email, tier, o)),
    asyncSucceeded: (email, tier, o = {}) => ev("checkout.session.async_payment_succeeded", session(email, tier, { ...o, status: "paid" })),
    asyncFailed: (email, tier, o = {}) => ev("checkout.session.async_payment_failed", session(email, tier, { ...o, status: "unpaid" })),
  };
};

// ---- the target's database, service role, regress- rows only -----------------

export const store = (ctx) => {
  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  return {
    async row(email) {
      const r = await ctx.fetchJson(`${rest}/users?select=paid_tier,paid_at,refunded_at,paid_origin&email=eq.${encodeURIComponent(email)}`, { headers: H });
      if (r.status >= 300) throw new Error(`users read failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
      return r.body[0] || null;
    },
    async insert(row) {
      if (!/^regress-/.test(row.email)) throw new Error("fixtures must be regress- addresses");
      const r = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(row) });
      if (r.status >= 300) throw new Error(`fixture insert failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    },
    async eventRecorded(id) {
      const r = await ctx.fetchJson(`${rest}/stripe_events?select=event_id&event_id=eq.${encodeURIComponent(id)}`, { headers: H });
      return r.status < 300 && Array.isArray(r.body) && r.body.length === 1;
    },
    async cleanup(emails, tag) {
      for (const e of emails) {
        if (!/^regress-/.test(e)) continue;
        await ctx.fetchJson(`${rest}/users?email=eq.${encodeURIComponent(e)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
      }
      await ctx.fetchJson(`${rest}/stripe_events?event_id=like.evt_${tag}_*`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
    },
  };
};

export const isLive = (b) => Boolean(b?.paid_at) && !b?.refunded_at;
export const fmt = (b) => (b ? `tier=${b.paid_tier ?? "none"} live=${isLive(b)} paid_at=${b.paid_at ? "set" : "null"} refunded=${b.refunded_at ? "yes" : "no"} origin=${b.paid_origin ?? "not recorded"}` : "no row");
export const unchanged = (a, b) =>
  Boolean(a && b) && a.paid_tier === b.paid_tier && a.paid_at === b.paid_at && a.refunded_at === b.refunded_at && a.paid_origin === b.paid_origin;

// ---- the scenarios ----------------------------------------------------------------

// post(event) -> { status, body }. Every address it creates is pushed onto
// `created` as it is made, so the caller can clean up even after a throw.
export async function scenarios(ctx, post, { tag, created = [] }) {
  const results = [];
  const add = (name, rule, ok, detail) => results.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const db = store(ctx);
  const E = eventFactory(tag);
  const mail = (s) => {
    const e = `${tag}-${s}@rehearsal.aduatlas.test`;
    created.push(e);
    return e;
  };
  const past = new Date(Date.now() - 86400000).toISOString();

  // 1. Control: a paid session grants.
  const paid = mail("paid");
  let r = await post(E.completed(paid, "roadmap"));
  let b = await db.row(paid);
  add("paid-session-grants", meta.rules[0], r.status === 200 && isLive(b) && b.paid_tier === "roadmap" && b.paid_origin === "purchase", `HTTP ${r.status}; ${fmt(b)}`);

  // 2. Unpaid, new address.
  const unpaid = mail("unpaid");
  r = await post(E.completed(unpaid, "report", { status: "unpaid" }));
  b = await db.row(unpaid);
  add("unpaid-session-grants-nothing", meta.rules[1], r.status === 200 && b === null, `HTTP ${r.status}; ${fmt(b)}`);

  // 3. No payment required (a 100% discount), new address.
  const free = mail("nopayment");
  r = await post(E.completed(free, "concierge", { status: "no_payment_required", amount: 0 }));
  b = await db.row(free);
  add("no-payment-required-grants-nothing", meta.rules[2], r.status === 200 && b === null, `HTTP ${r.status}; ${fmt(b)}`);

  // 4. Unpaid on a sponsored Golden, for a higher tier.
  const sponsored = mail("sponsored");
  await db.insert({ email: sponsored, paid_tier: "roadmap", paid_at: past, paid_origin: "sponsorship" });
  const sBefore = await db.row(sponsored);
  r = await post(E.completed(sponsored, "report", { status: "unpaid" }));
  const sAfter = await db.row(sponsored);
  add("unpaid-keeps-sponsored-tier", meta.rules[3], r.status === 200 && unchanged(sBefore, sAfter), `before ${fmt(sBefore)}; after HTTP ${r.status}; ${fmt(sAfter)}`);

  // 5. Unpaid on a refunded Platinum.
  const refunded = mail("refunded");
  await db.insert({ email: refunded, paid_tier: "report", paid_at: null, refunded_at: past });
  const rBefore = await db.row(refunded);
  r = await post(E.completed(refunded, "report", { status: "unpaid" }));
  const rAfter = await db.row(refunded);
  add("unpaid-keeps-refund", meta.rules[4], r.status === 200 && unchanged(rBefore, rAfter) && !isLive(rAfter), `before ${fmt(rBefore)}; after HTTP ${r.status}; ${fmt(rAfter)}`);

  // 6. Async payment that fails: completed 'unpaid', then async_payment_failed.
  const failing = mail("async-failed");
  const csFail = `cs_test_${tag}_asyncfail`;
  const r6a = await post(E.completed(failing, "concierge", { status: "unpaid", id: csFail }));
  const b6a = await db.row(failing);
  const r6b = await post(E.asyncFailed(failing, "concierge", { id: csFail }));
  const b6b = await db.row(failing);
  add(
    "async-failed-grants-nothing",
    meta.rules[5],
    r6a.status === 200 && r6b.status === 200 && b6a === null && b6b === null,
    `after completed(unpaid): HTTP ${r6a.status}; ${fmt(b6a)}; after async_payment_failed: HTTP ${r6b.status}; ${fmt(b6b)}`
  );

  // 7. Async payment that succeeds: nothing at completion, the tier at success.
  const succeeding = mail("async-ok");
  const csOk = `cs_test_${tag}_asyncok`;
  const r7a = await post(E.completed(succeeding, "report", { status: "unpaid", id: csOk }));
  const b7a = await db.row(succeeding);
  const r7b = await post(E.asyncSucceeded(succeeding, "report", { id: csOk }));
  const b7b = await db.row(succeeding);
  add(
    "async-succeeded-grants-then",
    meta.rules[6],
    r7a.status === 200 && r7b.status === 200 && b7a === null && isLive(b7b) && b7b.paid_tier === "report" && b7b.paid_origin === "purchase",
    `after completed(unpaid): HTTP ${r7a.status}; ${fmt(b7a)}; after async_payment_succeeded: HTTP ${r7b.status}; ${fmt(b7b)}`
  );

  return { results, created };
}

export default async function (ctx) {
  const gate = await webhookGate(ctx);
  if (!gate.ok) return meta.rules.map((rule, i) => ({ name: `webhook-paid-only-${i + 1}`, rule, status: gate.status, detail: gate.reason }));
  const tag = `${ctx.prefix}-621`;
  const created = [];
  try {
    return (await scenarios(ctx, postTo(`${ctx.base}/api/stripe-webhook`, gate.secret), { tag, created })).results;
  } finally {
    await store(ctx).cleanup(created, tag);
  }
}
