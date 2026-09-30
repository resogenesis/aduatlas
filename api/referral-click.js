// Vercel-style serverless function: records that a builder's referral link
// was opened (migration 0006, referral_events kind link_visited).
//
// The browser calls this once when it first stores a ?ref=<code> from a
// referral link (src/lib/referral.js), with the code and its random browser
// id. We validate both shapes and call log_referral_visit() with the service
// client, which resolves the code to a builder whose TRACKING IS ACTIVE
// (approved, active and claimed by a builder account: migration 0007,
// builder_tracking_active) and records one visit a day per (builder,
// browser). A listing ADUAtlas seeded and nobody has claimed yet has a code
// in the database but no link anywhere, and its code resolves to nothing
// here. The RPC is executable by the service role only (0006), so this
// endpoint is the single way in; the anon key cannot call it through
// PostgREST and read the boolean back.
//
// The response is 204 with no body for every POST, whatever happened: a
// malformed code, an unknown or unclaimed code, a database that has not
// applied 0006 yet and a database error all look the same from outside, so
// this endpoint cannot be used to check whether a code exists or whether a
// listing is claimed. Attribution only; nothing here knows about commissions
// or payouts. No code change was needed for 0007: the rule lives in the RPC.
//
// POST /api/referral-click   { code: string, sid: string }
//
// Required env (server-side, never VITE_-prefixed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { readBody, service } from "./_admin.js";

// Same shapes as the check constraint on builders.referral_code (0005) and
// the session id rule in log_referral_visit() (0006).
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const normalizeCode = (v) => {
  const code = typeof v === "string" ? v.trim().toUpperCase() : "";
  return CODE_RE.test(code) ? code : "";
};
const normalizeSid = (v) => {
  const sid = typeof v === "string" ? v.trim() : "";
  return SID_RE.test(sid) ? sid : "";
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = readBody(req);
    const code = normalizeCode(body.code);
    const sid = normalizeSid(body.sid);
    const supabase = code && sid ? service() : null;
    if (supabase) {
      // The boolean the RPC returns is deliberately not read: the caller gets
      // the same 204 either way.
      const { error } = await supabase.rpc("log_referral_visit", { p_code: code, p_session_id: sid });
      if (error) console.error("log_referral_visit error:", error.message);
    }
  } catch (err) {
    console.error("referral-click threw:", err?.message || err);
  }

  res.status(204).end();
}
