// Vercel-style serverless function: verifies a Stripe Checkout Session.
//
// The frontend /welcome page calls this with ?session_id=cs_... (the value
// Stripe substitutes into success_url). We retrieve the session from Stripe and
// confirm it was actually PAID before telling the client to flip local access.
//
// This is the server-side companion to the localStorage UX hint: the client
// must NOT self-grant access just because it landed on /welcome. The real
// authoritative gate is still `users.paid_at` (set by the webhook), but this
// endpoint lets the success page confirm payment synchronously on redirect.
//
// Required env (server-side, never VITE_-prefixed):
//   STRIPE_SECRET_KEY
//
// Response: { paid: boolean, tier: "roadmap" | "report" | null }
//
// GET /api/verify-session?session_id=cs_...

import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sessionId = req.query?.session_id;
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "missing session_id" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session?.payment_status === "paid";
    const tier = session?.metadata?.tier || null;
    res.status(200).json({ paid, tier: paid ? tier : null });
  } catch (err) {
    // Unknown / malformed session id, or Stripe error: treat as unverified.
    res.status(200).json({ paid: false, tier: null, error: err.message || "verify failed" });
  }
}
