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
// Required for upgrade credits (without them every buyer pays full price):
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//
// Body shape (POST JSON):
//   { tier: "roadmap" | "report" | "concierge", email?: string, quizAnswers?: object,
//     referralCode?: string }
//   Authorization: Bearer <supabase access token>   (signed-in buyers only)
//
// referralCode is the builder referral code the browser holds
// (src/lib/referral.js). It is format-checked and copied into the session
// metadata so the webhook can attribute the buyer; it never affects price,
// access or anything else.
//
// SECURITY: price ids are resolved server-side from env. We never trust a
// client-supplied amount. Plan ids/prices come from src/lib/plans.js so the
// pricing page and the checkout can never disagree.
//
// SECURITY, the upgrade credit: the credit used to be computed from
// req.body.email with no proof the caller owned that address, and then minted as
// a real Stripe coupon, so anyone who knew a paid customer's email could buy the
// next tier up at that customer's expense. A credit now requires the caller to
// prove the address is theirs with their Supabase access token, verified the way
// api/_admin.js verifies a Bearer token, and the credit is looked up against the
// address the token names rather than anything in the body. An anonymous buyer,
// or one whose token does not verify, pays full price: dropping the credit is
// the safe direction, and they can still upgrade after signing in.
//
// Upgrade credit amounts: what the buyer already paid comes off the next plan
// up (Golden -> Platinum pays $200; Platinum -> Concierge pays $221). Any
// missing config or lookup failure falls back to full price without throwing.
//
// SECURITY, THE SPONSORED CREDIT (locked decision 2r, migration 0019): this used
// to read users.paid_tier straight off the row, and 0014's
// redeem_partner_access() grants a SPONSORED Golden by writing paid_tier and
// paid_at exactly as a purchase does. A city sponsoring a resident's $79
// education therefore bought that resident a real $79 Stripe coupon off a $279
// Platinum — money nobody paid. 2r separates the entitlement LEVEL held from the
// ORIGIN of the money, so the credit is now computed from
// public.homeowner_upgrade_basis.qualifying_paid_plan: the plan QUALIFYING MONEY
// bought, which is null for a sponsorship and for a refund. It is deliberately
// NOT a mark on the person — the same sponsored homeowner who later pays $279
// for Platinum carries $279 toward Concierge, because the basis follows the
// money rather than the account.
//
// NOTHING TO BUY (RC3): a signed-in caller whose account already holds the
// requested tier, or a higher one, is refused with 409 and a plain sentence the
// pricing page shows as it stands. Buying it could only take their money: the
// webhook never lowers a live tier (api/stripe-webhook.js), so a lower purchase
// would change nothing. This reads the tier HELD, the entitlement LEVEL of 2r,
// and not the origin: a sponsored Golden already has Golden and is refused it,
// and may still buy Platinum (at full price, because no money bought Golden).
// It runs right after the tier is validated and before any Stripe or price
// configuration is consulted, so it never costs a Stripe call and it answers the
// same whether or not a deployment has Stripe configured. It is for the caller
// the access token proves and nobody else: an anonymous body email is NEVER
// looked up for this, because answering 409 to a stranger would tell them the
// address holds a paid account. The webhook rule covers anonymous buyers. A
// lookup that fails is unknown, not "holds nothing": checkout goes ahead and the
// webhook still keeps the higher tier.
//
// Response: 409 { error: "already_has_plan", message, heldTier, requestedTier }
//
// THE QUOTE (RC4a, T4-03 promoted to launch-blocking). A sponsored Golden resident
// was told "your $79 applies as a credit, the upgrade is $200" by copy hard coded
// in PaidGate while this function charged them $279. The price a page shows now
// comes from HERE: POST { tier, quoteOnly: true } runs exactly the path a real
// checkout runs (the same token check, the same "nothing to buy" refusal, the
// same credit from the same database answer, computeQuote below) and stops before
// Stripe, answering
//   200 { ok: true, tier, listCents, creditCents, dueCents, creditFrom }
// with the amount the charge would carry, or the same 409 as above. It needs no
// Stripe configuration, creates nothing and records nothing. The charge and the
// quote cannot disagree because they are one computation.

