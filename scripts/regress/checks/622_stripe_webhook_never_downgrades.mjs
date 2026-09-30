// WP2 (b): a homeowner who holds a higher tier is never downgraded by buying a
// lower one.
//
// RC2's api/stripe-webhook.js upserted paid_tier from the session metadata on
// every completed checkout, so a Platinum or Concierge homeowner who bought
// Golden (an anonymous checkout carries no account, and create-checkout cannot
// refuse what it cannot see) was moved DOWN to Golden: they lost the worksheets,
// the study and the site plan they had paid for. RC3 writes the grant with one
// conditional UPDATE that cannot match a live row holding a higher tier; the
// payment is still recorded (stripe_events here; referral attribution and the
// package_purchased event are proved by WP2's local harness, because on staging
// they would need a tracked, public builder) and logged for operations.
//
// Upgrades, same-tier purchases, and purchases after a refund must still land,
// so each of those is here as a control: a guard that refused everything would
// fail them.
//
// Runs against the DEPLOYED target's webhook and SKIPS until Stripe TEST mode is
// configured there, exactly as 621 does (the gate, signing and fixtures are
// 621's). Nothing here can move money: the webhook never calls Stripe and the
// events name no real charge.
import { PRICE, eventFactory, fmt, isLive, postTo, store, unchanged, webhookGate } from "./621_stripe_webhook_paid_only.mjs";

export const meta = {
  name: "622 stripe webhook never lowers a live tier",
  rules: [
    "a paid Golden purchase leaves a live Platinum exactly as it was (tier, paid_at, origin), and the payment event is still recorded",
    "a paid Platinum purchase leaves a live Concierge exactly as it was",
    "control: an upgrade from a live Golden to Platinum still lands, recorded as a purchase",
    "control: a same-tier purchase still lands (a sponsored Golden who pays for Golden is recorded as a purchase)",
    "control: a purchase after a refund still lands (a refunded tier is not live)",
  ],
};

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

  // 1. Live Platinum, bought; then a paid Golden.
  const plat = mail("platinum");
  await db.insert({ email: plat, paid_tier: "report", paid_at: past, paid_origin: "purchase" });
  const pBefore = await db.row(plat);
  const ev1 = E.completed(plat, "roadmap");
  let r = await post(ev1);
  const pAfter = await db.row(plat);
  const recorded = await db.eventRecorded(ev1.id);
  add(
    "lower-purchase-keeps-platinum",
    meta.rules[0],
    r.status === 200 && unchanged(pBefore, pAfter) && pAfter.paid_tier === "report" && isLive(pAfter) && recorded,
    `before ${fmt(pBefore)}; after HTTP ${r.status}; ${fmt(pAfter)}; paid_at ${pBefore?.paid_at === pAfter?.paid_at ? "unchanged" : "CHANGED"}; stripe_events ${recorded ? "has" : "LACKS"} ${ev1.id}`
  );

  // 2. Live Concierge; then a paid Platinum.
  const conc = mail("concierge");
  await db.insert({ email: conc, paid_tier: "concierge", paid_at: past, paid_origin: "purchase" });
  const cBefore = await db.row(conc);
  r = await post(E.completed(conc, "report"));
  const cAfter = await db.row(conc);
  add("lower-purchase-keeps-concierge", meta.rules[1], r.status === 200 && unchanged(cBefore, cAfter) && cAfter.paid_tier === "concierge", `before ${fmt(cBefore)}; after HTTP ${r.status}; ${fmt(cAfter)}`);

  // 3. Control: live Golden, bought; then Platinum for the $200 difference.
  const gold = mail("golden");
  await db.insert({ email: gold, paid_tier: "roadmap", paid_at: past, paid_origin: "purchase" });
  r = await post(E.completed(gold, "report", { amount: PRICE.report - PRICE.roadmap }));
  let b = await db.row(gold);
  add("upgrade-still-lands", meta.rules[2], r.status === 200 && isLive(b) && b.paid_tier === "report" && b.paid_origin === "purchase", `HTTP ${r.status}; ${fmt(b)}`);

  // 4. Control: a sponsored Golden who pays $79 for Golden.
  const same = mail("sponsored-same");
  await db.insert({ email: same, paid_tier: "roadmap", paid_at: past, paid_origin: "sponsorship" });
  r = await post(E.completed(same, "roadmap"));
  b = await db.row(same);
  add("same-tier-still-lands", meta.rules[3], r.status === 200 && isLive(b) && b.paid_tier === "roadmap" && b.paid_origin === "purchase", `HTTP ${r.status}; ${fmt(b)}`);

  // 5. Control: a refunded Platinum who buys Golden.
  const refunded = mail("refunded");
  await db.insert({ email: refunded, paid_tier: "report", paid_at: null, refunded_at: past });
  r = await post(E.completed(refunded, "roadmap"));
  b = await db.row(refunded);
  add("after-refund-still-lands", meta.rules[4], r.status === 200 && isLive(b) && b.paid_tier === "roadmap" && b.paid_origin === "purchase", `HTTP ${r.status}; ${fmt(b)}`);

  return { results, created };
}

export default async function (ctx) {
  const gate = await webhookGate(ctx);
  if (!gate.ok) return meta.rules.map((rule, i) => ({ name: `webhook-never-lowers-${i + 1}`, rule, status: gate.status, detail: gate.reason }));
  const tag = `${ctx.prefix}-622`;
  const created = [];
  try {
    return (await scenarios(ctx, postTo(`${ctx.base}/api/stripe-webhook`, gate.secret), { tag, created })).results;
  } finally {
    await store(ctx).cleanup(created, tag);
  }
}
