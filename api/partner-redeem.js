// Resident entry for a government education partnership (Phase 1 spec, decision
// 2p). Function 9 of the 12 the Vercel plan allows.
//
// WHAT THIS ENDPOINT IS FOR: turning a partner LINK or a partner CODE into the
// sponsored Golden educational entitlement, on the server, for the person whose
// session proves who they are. The browser never decides what is granted and never
// says who it is granted to.
//
// IT IS THE SINGLE DOOR, BY DESIGN OF THE DATABASE. All three functions it calls
// are service_role only in migration 0014 — redeem_partner_access(),
// partner_access_link_context() and record_partner_link_visit() — so the anon and
// authenticated keys cannot reach any of them through PostgREST. That is why
// establishing WHO is asking is this file's job.
//
// THE THREE THINGS THE CLIENT DOES NOT CONTROL:
//   1. WHO. p_app_user_id comes from the Authorization bearer token, verified with
//      auth.getUser() and looked up in public.users. A body field naming a user is
//      ignored, because a body is not identity.
//   2. WHAT. The entitlement is a constant inside the RPC (the Golden plan id).
//      There is no tier, plan, price, role or duration parameter in this file to
//      tamper with, and none is read from the request if one is sent. The RPC
//      re-reads the account after the write and aborts unless exactly that tier
//      moved.
//   3. WHETHER. Validity is the database's decision: partnership active, identity
//      verified, token live, not expired, not exhausted, not already redeemed.
//      This file cannot approve anything the RPC refused, and it does not try to
//      explain a refusal the RPC deliberately left unexplained.
//
// NOT AN ORACLE. Every refusal from the RPC returns one identical shape and one
// identical sentence — unknown, malformed, deactivated, expired, exhausted,
// suspended partner and unverified identity are indistinguishable from outside —
// and this endpoint passes that through without adding a reason of its own. The
// GET context call answers only for a link that is redeemable RIGHT NOW and
// returns null for everything else, for the same reason.
//
// NOTHING IS A FALLBACK. An invalid, expired, disabled, already-spent or
// hand-edited link or code grants NOTHING: not a trial, not a discount, not a
// partial course. The three "the token was fine, the account was not" answers
// (already sponsored, already paid, needs review) come back in the RPC's own
// words, because telling a resident who already has access that their link is
// broken would be a lie this endpoint is in a position to avoid.
//
// ABUSE CONTROLS. The database counts failed attempts per account and per client
// fingerprint over rolling windows and writes a digest of what was presented,
// never the value. This endpoint adds the fingerprint (a digest of the client
// address, never the address), mirrors the RPC's own token shapes so malformed
// guesses are refused before they reach the database, and keeps a small in-process
// attempt window as defence in depth. A token is a credential and is never logged.
//
// GET  /api/partner-redeem?token=<link token>&sid=<browser id>
//        Public. What a resident entry page may show for a LINK: the partner, the
//        jurisdiction and the sponsored plan. Records one visit a day per (link,
//        browser) when a well-formed sid is supplied. Codes are never resolved
//        here: a code is a secret, and this would be an oracle for one.
// POST /api/partner-redeem   { kind: "link" | "code", token: string }
//        Authorization: Bearer <supabase access token>
//
// Required env (server side, never VITE_-prefixed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createHash } from "node:crypto";
import { readBody, service } from "./_admin.js";

// Used only when the database did not supply its own sentence.
const NOTHING =
  "This access link or code is not available. Ask the city or agency that gave it to you for a current one. Nothing has been added to your account.";

// The same shapes migration 0014 enforces. Mirrored here so a malformed guess is
// refused before it reaches the database, never to add a rule of its own:
//   link  <jurisdiction slug>-<state>-<6 symbols>, lower case, 8 to 100 characters
//   code  8 symbols of a 32 symbol alphabet with no 0/O/1/I
const LINK_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Keys the response may carry out of the RPC's jsonb. Everything else is dropped,
// so an internal id, a column dump or a homeowner's details cannot leak through
// this endpoint because a future migration added something to the payload.
const PASS_THROUGH = [
  "plan",
  "kind",
  "outcome",
  "already",
  "entity_name",
  "entity_type",
  "jurisdiction_name",
  "jurisdiction_slug",
  "state_code",
];

// Context keys. entity_website_url is included so the page can point a resident at
// their own government's site; no id or internal state is passed on.
const CONTEXT_KEYS = [
  "kind",
  "plan",
  "entity_name",
  "entity_type",
  "entity_website_url",
  "jurisdiction_name",
  "jurisdiction_slug",
  "jurisdiction_type",
  "state_code",
];

// ── in-process attempt window: defence in depth, never the boundary ─────────
// The real counting is in partner_redemption_attempts, which survives an instance
// and is what a security review reads. This window only blunts a burst against one
// instance, and it is checked BEFORE shape validation so a flood of malformed
// requests is throttled too.
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { post: 12, get: 60 };
const attempts = new Map();

const overLimit = (key, limit) => {
  if (!key) return false;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 5000) {
    for (const [k, list] of attempts) {
      if (!list.some((at) => now - at < WINDOW_MS)) attempts.delete(k);
    }
  }
  return recent.length > limit;
};

const clientAddress = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded.length) return String(forwarded[0]).trim();
  return req.socket?.remoteAddress || "";
};

// What the database stores as client_fingerprint: an opaque per-client value. A
// digest, so the raw address is not written to a table somebody reads casually.
const fingerprint = (address) =>
  address ? createHash("sha256").update(`partner-entry:${address}`).digest("hex").slice(0, 32) : null;

