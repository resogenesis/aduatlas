// Vercel-style serverless function: receives Stripe webhooks and reflects
// payment state into Supabase.
//
// Handled events:
//   checkout.session.completed and
//   checkout.session.async_payment_succeeded
//                              → ONLY WHEN THE SESSION SAYS payment_status
//                                 'paid' (see THE GRANT RULES below): set
//                                 users.paid_at + paid_tier, and record
//                                 users.paid_origin = 'purchase' when Stripe
//                                 says money was actually collected (see
//                                 recordPurchase below), never lowering a live
//                                 higher tier; when the
//                                 session metadata carries a builder
//                                 referral_code, also stamp
//                                 users.referred_by_builder_id (first touch);
//                                 then, when the buyer is attributed to a
//                                 builder, record a package_purchased event
//                                 (tier + amount) in referral_events (0006);
//                                 and SEND THE WELCOME EMAIL to the address
//                                 Stripe billed (see sendWelcomeEmail below).
//                                 A session that is not paid writes nothing
//                                 and sends nothing; it is logged.
//   checkout.session.async_payment_failed
//                              → logged; grants nothing
//   charge.refunded            → clear users.paid_at (set refunded_at) so the
//                                 "paid_at non-null AND not refunded" rule holds;
//                                 when the buyer is attributed to a builder,
//                                 record a package_refunded event (tier +
//                                 refunded amount) so the event log and the
//                                 stats functions can net refunds out
//
// Idempotency: every event is recorded in a `stripe_events` table keyed by the
// Stripe event.id (unique). If we've already processed an id, we skip — Stripe
// retries deliveries, and we must not double-apply.
//
// Stripe → POST /api/stripe-webhook
//
// THE WELCOME EMAIL IS SENT FROM HERE, and this is the load-bearing change.
// It used to be fired from the browser on the /welcome success screen
// (src/pages/Welcome.jsx), which meant a buyer who closed the tab on that screen
// had paid between $79 and $500 and was never told the one thing they needed to
// know: create an account with the address you paid with. Stripe's webhook is
// the only event in the purchase that does not depend on the buyer's browser
// still being open, so the mail belongs here. The recipient is the address
// Stripe billed and the tier is the one in the session metadata, so the browser
// chooses neither. The stripe_events idempotency ledger above is what keeps a
// Stripe retry from mailing the buyer twice.
//
// Required env:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET    (whsec_... — from stripe dashboard → webhooks)
//   SUPABASE_URL             (server-side; can be the same VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY  (NOT the anon key — needs insert/update permission)
//   RESEND_API_KEY           (the welcome email; without it the payment is still
//   RESEND_FROM               recorded and the failure is logged, never thrown)
//   APP_BASE_URL             (every link in the email is built from this)

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { buffer } from "micro";
import { sendTemplateEmail } from "./send-email.js";
import { PLANS, planById, planRank } from "../src/lib/plans.js";

export const config = { api: { bodyParser: false } };

// Built lazily. `new Stripe(undefined)` throws "Neither apiKey nor
// config.authenticator provided" at MODULE LOAD, so on a deployment missing
// STRIPE_SECRET_KEY this function died at cold start: Stripe saw an opaque
// failure, retried forever, and nothing in the response said what was wrong.
// A missing key now produces one logged, explicit 500 instead.
const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
};

// Build the Supabase client lazily and only when configured, so the function
// doesn't crash at cold start in environments without Supabase env vars.
const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

// Record the event id and return true if it's NEW (safe to process), false if
// we've seen it before. No-ops cleanly (returns true) when Supabase or the
// stripe_events table isn't available so processing isn't blocked in dev.
//
// Expected table:
//   create table stripe_events (
//     event_id text primary key,
//     type text,
//     received_at timestamptz default now()
//   );
const markEventProcessed = async (supabase, event) => {
  if (!supabase) return true;
  try {
    const { error } = await supabase
      .from("stripe_events")
      .insert({ event_id: event.id, type: event.type });
    if (error) {
      // 23505 = unique_violation → already processed → skip (idempotent).
      if (error.code === "23505") return false;
      // Table missing / other infra error: log and fall through (don't block).
      console.error("stripe_events insert error:", error.message);
      return true;
    }
    return true;
  } catch (err) {
    console.error("stripe_events insert threw:", err.message);
    return true;
  }
};

