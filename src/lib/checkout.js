// Stripe Checkout integration. The frontend posts to /api/create-checkout
// (a Vercel-style serverless function) which creates a Stripe Checkout
// Session and returns the URL. Frontend then redirects.
//
// Frontend env vars:
//   VITE_CHECKOUT_ENDPOINT    optional override. The default below is a real
//                             route in this repo, so checkout does not depend on
//                             this being set.
//   VITE_VERIFY_ENDPOINT      (optional; /api/verify-session — used by /welcome
//                              to confirm a real Stripe session was paid)
//
// Backend (api/create-checkout.js, api/stripe-webhook.js) needs:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET     (for the webhook that sets users.paid_at)
//   STRIPE_PRICE_ROADMAP / STRIPE_PRICE_REPORT / STRIPE_PRICE_CONCIERGE
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

const DEFAULT_ENDPOINT = "/api/create-checkout";
const configuredEndpoint = import.meta.env.VITE_CHECKOUT_ENDPOINT || "";
const endpoint = configuredEndpoint || DEFAULT_ENDPOINT;

// B08: this flag used to be Boolean(import.meta.env.VITE_CHECKOUT_ENDPOINT),
// which Vite inlines at BUILD time. A production build made without that
// variable therefore shipped a permanently disabled buy button even though
// /api/create-checkout was deployed and working, and the page told buyers
// "checkout is opening soon" instead of taking their money. The flag now
// reflects the endpoint that will actually be called, which always exists. A
// misconfigured server is loud instead: the POST below fails and startCheckout
// returns { ok: false, error }, which /unlock surfaces to the buyer.
export const checkoutEnabled = Boolean(endpoint);

// B21: the mock checkout URL self-grants access on /welcome, so it must not
// exist in a production bundle. import.meta.env.DEV is replaced with the
// literal false in a production build, so this constant is false and the branch
// below, along with the URL it builds, is dropped by dead-code elimination.
// Locally, with no VITE_CHECKOUT_ENDPOINT configured (which is how a dev server
// with no serverless functions behind it looks), the mock still lets the
// post-purchase screens be walked without Stripe.
const devMockCheckout = import.meta.env.DEV && !configuredEndpoint;

// The server's "nothing to buy" refusal: a signed-in buyer whose account already
// holds the requested plan or a higher one (api/create-checkout.js answers 409).
export const ALREADY_HAS_PLAN = "already_has_plan";
// The shown price is no longer this caller's price; nothing was charged (409).
export const PRICE_CHANGED = "price_changed";

// referralCode: the builder referral code this browser holds (src/lib/referral.js),
// forwarded so the server can put it in the Stripe session metadata.
// accessToken: the buyer's Supabase access token when they are signed in. The
// server needs it to prove the upgrade credit belongs to the caller, and to tell
// a buyer who already holds the plan that there is nothing to pay for; an
// anonymous buyer simply pays full price.
//
// On failure the result carries { ok: false, status, code, message, error }.
// `code` and `message` come from the server's JSON body when it sent one;
// `message` is homeowner copy the page may show as it stands (the 409 above), and
// `error` is the raw text for logs only. A caller shows `message` for a code it
// recognises and its own generic sentence for everything else.
export const startCheckout = async ({
  tier,
  email,
  quizAnswers = null,
  referralCode = null,
  accessToken = "",
  expectedDueCents = null,
}) => {
  if (devMockCheckout) {
    // Dev-only fallback: a known path the caller can redirect to, carrying the
    // selected tier, the email and an explicit mock=1 marker. /welcome honours
    // that marker in a dev build only.
    const t = encodeURIComponent(tier || "");
    const e = email ? `&email=${encodeURIComponent(email)}` : "";
    return { ok: true, url: `/welcome?tier=${t}${e}&mock=1`, mock: true };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ tier, email, quizAnswers, referralCode, ...(Number.isInteger(expectedDueCents) ? { expectedDueCents } : {}) }),
    });
    if (!res.ok) {
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return {
        ok: false,
        status: res.status,
        code: typeof body?.error === "string" ? body.error : "",
        message: typeof body?.message === "string" ? body.message : "",
        error: text || `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    if (!json.url) return { ok: false, error: "no checkout url returned" };
    return { ok: true, url: json.url };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};

// ── The quote: what checkout will charge THIS caller (RC4a, T4-03) ───────────
// Every price a page shows for a purchase or an upgrade comes from here, and
// here comes from api/create-checkout.js's own computation (quoteOnly), so the
// figure shown and the figure charged are one number. PaidGate used to print
// "your $79 applies as a credit, the upgrade is $200" from its own copy while
// checkout charged a sponsored resident $279.
//
// Resolves to { ok: true, tier, listCents, creditCents, dueCents, creditFrom },
// { ok: false, code: "already_has_plan", message } for a plan the account holds,
// or { ok: false } when there is no answer. No answer means NO FIGURE: a caller
// prints a price only from an ok quote (2b, unknown means unknown).
export const fetchCheckoutQuote = async ({ tier, accessToken = "" }) => {
  if (devMockCheckout) return { ok: false, error: "no checkout endpoint" };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ tier, quoteOnly: true }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok && Number.isFinite(body.dueCents)) return body;
    return {
      ok: false,
      status: res.status,
      code: typeof body?.error === "string" ? body.error : "",
      message: typeof body?.message === "string" ? body.message : "",
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};
