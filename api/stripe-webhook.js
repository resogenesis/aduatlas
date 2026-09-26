// Vercel-style serverless function: receives Stripe webhooks and reflects
// payment state into Supabase.
//
// Handled events:
//   checkout.session.completed → set users.paid_at + paid_tier; when the
//                                 session metadata carries a builder
//                                 referral_code, also stamp
//                                 users.referred_by_builder_id (first touch);
//                                 then, when the buyer is attributed to a
//                                 builder, record a package_purchased event
//                                 (tier + amount) in referral_events (0006)
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
// Required env:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET    (whsec_... — from stripe dashboard → webhooks)
//   SUPABASE_URL             (server-side; can be the same VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY  (NOT the anon key — needs upsert permission)

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { buffer } from "micro";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

// Builder referral attribution (migration 0005). Resolution order:
//   (a) session.metadata.referral_code, format-checked by create-checkout, when
//       it resolves to an ACTIVE builder;
//   (b) otherwise the most recent lead row for this email. A homeowner who
//       left an email through a referred visit but checked out from another
//       device (or with cleared storage) carries no code in the session, and
//       the lead row already holds the builder capture_lead resolved.
// The result is written to the buyer's row once. The UPDATE is guarded by
// "referred_by_builder_id is null", so a Stripe retry, a second purchase or an
// upgrade never re-attributes anyone. Note that on a database with 0006 the
// users upsert above already ran the insert-time trigger
// (inherit_referral_from_lead), which copies the lead's referrer onto a
// brand-new row; when that happened this function finds the column set and
// changes nothing, so the lead (the earlier touch) wins over a code that only
// rode along in the checkout session. Attribution only: no payout or
// commission logic. Every failure is logged and swallowed so the webhook
// still acknowledges the payment.
const REFERRAL_RE = /^[A-HJ-NP-Z2-9]{8}$/;

// (a) session metadata code -> { builderId, code } or null. Only an APPROVED,
// active builder resolves (0006). On a database that has 0005 but not 0006
// there is no profile_status column (Postgres 42703), so the lookup retries
// on `active` alone, exactly as 0005 did.
const resolveFromCode = async (supabase, rawCode) => {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code || !REFERRAL_RE.test(code)) return null;
  const lookup = (approvedOnly) => {
    let q = supabase.from("builders").select("id").eq("referral_code", code).eq("active", true);
    if (approvedOnly) q = q.eq("profile_status", "approved");
    return q.maybeSingle();
  };
  let { data: builder, error } = await lookup(true);
  if (error?.code === "42703") ({ data: builder, error } = await lookup(false));
  if (error) {
    console.error("referral builder lookup error:", error.message);
    return null;
  }
  return builder ? { builderId: builder.id, code } : null;
};

// (b) latest lead row for this email -> { builderId, code } or null.
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
  return { builderId: lead.referred_by_builder_id, code: lead.referral_code || null };
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
// not on whatever code happened to ride along in this session. Carries the
// tier and what Stripe charged (amount_total, in cents, after any upgrade
// credit). A buyer with no referring builder produces no event. Non-fatal:
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
    const amount = Number.isInteger(session.amount_total) ? session.amount_total : null;
    const tier = typeof session.metadata?.tier === "string" && session.metadata.tier ? session.metadata.tier : null;
    const { error: evErr } = await supabase.from("referral_events").insert({
      builder_id: buyer.referred_by_builder_id,
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
// refund touched, carrying the buyer's paid_tier and the amount Stripe
// returned in this refund. Stripe sends charge.refunded with the cumulative
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
    const rows = buyers
      .filter((b) => b?.id && b.referred_by_builder_id)
      .map((b) => ({
        builder_id: b.referred_by_builder_id,
        kind: "package_refunded",
        user_id: b.id,
        tier: typeof b.paid_tier === "string" && b.paid_tier ? b.paid_tier : null,
        amount_cents: amount,
      }));
    if (rows.length === 0) return;
    const { error } = await supabase.from("referral_events").insert(rows);
    if (error) console.error("package_refunded event error:", error.message);
  } catch (err) {
    console.error("package_refunded event threw:", err.message);
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;
      const tier = session.metadata?.tier;

      if (email && supabase) {
        const { error } = await supabase
          .from("users")
          .upsert(
            {
              email: email.toLowerCase(),
              stripe_customer_id: session.customer,
              paid_at: new Date().toISOString(),
              paid_tier: tier,
              refunded_at: null,
            },
            { onConflict: "email" }
          );
        if (error) console.error("supabase upsert error:", error.message);
        await attributeReferral(supabase, email, session.metadata?.referral_code);
        await recordPurchaseEvent(supabase, email, session);
      }
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