// Builder referral attribution (migrations 0005 to 0007). Resolution order:
//   (a) session.metadata.referral_code, format-checked by create-checkout, when
//       it resolves to a builder whose TRACKING IS ACTIVE;
//   (b) otherwise the most recent lead row for this email, when the builder
//       it names still has tracking active. A homeowner who left an email
//       through a referred visit but checked out from another device (or with
//       cleared storage) carries no code in the session, and the lead row
//       already holds the builder capture_lead resolved.
// TRACKING ACTIVATES ON CLAIM (0007): a builder resolves only when it is
// approved, active and claimed (owner_user_id set), the same rule as
// builder_tracking_active() in SQL. An unclaimed listing seeded by ADUAtlas
// is a dead code here, in capture_lead and in log_referral_visit alike.
// The result is written to the buyer's row once. The UPDATE is guarded by
// "referred_by_builder_id is null", so a Stripe retry, a second purchase or an
// upgrade never re-attributes anyone. Note that on a database with 0006 the
// users insert in recordPurchase already ran the insert-time trigger
// (inherit_referral_from_lead), which copies the lead's referrer onto a
// brand-new row; when that happened this function finds the column set and
// changes nothing, so the lead (the earlier touch) wins over a code that only
// rode along in the checkout session. Attribution only: no payout or
// commission logic. Every failure is logged and swallowed so the webhook
// still acknowledges the payment.
const REFERRAL_RE = /^[A-HJ-NP-Z2-9]{8}$/;

// The tracking-active lookup shared by (a) and (b): `match` narrows the
// builders query (by referral_code or by id); the builder must be active,
// approved and claimed. On a database that has 0005 but not 0006 there is no
// profile_status or owner_user_id column (Postgres 42703), so the lookup
// retries on `active` alone, exactly as 0005 did. Returns the builder id or
// null.
const trackedBuilderId = async (supabase, match) => {
  const lookup = (full) => {
    let q = match(supabase.from("builders").select("id")).eq("active", true);
    if (full) q = q.eq("profile_status", "approved").not("owner_user_id", "is", null);
    return q.maybeSingle();
  };
  let { data: builder, error } = await lookup(true);
  if (error?.code === "42703") ({ data: builder, error } = await lookup(false));
  if (error) {
    console.error("referral builder lookup error:", error.message);
    return null;
  }
  return builder ? builder.id : null;
};

// (a) session metadata code -> { builderId, code } or null.
const resolveFromCode = async (supabase, rawCode) => {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code || !REFERRAL_RE.test(code)) return null;
  const builderId = await trackedBuilderId(supabase, (q) => q.eq("referral_code", code));
  return builderId ? { builderId, code } : null;
};

// (b) latest lead row for this email -> { builderId, code } or null. The
// lead's builder is re-checked against the tracking rule: a lead attributed
// before 0007, or to a builder that has since lost its owner, must not
// attribute a purchase to an unclaimed listing.
const resolveFromLead = async (supabase, email) => {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("referred_by_builder_id, referral_code")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("referral lead lookup error:", error.message);
    return null;
  }
  if (!lead?.referred_by_builder_id) return null;
  const builderId = await trackedBuilderId(supabase, (q) => q.eq("id", lead.referred_by_builder_id));
  return builderId ? { builderId, code: lead.referral_code || null } : null;
};

