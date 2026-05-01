// Vercel-style serverless function: creates a Stripe Checkout Session
// for the requested tier and returns { url } for the frontend to redirect to.
//
// Required env (server-side, never VITE_-prefixed):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ROADMAP   (price_... for $79 Roadmap)
//   STRIPE_PRICE_REPORT    (price_... for $399 Builder-Ready Report)
//   APP_BASE_URL           (e.g. https://aduatlas.com)
//
// Body shape (POST JSON):
//   { tier: "roadmap" | "report" | "concierge", email?: string, quizAnswers?: object }
//
// Concierge is application-only — this endpoint declines self-serve checkout
// and returns a 400 with a hint for the frontend to surface a Calendly link.

import Stripe from "stripe";

const TIER_TO_PRICE = {
  roadmap: process.env.STRIPE_PRICE_ROADMAP,
  report: process.env.STRIPE_PRICE_REPORT,
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
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/unlock`,
      metadata: {
        tier,
        quiz_answers: quizAnswers ? JSON.stringify(quizAnswers).slice(0, 480) : "",
      },
      // Apply $79 Roadmap credit toward the $399 Report when applicable.
      // (Implementation TODO: detect prior Roadmap purchase via stripe_customer_id.)
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message || "stripe error" });
  }
}
