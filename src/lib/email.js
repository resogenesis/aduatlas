// Resend transactional email wrapper. Frontend posts to /api/send-email,
// which calls Resend with the server-side RESEND_API_KEY.
//
// Required frontend env (optional override):
//   VITE_EMAIL_ENDPOINT  (defaults to /api/send-email)
//
// Backend env (consumed by the serverless function):
//   RESEND_API_KEY
//   RESEND_FROM          (e.g. hello@aduatlas.com)

const endpoint = import.meta.env.VITE_EMAIL_ENDPOINT || "/api/send-email";

export const TEMPLATES = {
  COMPLETE_PLAN: "complete-plan",
  WELCOME: "welcome",
  REFUND_REQUESTED: "refund-requested",
  MAGIC_LINK: "magic-link",
};

// Fire and forget. Returns {ok, error?} but the UI shouldn't block on it.
export const sendEmail = async ({ template, to, data = {} }) => {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, to, data }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    // Network errors are fine to swallow — emails are nice-to-have, not
    // blocking the conversion path.
    return { ok: false, error: err.message };
  }
};