const attributeReferral = async (supabase, email, rawCode) => {
  if (!supabase || !email) return;
  try {
    const normalizedEmail = email.toLowerCase();
    const resolved = (await resolveFromCode(supabase, rawCode)) || (await resolveFromLead(supabase, normalizedEmail));
    if (!resolved) return;
    const { error } = await supabase
      .from("users")
      .update({ referred_by_builder_id: resolved.builderId, referral_code: resolved.code, referred_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .is("referred_by_builder_id", null);
    if (error) console.error("referral attribution error:", error.message);
  } catch (err) {
    console.error("referral attribution threw:", err.message);
  }
};

// package_purchased event (migration 0006). Runs AFTER attribution and reads
// the builder back from the buyer's row, so the event lands on the builder
// the attribution rules actually chose (first touch, never re-attributed),
// not on whatever code happened to ride along in this session. The builder the
// row names is then put through trackedBuilderId again: a row attributed
// before 0007 tightened the rules, or to a listing that has since lost its
// owner, must not add a purchase or a dollar to an unclaimed listing. Carries
// the tier and what Stripe charged (amount_total, in cents, after any upgrade
// credit). A buyer with no referring builder, or one whose builder is no
// longer tracked, produces no event. Non-fatal:
// a database without 0006 (missing table), or any other failure, is logged
// and the webhook still acknowledges the payment. Counts only; no fee or
// commission is computed here or anywhere.
const recordPurchaseEvent = async (supabase, email, session) => {
  if (!supabase || !email) return;
  try {
    const { data: buyer, error } = await supabase
      .from("users")
      .select("id, referred_by_builder_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) {
      console.error("purchase event buyer lookup error:", error.message);
      return;
    }
    if (!buyer?.referred_by_builder_id) return;
    // Tracking activates on claim, and it can go away again.
    const builderId = await trackedBuilderId(supabase, (q) => q.eq("id", buyer.referred_by_builder_id));
    if (!builderId) return;
    const amount = Number.isInteger(session.amount_total) ? session.amount_total : null;
    const tier = typeof session.metadata?.tier === "string" && session.metadata.tier ? session.metadata.tier : null;
    const { error: evErr } = await supabase.from("referral_events").insert({
      builder_id: builderId,
      kind: "package_purchased",
      user_id: buyer.id,
      tier,
      amount_cents: amount,
    });
    if (evErr) console.error("package_purchased event error:", evErr.message);
  } catch (err) {
    console.error("package_purchased event threw:", err.message);
  }
};

// package_refunded event (migration 0006). One event per attributed buyer the
// refund touched whose builder is still tracked (the same trackedBuilderId
// check recordPurchaseEvent makes, for the same reason: a refund must not
// subtract from a listing that never should have been credited), carrying the
// buyer's paid_tier and the amount Stripe returned in this refund. Stripe sends charge.refunded with the cumulative
// charge.amount_refunded; when the charge carries its refunds list the newest
// refund's own amount is used so a second partial refund is not counted
// twice, otherwise the cumulative figure is the best available number. A
// buyer with no referring builder produces no event. Non-fatal, like
// recordPurchaseEvent: a database without 0006 or any other failure is
// logged and the refund still acknowledges. Nothing here claws anything
// back; the event is a record.
const refundAmountCents = (charge) => {
  const latest = Array.isArray(charge.refunds?.data) ? charge.refunds.data[0] : null;
  if (latest && Number.isInteger(latest.amount)) return latest.amount;
  return Number.isInteger(charge.amount_refunded) ? charge.amount_refunded : null;
};

const recordRefundEvents = async (supabase, buyers, charge) => {
  if (!supabase || !Array.isArray(buyers) || buyers.length === 0) return;
  try {
    const amount = refundAmountCents(charge);
    const rows = [];
    for (const b of buyers) {
      if (!b?.id || !b.referred_by_builder_id) continue;
      const builderId = await trackedBuilderId(supabase, (q) => q.eq("id", b.referred_by_builder_id));
      if (!builderId) continue;
      rows.push({
        builder_id: builderId,
        kind: "package_refunded",
        user_id: b.id,
        tier: typeof b.paid_tier === "string" && b.paid_tier ? b.paid_tier : null,
        amount_cents: amount,
      });
    }
    if (rows.length === 0) return;
    const { error } = await supabase.from("referral_events").insert(rows);
    if (error) console.error("package_refunded event error:", error.message);
  } catch (err) {
    console.error("package_refunded event threw:", err.message);
  }
};

// THE ENTITLEMENT ORIGIN (decision 2r, migration 0019). users.paid_origin says
// whether the entitlement in (paid_at, paid_tier) was bought or sponsored. It
// allows exactly 'purchase', 'sponsorship', 'admin_comp' (0023) or NULL (constraint
// users_paid_origin_known), and it has no default, because null means "not
// recorded" (2b). This is the one writer that knows a purchase happened, so it
// records one here, at the source, instead of leaving the upgrade credit and
// Amy's revenue figure to infer it.
//
// Only money makes a purchase. The origin is written only when Stripe reports
// the session as paid with a positive amount. A session Stripe did not collect
// on (payment_status 'unpaid' or 'no_payment_required') never reaches this
// function at all: see THE GRANT RULES below, which grant nothing for it. A
// session marked paid with a zero total (not something this product's checkout
// produces) grants the tier but records no origin, so it never replaces a
// 'sponsorship' with a 'purchase' for money nobody paid.
//
// TWO statements, and the second is not optional. 0019's trigger
// users_paid_origin_follows_tier() clears paid_origin whenever a statement moves
// the tier (or sets paid_at from null) while leaving paid_origin at its OLD
// value. Postgres cannot tell "restated the same value" from "did not mention
// it". So a buyer who already holds a recorded 'purchase' and upgrades has the
// grant's 'purchase' wiped by that trigger, and the upgrade would land as "not
// recorded". The follow-up update does not move the tier, so the trigger leaves
// it alone. It fills a null only, on the live row for the tier just bought, so
// it can never overwrite a sponsorship or touch a refunded row.
//
// A database without 0019 (a bundle deployed ahead of the migration, lane C of
// 2j) has no paid_origin column. The payment must still be recorded, so the
// grant is retried without the origin and the gap is logged.
const PURCHASE_ORIGIN = "purchase";

const moneyWasCollected = (session) =>
  session?.payment_status === "paid" && Number.isInteger(session?.amount_total) && session.amount_total > 0;

const isMissingOriginColumn = (error) =>
  Boolean(error) && (error.code === "PGRST204" || error.code === "42703") && /paid_origin/.test(error.message || "");

// A PURCHASE NEVER LOWERS A LIVE TIER (RC3). A live entitlement is paid_at set
// and refunded_at null, the rule public.has_worksheet_entitlement() (0013)
// applies. api/create-checkout.js refuses a SIGNED-IN buyer who already holds
// the tier or a higher one, but an anonymous checkout carries only an address,
// and create-checkout deliberately does not look that address up: doing so
// would tell a stranger whether it holds a paid account. So the rule has to
// hold here, where every purchase lands.
//
// The write is ONE conditional UPDATE whose WHERE clause cannot match a live row
// holding a higher tier (liveTierNotAbove), so no read-then-write gap exists for
// a concurrent delivery to slip a downgrade through: Postgres re-checks the WHERE
// against the row version it actually updates. When the UPDATE matches nothing,
// the row either does not exist yet (payment precedes signup, so it is inserted)
// or holds a higher live tier. Then paid_tier, paid_at, refunded_at, paid_origin
// and stripe_customer_id all stay exactly as they were; the caller still records
// the payment as a payment (referral attribution and the package_purchased event
// carry the tier and amount actually bought) and the log names the session for
// operations. A null paid_tier on a live row is not a tier this product sells,
// so a known tier may replace it: that can only raise what the gates see.
//
// stripe_customer_id is written only when Stripe names a customer. The upsert
// this replaces wrote session.customer unconditionally, so a guest checkout
// (customer null) erased a customer id recorded earlier, and charge.refunded
// matches on that id first.
const liveTierNotAbove = (tier) => {
  const allowed = PLANS.filter((p) => p.rank <= planRank(tier)).map((p) => p.id);
  return `paid_at.is.null,refunded_at.not.is.null,paid_tier.is.null,paid_tier.in.(${allowed.join(",")})`;
};

// Returns { outcome: "granted" | "kept-higher" } or { error }.
const writeGrant = async (supabase, email, tier, patch) => {
  const update = () => supabase.from("users").update(patch).eq("email", email).or(liveTierNotAbove(tier)).select("id");
  let { data, error } = await update();
  if (error) return { error };
  if (data?.length) return { outcome: "granted" };
  const inserted = await supabase.from("users").insert({ email, ...patch });
  if (!inserted.error) return { outcome: "granted" };
  // 23505: the row exists. Either the UPDATE skipped it because it holds a
  // higher live tier, or it was created between the two statements; one more
  // conditional UPDATE tells the two apart under the same rule.
  if (inserted.error.code !== "23505") return { error: inserted.error };
  ({ data, error } = await update());
  if (error) return { error };
  return { outcome: data?.length ? "granted" : "kept-higher" };
};

// Returns "granted", "kept-higher" or "failed". `tier` is already known to be a
// plan this product sells (the caller checked), and the session is paid.
const recordPurchase = async (supabase, session, email, tier) => {
  const normalizedEmail = email.toLowerCase();
  const recordOrigin = moneyWasCollected(session);
  const patch = {
    paid_at: new Date().toISOString(),
    paid_tier: tier,
    refunded_at: null,
  };
  if (session.customer) patch.stripe_customer_id = session.customer;
  if (recordOrigin) patch.paid_origin = PURCHASE_ORIGIN;

  let result = await writeGrant(supabase, normalizedEmail, tier, patch);
  if (result.error && recordOrigin && isMissingOriginColumn(result.error)) {
    console.error("paid_origin column missing (migration 0019 not applied): purchase recorded without its origin");
    delete patch.paid_origin;
    result = await writeGrant(supabase, normalizedEmail, tier, patch);
    if (!result.error && result.outcome === "granted") return "granted";
  }
  if (result.error) {
    console.error("supabase purchase write error:", result.error.message);
    return "failed";
  }
  if (result.outcome === "kept-higher") {
    const { data: held } = await supabase.from("users").select("paid_tier").eq("email", normalizedEmail).maybeSingle();
    console.error(
      `purchase below the live tier, entitlement left unchanged: ${session.id || "session"} ` +
        `(payment_intent ${session.payment_intent || "unknown"}) paid ${session.amount_total} for ${tier}, ` +
        `but the account already holds live ${held?.paid_tier || "higher tier"}. ` +
        "Operations follow-up: contact the buyer about this payment. Warning: charge.refunded currently revokes " +
        "the account's access whichever charge it names, so refunding this payment in Stripe also removes the " +
        "higher tier until it is restored by hand."
    );
    return "kept-higher";
  }
  if (!recordOrigin) {
    console.error(
      `paid_origin not recorded for ${session.id || "session"}: payment_status=${session.payment_status}, amount_total=${session.amount_total}, tier=${tier}`
    );
    return "granted";
  }

  // The restatement. Fills a null left by 0019's trigger on an upgrade.
  const { error: originError } = await supabase
    .from("users")
    .update({ paid_origin: PURCHASE_ORIGIN })
    .eq("email", normalizedEmail)
    .eq("paid_tier", tier)
    .not("paid_at", "is", null)
    .is("refunded_at", null)
    .is("paid_origin", null);
  if (originError) console.error("paid_origin restatement error:", originError.message);
  return "granted";
};

// The welcome email, sent server-side on a completed checkout.
//
// Why it is here and not in the browser: payment precedes account creation in
// the locked flow, so the post-purchase mail is the only thing that tells a
// buyer to create the account their purchase attaches to. Firing it from the
// success screen meant it did not exist for anyone who closed that tab, and it
// also meant the send depended on a page load rather than on the payment.
//
// Everything the mail says comes from Stripe: the recipient is the address
// Stripe billed, and the tier is the one create-checkout wrote into the session
// metadata, validated against src/lib/plans.js so an unrecognised value produces
// the package-free wording rather than a wrong package name. Sent exactly once
// per Stripe event, because markEventProcessed has already rejected the retries.
//
// Every failure is logged and swallowed. A mail that does not send must never
// turn into a 500 back to Stripe, because that only earns another retry against
// a payment we have already recorded.
//
// `tier` is passed in by the caller: the plan bought, or null for the
// package-free wording. A purchase that left a higher live tier in place gets
// the package-free wording, because naming the lower package would describe an
// account the buyer does not have.
const sendWelcomeEmail = async (email, tier) => {
  if (!email) return;
  try {
    const sent = await sendTemplateEmail({
      template: "welcome",
      to: email,
      tier,
    });
    if (!sent.ok) console.error("welcome email not sent:", sent.error);
  } catch (err) {
    console.error("welcome email threw:", err.message);
  }
};

// THE GRANT RULES (RC3). checkout.session.completed fires when the buyer
// finishes Stripe's form, which is not the same as Stripe holding the money.
// With a delayed payment method the session completes 'unpaid' and the money
// arrives, or does not, days later as checkout.session.async_payment_succeeded
// or checkout.session.async_payment_failed; a 'no_payment_required' session
// collected nothing at all. This webhook used to grant the tier on completion
// whatever payment_status said.
//
// Now both events that can carry a paid session run through this one function
// and the same rule: only payment_status 'paid' grants. Anything else is logged
// and writes nothing that grants access: no paid_at, paid_tier or paid_origin,
// no referral attribution, no package_purchased event and no welcome email. The
// event itself is still in stripe_events (the idempotency ledger, not a grant).
// A paid session naming a tier this product does not sell (not one
// create-checkout made) also grants nothing, and is logged for operations.
// create-checkout makes card-only sessions today, so completion and payment
// coincide; the async arm is here so that adding a delayed method later cannot
// reopen the hole.
const GRANTING_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

const handleCheckoutSession = async (supabase, event) => {
  const session = event.data.object;
  const ref = session?.id || "session";
  if (session?.payment_status !== "paid") {
    console.error(`${event.type} ${ref}: payment_status=${session?.payment_status}; not paid, nothing granted`);
    return;
  }
  const tier = planById(session.metadata?.tier)?.id || null;
  if (!tier) {
    console.error(
      `${event.type} ${ref}: paid ${session.amount_total}, but the session names no tier this product sells ` +
        `(metadata.tier=${JSON.stringify(session.metadata?.tier ?? null)}); nothing granted. Operations follow-up.`
    );
    return;
  }
  const email = session.customer_email || session.customer_details?.email;

  let outcome = null;
  if (email && supabase) {
    outcome = await recordPurchase(supabase, session, email, tier);
    // Both run on "kept-higher" too: the homeowner really paid, so the payment
    // is attributed and counted like any other, for the tier it actually bought.
    await attributeReferral(supabase, email, session.metadata?.referral_code);
    await recordPurchaseEvent(supabase, email, session);
  }

  // Outside the Supabase branch on purpose: a buyer who paid must be told how
  // to reach what they bought even on a deployment where the database write
  // failed or Supabase is not configured. The mail is the only part of this
  // flow the buyer sees if their browser is already closed.
  await sendWelcomeEmail(email, outcome === "kept-higher" ? null : tier);
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Nothing can be verified without both, and an unverified webhook body must
    // never be trusted. Say so plainly rather than crashing at cold start.
    console.error("stripe webhook not configured: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing");
    res.status(500).json({ error: "stripe webhook not configured" });
    return;
  }

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    const raw = await buffer(req);
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
    return;
  }

  const supabase = getSupabase();

  // Idempotency guard — skip duplicates Stripe re-delivers.
  const isNew = await markEventProcessed(supabase, event);
  if (!isNew) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  try {
    if (GRANTING_EVENTS.has(event.type)) {
      await handleCheckoutSession(supabase, event);
    } else if (event.type === "checkout.session.async_payment_failed") {
      // The money never arrived. The completed event before it was 'unpaid' and
      // granted nothing, so there is nothing to undo; say so and move on.
      console.error(`checkout.session.async_payment_failed ${event.data.object?.id || "session"}: nothing granted`);
    } else if (event.type === "charge.refunded") {
      // A refund (full or partial) revokes access: clear paid_at and stamp
      // refunded_at so isPaid()'s server equivalent ("paid_at non-null AND not
      // refunded") evaluates false.
      const charge = event.data.object;
      const customerId = charge.customer;
      const email = charge.billing_details?.email || charge.receipt_email;

      if (supabase && (customerId || email)) {
        // Prefer the stable stripe_customer_id; fall back to email.
        const byBuyer = (q) =>
          customerId ? q.eq("stripe_customer_id", customerId) : q.eq("email", String(email).toLowerCase());
        const patch = { paid_at: null, refunded_at: new Date().toISOString() };
        // Read paid_tier before the update so the event carries what was
        // bought; the update leaves paid_tier alone but reading first keeps
        // the two steps independent.
        const { data: buyers, error: readErr } = await byBuyer(
          supabase.from("users").select("id, referred_by_builder_id, paid_tier")
        );
        if (readErr) console.error("supabase refund buyer lookup error:", readErr.message);
        const { error } = await byBuyer(supabase.from("users").update(patch));
        if (error) console.error("supabase refund update error:", error.message);
        await recordRefundEvents(supabase, buyers, charge);
      }
    }
  } catch (err) {
    // Don't 500 back to Stripe for downstream/infra errors after we've logged
    // them — that just triggers more retries. Acknowledge receipt.
    console.error("webhook handler error:", err.message);
  }

  res.status(200).json({ received: true });
}
