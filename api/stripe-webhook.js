// Vercel-style serverless function: receives Stripe webhooks and reflects
// payment state into Supabase.
//
// Handled events:
//   checkout.session.completed → set users.paid_at + paid_tier
//   charge.refunded            → clear users.paid_at (set refunded_at) so the
//                                 "paid_at non-null AND not refunded" rule holds
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
      }
    } else if (event.type === "charge.refunded") {
      // A refund (full or partial) revokes access: clear paid_at and stamp
      // refunded_at so isPaid()'s server equivalent ("paid_at non-null AND not
      // refunded") evaluates false.
      const charge = event.data.object;
      const customerId = charge.customer;
      const email = charge.billing_details?.email || charge.receipt_email;

      if (supabase && (customerId || email)) {
        const patch = { paid_at: null, refunded_at: new Date().toISOString() };
        let query = supabase.from("users").update(patch);
        // Prefer the stable stripe_customer_id; fall back to email.
        query = customerId
          ? query.eq("stripe_customer_id", customerId)
          : query.eq("email", String(email).toLowerCase());
        const { error } = await query;
        if (error) console.error("supabase refund update error:", error.message);
      }
    }
  } catch (err) {
    // Don't 500 back to Stripe for downstream/infra errors after we've logged
    // them — that just triggers more retries. Acknowledge receipt.
    console.error("webhook handler error:", err.message);
  }

  res.status(200).json({ received: true });
}
