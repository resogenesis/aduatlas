// Vercel-style serverless function: creates a Stripe Checkout Session
// for the requested tier and returns { url } for the frontend to redirect to.
//
// Required env (server-side, never VITE_-prefixed):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ROADMAP   (price_... for $99 Build Prepared course)
//   STRIPE_PRICE_REPORT    (price_... for $399 Feasibility Report)
//   APP_BASE_URL           (e.g. https://aduatlas.com)
//
// Optional env (for the "$99 credit toward the Report" promotion):
//   STRIPE_COUPON_ROADMAP_CREDIT  (coupon id giving $99 off the $399 Report)
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (to look up prior roadmap buyers)
//
// Body shape (POST JSON):
//   { tier: "roadmap" | "report" | "concierge", email?: string, quizAnswers?: object }
//
// Concierge is application-only — this endpoint declines self-serve checkout
// and returns a 400 with a hint for the frontend to surface a Calendly link.
//
// SECURITY: price ids are resolved server-side from env. We never trust a
// client-supplied amount.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const TIER_TO_PRICE = {
  roadmap: process.env.STRIPE_PRICE_ROADMAP,
  report: process.env.STRIPE_PRICE_REPORT,
};

// Best-effort lookup: has this email already purchased the $99 roadmap tier?
// Returns true only on a confident yes; any missing config / error / miss
// returns false so checkout falls back to full price WITHOUT throwing.
const alreadyBoughtRoadmap = async (email) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !url || !key) return false;
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("users")
      .select("paid_tier, paid_at, refunded_at")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error || !data) return false;
    // Only credit a real, non-refunded roadmap purchase.
    return data.paid_tier === "roadmap" && Boolean(data.paid_at) && !data.refunded_at;
  } catch {
    return false;
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { tier, email, quizAnswers } = req.body || {};

  if (tier === "concierge") {
    res.status(400).json({ error: "concierge-not-self-serve" });
    return;
  }

  const priceId = TIER_TO_PRICE[tier];
  if (!priceId) {
    res.status(400).json({ error: `unknown tier: ${tier}` });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`;

  try {
    // "$99 Build Prepared credit toward the Report": when buying the $399
    // report tier, apply a $99 discount coupon IF (a) this buyer already owns
    // the roadmap tier and (b) a coupon id is configured. If either is missing,
    // we silently fall back to full price (no throw) — the credit is a perk, not
    // a hard dependency of checkout.
    let discounts;
    if (tier === "report" && process.env.STRIPE_COUPON_ROADMAP_CREDIT) {
      if (await alreadyBoughtRoadmap(email)) {
        discounts = [{ coupon: process.env.STRIPE_COUPON_ROADMAP_CREDIT }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      // Append &tier so /welcome can read the purchased tier alongside the
      // server-verified session_id.
      success_url: `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}&tier=${encodeURIComponent(tier)}`,
      cancel_url: `${baseUrl}/unlock`,
      ...(discounts ? { discounts } : {}),
      metadata: {
        tier,
        quiz_answers: quizAnswers ? JSON.stringify(quizAnswers).slice(0, 480) : "",
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message || "stripe error" });
  }
}
