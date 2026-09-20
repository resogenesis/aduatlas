// Vercel-style serverless function: creates a Stripe Checkout Session for
// the requested plan and returns { url } for the frontend to redirect to.
//
// Required env (server-side, never VITE_-prefixed):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ROADMAP     (price_... for Golden, $79)
//   STRIPE_PRICE_REPORT      (price_... for Platinum, $279)
//   STRIPE_PRICE_CONCIERGE   (price_... for Concierge, $500)
//   APP_BASE_URL             (e.g. https://aduatlas.com)
//
// Optional env (for upgrade credits):
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (to look up the buyer's current plan)
//
// Body shape (POST JSON):
//   { tier: "roadmap" | "report" | "concierge", email?: string, quizAnswers?: object }
//
// Upgrade credit: what the buyer already paid comes off the next plan up
// (Golden -> Platinum pays $200; Platinum -> Concierge pays $221). The credit
// is applied as a one-off Stripe coupon created for this session. Any missing
// config or lookup failure falls back to full price without throwing.
//
// SECURITY: price ids are resolved server-side from env. We never trust a
// client-supplied amount. Plan ids/prices come from src/lib/plans.js so the
// pricing page and the checkout can never disagree.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PLANS, planById, upgradeCreditCents } from "../src/lib/plans.js";

const TIER_TO_PRICE = {
  roadmap: process.env.STRIPE_PRICE_ROADMAP,
  report: process.env.STRIPE_PRICE_REPORT,
  concierge: process.env.STRIPE_PRICE_CONCIERGE,
};

// Best-effort lookup of the plan this email already owns (paid, not
// refunded). Returns null on any miss/error so checkout proceeds at full price.
const ownedPlanFor = async (email) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !url || !key) return null;
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("users")
      .select("paid_tier, paid_at, refunded_at")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error || !data || !data.paid_at || data.refunded_at) return null;
    return planById(data.paid_tier)?.id || null;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { tier, email, quizAnswers } = req.body || {};
  const plan = planById(tier);
  const priceId = plan ? TIER_TO_PRICE[plan.id] : null;
  if (!plan || !priceId) {
    res.status(400).json({ error: `unknown or unconfigured tier: ${tier}` });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`;

  try {
    let discounts;
    let creditCents = 0;
    const owned = await ownedPlanFor(email);
    if (owned) {
      creditCents = upgradeCreditCents(owned, plan.id);
      if (creditCents > 0) {
        const ownedName = planById(owned)?.name || "previous plan";
        const coupon = await stripe.coupons.create({
          amount_off: creditCents,
          currency: "usd",
          duration: "once",
          max_redemptions: 1,
          name: `${ownedName} credit toward ${plan.name}`,
          metadata: { email: email.toLowerCase(), from_tier: owned, to_tier: plan.id },
        });
        discounts = [{ coupon: coupon.id }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      // Append &tier so /welcome can read the purchased plan alongside the
      // server-verified session_id.
      success_url: `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}&tier=${encodeURIComponent(plan.id)}`,
      cancel_url: `${baseUrl}/unlock?tier=${encodeURIComponent(plan.id)}`,
      ...(discounts ? { discounts } : {}),
      metadata: {
        tier: plan.id,
        upgraded_from: owned && creditCents > 0 ? owned : "",
        credit_cents: String(creditCents),
        quiz_answers: quizAnswers ? JSON.stringify(quizAnswers).slice(0, 400) : "",
      },
    });

    res.status(200).json({ url: session.url, plans: PLANS.map((p) => p.id) });
  } catch (err) {
    res.status(500).json({ error: err.message || "stripe error" });
  }
}
