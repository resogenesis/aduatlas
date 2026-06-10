// Stripe Checkout integration. The frontend posts to /api/create-checkout
// (a Vercel-style serverless function) which creates a Stripe Checkout
// Session and returns the URL. Frontend then redirects.
//
// Required env vars on the frontend:
//   VITE_CHECKOUT_ENDPOINT    (defaults to /api/create-checkout)
//   VITE_VERIFY_ENDPOINT      (optional; /api/verify-session — used by /welcome
//                              to confirm a real Stripe session was paid)
//
// Backend (not in this repo yet) needs:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET     (for the Supabase webhook that sets users.paid_at)
//   PRICE_IDS for each tier (roadmap, report, concierge)
//
// When unset, falls back to a mock redirect so the UI flow can be tested.

const endpoint = import.meta.env.VITE_CHECKOUT_ENDPOINT || "/api/create-checkout";
export const checkoutEnabled = Boolean(import.meta.env.VITE_CHECKOUT_ENDPOINT);

export const startCheckout = async ({ tier, email, quizAnswers = null }) => {
  if (!checkoutEnabled) {
    // Mock fallback: return a known path the caller can redirect to. We pass
    // the selected tier and an explicit `mock=1` marker so /welcome only grants
    // (mock) access when it was actually reached from this checkout — a bare
    // /welcome load must NOT grant access.
    const t = encodeURIComponent(tier || "");
    return { ok: true, url: `/welcome?tier=${t}&mock=1`, mock: true };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, email, quizAnswers }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (!json.url) return { ok: false, error: "no checkout url returned" };
    return { ok: true, url: json.url };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};
