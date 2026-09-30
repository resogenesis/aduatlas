// Resend transactional email wrapper. The frontend posts to /api/send-email,
// which calls Resend with the server-side RESEND_API_KEY.
//
// THE CALLER'S IDENTITY TRAVELS WITH THE REQUEST. This wrapper used to send only
// a Content-Type header, so no bearer token ever reached api/send-email.js. Every
// template whose proof is the caller's own Supabase access token therefore 401'd
// on arrival, silently, while the UI that called it told the customer their
// message had been received. The access token is attached now whenever this
// browser holds a session; a signed-out caller simply sends no token, which is
// correct for the one template that does not need one.
//
// Which templates need a token:
//   COMPLETE_PLAN       no. Sent from the /unlock email gate before any account
//                       exists. The server fences it on the leads row instead.
//   WELCOME             no. Sent server-side by api/stripe-webhook.js on the
//                       completed checkout; it is not fired from the browser.
//   REFUND_REQUESTED    yes. Goes to the signed-in caller's own address.
//   REFUND_REQUEST_OPS  yes. Goes to the FIXED operations address on the server;
//                       `to` is ignored, so this cannot be aimed anywhere else.
//   MAGIC_LINK          yes. Goes to the signed-in caller's own address.
//
// `to` is honoured for COMPLETE_PLAN only. Every other template sends to an
// address the server established for itself, so passing `to` does nothing.
//
// Required frontend env (optional override):
//   VITE_EMAIL_ENDPOINT  (defaults to /api/send-email)
//
// Backend env (consumed by the serverless function):
//   RESEND_API_KEY
//   RESEND_FROM          (e.g. hello@aduatlas.com)
//   OPS_EMAIL            (where REFUND_REQUEST_OPS lands)

import { accessToken } from "../stores/authStore";

const endpoint = import.meta.env.VITE_EMAIL_ENDPOINT || "/api/send-email";

export const TEMPLATES = {
  COMPLETE_PLAN: "complete-plan",
  WELCOME: "welcome",
  REFUND_REQUESTED: "refund-requested",
  REFUND_REQUEST_OPS: "refund-request-ops",
  MAGIC_LINK: "magic-link",
};

// Returns { ok, error? }. Most callers do not block on it, but the ones that make
// a promise to the customer ("it is on our support queue") must read the result
// rather than assume it: an email that silently 401s is how a product ends up
// telling someone their refund request was received when nothing was sent.
export const sendEmail = async ({ template, to, data = {} }) => {
  try {
    // Best effort: a failure to read the session must not stop a template that
    // needs no token from being sent.
    let token = "";
    try {
      token = await accessToken();
    } catch {
      token = "";
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ template, to, data }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
