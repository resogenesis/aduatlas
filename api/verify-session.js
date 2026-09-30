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
// TWO DIFFERENT ANSWERS THAT USED TO LOOK THE SAME. This endpoint answered
// { paid: false } on ANY Stripe exception, so a network blip, a rate limit or a
// missing STRIPE_SECRET_KEY was indistinguishable from "Stripe says this session
// was not paid". /welcome then told a customer who had just been charged up to
// $500 "No active purchase found." That is a false statement about a fact the
// product does not know, and it is the worst possible thing to show someone who
// has just paid. The two cases are now separated:
//
//   "Stripe answered, and the answer is not paid"  → 200 { paid: false, status }
//   "We could not get an answer out of Stripe"     → 503 { status: "unavailable" }
//
// The distinction is drawn from the error Stripe's SDK raises. An invalid-request
// error IS an answer: Stripe looked and has no such session, or the id is
// malformed. An authentication, connection, rate-limit or API error is NOT an
// answer, and neither is a missing key: those are our problem, not the buyer's,
// and the page must say something true and recoverable instead of denying the
// purchase.
//
// Required env (server-side, never VITE_-prefixed):
//   STRIPE_SECRET_KEY
//
// Response:
//   200 { paid: true,  tier: string|null, status: "paid" }
//   200 { paid: false, tier: null, status: "unpaid" }       Stripe: not paid yet
//   200 { paid: false, tier: null, status: "not-found" }    Stripe: no such session
//   503 { paid: false, tier: null, status: "unavailable", error }  we could not ask
//
// `status` is the field callers should branch on. `paid` is kept for any caller
// that only cares about the grant, and it is false in every non-paid case,
// including "unavailable", because an unverified session must never grant access.
//
// GET /api/verify-session?session_id=cs_...

import Stripe from "stripe";

// Stripe's SDK tags every error with a type. These are the ones that mean Stripe
// processed the request and is telling us something about the session itself; any
// other type (authentication, connection, rate limit, API, permission, or an
// error that is not Stripe's at all) means we never got an answer.
const STRIPE_ANSWERED_TYPES = new Set(["StripeInvalidRequestError"]);

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
    // Our misconfiguration. The buyer may well have paid through a deployment
    // that had the key; saying "no purchase" here would be a guess presented as
    // a fact.
    console.error("verify-session: STRIPE_SECRET_KEY not configured");
    res.status(503).json({
      paid: false,
      tier: null,
      status: "unavailable",
      error: "payment verification is not configured",
    });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session?.payment_status === "paid";
    const tier = session?.metadata?.tier || null;
    res.status(200).json({
      paid,
      tier: paid ? tier : null,
      status: paid ? "paid" : "unpaid",
    });
  } catch (err) {
    if (STRIPE_ANSWERED_TYPES.has(err?.type)) {
      // Stripe looked and has no such session, or rejected the id outright. That
      // is a real answer, and it is safe to tell the caller there is no purchase
      // behind this id.
      res.status(200).json({ paid: false, tier: null, status: "not-found" });
      return;
    }
    // We never reached a verdict. Say exactly that, with a status code that says
    // "try again", and let the caller show something recoverable.
    console.error("verify-session: could not reach Stripe:", err?.type || "unknown", err?.message);
    res.status(503).json({
      paid: false,
      tier: null,
      status: "unavailable",
      error: "could not reach Stripe",
    });
  }
}
