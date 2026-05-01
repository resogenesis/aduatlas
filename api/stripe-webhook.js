// Vercel-style serverless function: receives Stripe webhooks (specifically
// checkout.session.completed) and marks the user as paid in Supabase.
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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;
    const tier = session.metadata?.tier;

    if (email) {
      const { error } = await supabase
        .from("users")
        .upsert(
          {
            email: email.toLowerCase(),
            stripe_customer_id: session.customer,
            paid_at: new Date().toISOString(),
            paid_tier: tier,
          },
          { onConflict: "email" }
        );
      if (error) console.error("supabase upsert error:", error.message);
    }
  }

  res.status(200).json({ received: true });
}