const bearer = (req) => {
  const authz = req.headers.authorization || req.headers.Authorization || "";
  return typeof authz === "string" && authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
};

const pick = (payload, keys) => {
  const out = {};
  if (!payload || typeof payload !== "object") return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== null) out[key] = payload[key];
  }
  return out;
};

// A link token as the database spells it, or "". Lower case, because that is what
// 0014 stores and compares.
const normalizeLink = (value) => {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  return LINK_RE.test(token) && token.length >= 8 && token.length <= 100 ? token : "";
};

// A code as the database spells it, or "". Spaces and dashes a person typed off a
// flyer are removed and the letters are upper-cased: the stored alphabet contains
// neither, so this cannot change which code was meant. Nothing else is altered.
const normalizeCode = (value) => {
  const code = typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";
  return CODE_RE.test(code) ? code : "";
};

const readQuery = (req) => {
  if (req.query && typeof req.query === "object") return req.query;
  try {
    return Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  } catch {
    return {};
  }
};

const first = (value) => (Array.isArray(value) ? value[0] : value);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ granted: false, message: "Method not allowed" });
    return;
  }

  const svc = service();
  if (!svc) {
    console.error("partner-redeem: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    res.status(500).json({
      granted: false,
      message: "We could not check this just now. Nothing has been added to your account. Please try again shortly.",
    });
    return;
  }

  const address = clientAddress(req);

  // ── GET: what the entry page may say before anything is redeemed ─────────
  if (req.method === "GET") {
    if (overLimit(`g:${address}`, LIMITS.get)) {
      res.status(429).json({ context: null });
      return;
    }
    const query = readQuery(req);
    const token = normalizeLink(first(query.token));
    if (!token) {
      // Same answer as an unknown token: the caller learns nothing either way.
      res.status(200).json({ context: null });
      return;
    }
    let context = null;
    try {
      const { data, error } = await svc.rpc("partner_access_link_context", { p_token: token });
      if (error) console.error("partner_access_link_context failed:", error.message);
      else context = data || null;
    } catch (err) {
      console.error("partner-redeem GET threw:", err?.message || err);
    }
    // One visit a day per (link, browser), counted by the database and only for a
    // live link on an active partnership. No user id and no address is stored.
    const sid = typeof first(query.sid) === "string" ? first(query.sid).trim() : "";
    if (context && SID_RE.test(sid)) {
      try {
        await svc.rpc("record_partner_link_visit", { p_token: token, p_session_id: sid });
      } catch (err) {
        console.error("record_partner_link_visit threw:", err?.message || err);
      }
    }
    res.status(200).json({ context: context ? pick(context, CONTEXT_KEYS) : null });
    return;
  }

  // ── POST: the redemption ──────────────────────────────────────────────────
  if (overLimit(`p:${address}`, LIMITS.post)) {
    res.status(429).json({
      granted: false,
      message: "That is too many attempts in a row. Wait a few minutes and try again, or ask your city for the link.",
    });
    return;
  }

  const token = bearer(req);
  if (!token) {
    res.status(401).json({
      granted: false,
      reason: "sign-in-required",
      message: "Create your ADUAtlas account or sign in first, then open this link again to claim the sponsored access.",
    });
    return;
  }

  const { data: authData, error: authError } = await svc.auth.getUser(token);
  if (authError || !authData?.user) {
    res.status(401).json({
      granted: false,
      reason: "sign-in-required",
      message: "Your session has ended. Sign in again and open this link once more.",
    });
    return;
  }

  const { data: userRow } = await svc
    .from("users")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (!userRow?.id) {
    res.status(401).json({
      granted: false,
      reason: "sign-in-required",
      message: "We could not find your ADUAtlas account. Sign in again and open this link once more.",
    });
    return;
  }

  if (overLimit(`u:${userRow.id}`, LIMITS.post)) {
    res.status(429).json({
      granted: false,
      message: "That is too many attempts in a row. Wait a few minutes and try again, or ask your city for the link.",
    });
    return;
  }

  const body = readBody(req);
  const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
  const claimToken = kind === "link" ? normalizeLink(body.token) : kind === "code" ? normalizeCode(body.token) : "";
  if (!claimToken) {
    res.status(200).json({ granted: false, message: NOTHING });
    return;
  }

  let payload = null;
  try {
    const { data, error } = await svc.rpc("redeem_partner_access", {
      p_kind: kind,
      p_token: claimToken,
      p_app_user_id: userRow.id,
      p_client_fingerprint: fingerprint(address),
    });
    if (error) {
      // The token is never logged: it is a credential.
      console.error("redeem_partner_access refused a", kind, "redemption:", error.message);
      res.status(200).json({ granted: false, message: NOTHING });
      return;
    }
    payload = data;
  } catch (err) {
    console.error("partner-redeem threw:", err?.message || err);
    res.status(200).json({ granted: false, message: NOTHING });
    return;
  }

  const message = typeof payload?.message === "string" && payload.message ? payload.message : NOTHING;

  // The rate-limit refusal is the ONE refusal the database flags, with a boolean
  // that says nothing about the token.
  if (payload?.throttled) {
    res.status(429).json({ granted: false, message });
    return;
  }

  // ok:false is the single refusal shape. Nothing is added to it here: the reason
  // is deliberately not knowable from outside.
  if (payload?.ok !== true) {
    res.status(200).json({ granted: false, message });
    return;
  }

  // ok:true covers the grant AND the three "the token was fine, the account was
  // not" answers, which carry their own sentence from the database.
  res.status(200).json({
    granted: payload.granted === true,
    message,
    ...pick(payload, PASS_THROUGH),
  });
}