import Stripe from "stripe";
import { readBody, service } from "./_admin.js";
import { PLANS, planById, planRank, upgradeCreditCents } from "../src/lib/plans.js";

const TIER_TO_PRICE = {
  roadmap: process.env.STRIPE_PRICE_ROADMAP,
  report: process.env.STRIPE_PRICE_REPORT,
  concierge: process.env.STRIPE_PRICE_CONCIERGE,
};

// Same shape as the check constraint on builders.referral_code (0005).
const REFERRAL_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const normalizeReferral = (v) => {
  const code = typeof v === "string" ? v.trim().toUpperCase() : "";
  return REFERRAL_RE.test(code) ? code : "";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (v) => {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  return e.length <= 254 && EMAIL_RE.test(e) ? e : "";
};

// The caller's own email address, proved by their Supabase access token and
// verified the way api/_admin.js verifies one. Returns "" for an anonymous
// caller, a bad token, or missing Supabase config, and never throws.
const verifiedCallerEmail = async (req) => {
  const svc = service();
  if (!svc) return "";
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return "";
  try {
    const { data, error } = await svc.auth.getUser(token);
    if (error) return "";
    return normalizeEmail(data?.user?.email);
  } catch {
    return "";
  }
};

// The plan QUALIFYING MONEY bought for this address (2r). Only ever called with
// an address the caller proved is theirs. Returns null on any miss or error so
// checkout proceeds at full price.
//
// The whole rule lives in the database, in public.qualifying_paid_plan(), and
// this reads its answer through the service-role-only
// public.homeowner_upgrade_basis view. It is deliberately NOT reassembled here
// from paid_tier, paid_at, refunded_at and paid_origin: the sponsored case was
// got wrong once by a caller that read the columns and drew its own conclusion,
// and src/pages/Unlock.jsx and src/pages/app/Dashboard.jsx have to reach the
// same answer to quote the same price. One rule, three readers.
//
// A missing view — a bundle deployed ahead of migration 0019, lane C of decision
// 2j — lands in the error branch and the buyer pays full price. Dropping a credit
// is the safe direction, the same direction this file already takes for a caller
// whose token does not verify.
const ownedPlanFor = async (email) => {
  const svc = service();
  if (!email || !svc) return null;
  try {
    const { data, error } = await svc
      .from("homeowner_upgrade_basis")
      .select("qualifying_paid_plan")
      .eq("email", email)
      .maybeSingle();
    if (error || !data) return null;
    return planById(data.qualifying_paid_plan)?.id || null;
  } catch {
    return null;
  }
};

// The tier this address HOLDS right now (the LEVEL, 2r): paid_tier on a row with
// paid_at set and no refund, the rule public.has_worksheet_entitlement() (0013)
// and the webhook's never-lower guard both apply. Only ever called with an
// address the caller proved is theirs. Returns null when nothing live is held,
// and also when the lookup fails, which the caller treats as unknown.
const liveTierFor = async (email) => {
  const svc = service();
  if (!email || !svc) return null;
  try {
    const { data, error } = await svc
      .from("users")
      .select("paid_tier, paid_at, refunded_at")
      .eq("email", email)
      .maybeSingle();
    if (error) {
      console.error("create-checkout: live tier lookup failed, checkout not refused:", error.message);
      return null;
    }
    if (!data?.paid_at || data.refunded_at) return null;
    return planById(data.paid_tier)?.id || null;
  } catch (err) {
    console.error("create-checkout: live tier lookup threw, checkout not refused:", err?.message);
    return null;
  }
};

// Homeowner copy: plain sentences, no dashes or arrows.
const alreadyHasPlanMessage = (held, wanted) =>
  held.id === wanted.id
    ? `Your account already has ${held.name}, so there is nothing to pay for. Everything it includes is waiting in your portal.`
    : `Your account already has ${held.name}, which includes everything in ${wanted.name}, so there is nothing to pay for. Everything it includes is waiting in your portal.`;

// One computation for the quote and the charge. `callerEmail` is the address the
// access token proved, or "" for an anonymous buyer (who earns no credit).
const computeQuote = async (callerEmail, plan) => {
  const owned = callerEmail ? await ownedPlanFor(callerEmail) : null;
  const creditCents = owned ? Math.max(0, upgradeCreditCents(owned, plan.id)) : 0;
  return {
    tier: plan.id,
    listCents: plan.priceCents,
    creditCents,
    dueCents: Math.max(0, plan.priceCents - creditCents),
    creditFrom: creditCents > 0 ? owned : null,
  };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = readBody(req);
  const { tier, quizAnswers, referralCode } = body;
  const referral = normalizeReferral(referralCode);
  const plan = planById(tier);
  if (!plan) {
    res.status(400).json({ error: `unknown or unconfigured tier: ${tier}` });
    return;
  }

  // A verified address can earn a credit. An unverified one only prefills the
  // email field on Stripe's own form, which costs nothing and grants nothing.
  const callerEmail = await verifiedCallerEmail(req);

  // Nothing to buy: see the header. Before any Stripe call or price lookup.
  const held = callerEmail ? planById(await liveTierFor(callerEmail)) : null;
  if (held && planRank(held.id) >= plan.rank) {
    res.status(409).json({
      error: "already_has_plan",
      message: alreadyHasPlanMessage(held, plan),
      heldTier: held.id,
      requestedTier: plan.id,
    });
    return;
  }

  // One quote per request, for the answer and for the charge alike.
  const quote = await computeQuote(callerEmail, plan);
  if (body.quoteOnly === true) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true, ...quote });
    return;
  }

  // THE SHOWN PRICE IS THE CHARGED PRICE (RC4a review). The page sends the amount
  // it showed; when that is no longer this caller's price (the account changed in
  // another tab, a credit appeared or went away), nothing is charged and the page
  // is told the current figure instead. Checked before any Stripe call.
  if (Number.isInteger(body.expectedDueCents) && body.expectedDueCents !== quote.dueCents) {
    res.status(409).json({
      error: "price_changed",
      message: "The price for your account is different from the one this page showed, so nothing was charged. The button now shows the current price.",
      dueCents: quote.dueCents,
    });
    return;
  }

  const priceId = TIER_TO_PRICE[plan.id];
  if (!priceId) {
    res.status(400).json({ error: `unknown or unconfigured tier: ${tier}` });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  const prefillEmail = callerEmail || normalizeEmail(body.email);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`;

  try {
    let discounts;
    const { creditCents } = quote;
    if (creditCents > 0) {
      const owned = quote.creditFrom;
      const ownedName = planById(owned)?.name || "previous plan";
      const coupon = await stripe.coupons.create({
        amount_off: creditCents,
        currency: "usd",
        duration: "once",
        max_redemptions: 1,
        name: `${ownedName} credit toward ${plan.name}`,
        metadata: { email: callerEmail, from_tier: owned, to_tier: plan.id },
      });
      discounts = [{ coupon: coupon.id }];
    }

    // Append &tier so /welcome can read the purchased plan alongside the
    // server-verified session_id, and &email so the post-payment page can carry
    // the buyer's address into account creation, which is step 4 of the locked
    // flow. Neither grants anything: /welcome grants only on a session_id that
    // api/verify-session.js confirms was paid, and the email only prefills the
    // account form.
    const successParams = [
      "session_id={CHECKOUT_SESSION_ID}",
      `tier=${encodeURIComponent(plan.id)}`,
      ...(prefillEmail ? [`email=${encodeURIComponent(prefillEmail)}`] : []),
    ].join("&");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: prefillEmail || undefined,
      success_url: `${baseUrl}/welcome?${successParams}`,
      cancel_url: `${baseUrl}/unlock?tier=${encodeURIComponent(plan.id)}`,
      ...(discounts ? { discounts } : {}),
      metadata: {
        tier: plan.id,
        upgraded_from: quote.creditFrom || "",
        credit_cents: String(creditCents),
        quiz_answers: quizAnswers ? JSON.stringify(quizAnswers).slice(0, 400) : "",
        referral_code: referral,
      },
    });

    res.status(200).json({ url: session.url, plans: PLANS.map((p) => p.id) });
  } catch (err) {
    res.status(500).json({ error: err.message || "stripe error" });
  }
}
