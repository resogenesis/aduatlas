// Builder referral attribution (Phase 1 decision 11). A builder shares
// https://aduatlas.com/?ref=<code>. This browser remembers the code for 30
// days so the email gate (captureLead) and the checkout (startCheckout) can
// carry it, and the server records which builder referred the homeowner.
//
// First touch wins: a code that is already stored and not expired is never
// replaced by a later one. Attribution only. Nothing here knows about
// commissions or payouts, and nothing visible changes for the homeowner.
//
// Visit logging (migration 0006): the first time this browser opens a link
// with a given code, it tells /api/referral-click once, fire and forget, with
// the code and a random browser id kept in localStorage. The server records a
// link_visited event (one a day per builder and browser) and answers 204
// whatever happens. The browser id carries no account, email or name; it only
// stops the same browser from counting twice in a day.
//
// Visits and attribution are tracked separately. Attribution is first touch:
// the stored code is never replaced. Visits are per code: the codes this
// browser has already reported live in "aduatlas.ref.seen", so a visit through
// builder B's link while builder A's code is held still counts once for B,
// and a second visit through the same link does not count again.
//
// Tracking activates on claim (migration 0007). The browser cannot tell a
// claimed builder's code from an unclaimed one and does not try: it stores
// and beacons any well-formed code, and the server decides. log_referral_visit,
// capture_lead and the Stripe webhook resolve a code only to a builder that
// is approved, active and claimed by a builder account; for anyone else the
// code is a dead link and nothing is recorded or attributed. Unclaimed
// listings are never handed a link, so a dead code in the wild is not
// expected; if one arrives anyway it costs nothing and blocks nothing.
//
// Storage is best-effort: private windows and blocked storage just mean no
// attribution, never an error the visitor can see.

export const REF_KEY = "aduatlas.ref";
export const SID_KEY = "aduatlas.sid";
export const SEEN_KEY = "aduatlas.ref.seen";
export const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Codes already beaconed from this browser; the newest are kept when the
// list grows past this.
const SEEN_MAX = 50;

// 8 chars from A-HJ-NP-Z2-9 (no 0/O/1/I). Mirrors the check constraint in
// supabase/migrations/0005_builder_referrals.sql; case-insensitive on input.
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/i;
// Same shape log_referral_visit() validates (0006).
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const read = () => {
  try {
    const raw = window.localStorage.getItem(REF_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.code !== "string" || typeof v.at !== "number") return null;
    return v;
  } catch {
    return null;
  }
};

const isFresh = (v) => Boolean(v) && Date.now() - v.at < REF_TTL_MS;

export const clearReferral = () => {
  try {
    window.localStorage.removeItem(REF_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
};

// The stored code if it is still inside the 30-day window, else null (an
// expired entry is removed on the way out).
export const getReferralCode = () => {
  const v = read();
  if (!v) return null;
  if (!isFresh(v)) {
    clearReferral();
    return null;
  }
  return v.code;
};

const randomId = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fall through to the weak generator
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

// A random id for this browser, created on first use and kept in
// localStorage. Not tied to any account. When storage is unavailable a fresh
// id is used for this page load only.
export const getSessionId = () => {
  try {
    const v = window.localStorage.getItem(SID_KEY);
    if (v && SID_RE.test(v)) return v;
  } catch {
    // storage unavailable
  }
  const sid = randomId();
  try {
    window.localStorage.setItem(SID_KEY, sid);
  } catch {
    // storage unavailable: the id lives only for this page load
  }
  return sid;
};

// Tell the server a referral link was opened. Fire and forget; a missing
// API (static hosting, dev without functions) or a database that has not
// applied 0006 yet costs nothing but the count.
const beaconVisit = (code) => {
  try {
    if (typeof fetch !== "function") return;
    const sid = getSessionId();
    if (!SID_RE.test(sid)) return;
    fetch("/api/referral-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, sid }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never let the beacon surface
  }
};

// The codes this browser has already reported as visits.
const readSeen = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(v) ? v.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
};

// Beacon a visit for `code` unless this browser has already reported it.
// Independent of which code is stored for attribution. When storage is
// unavailable the seen list is always empty and the server's one-a-day rule
// is the only de-duplication, exactly as before.
const beaconVisitOnce = (code) => {
  const seen = readSeen();
  if (seen.includes(code)) return;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, code].slice(-SEEN_MAX)));
  } catch {
    // storage unavailable: the beacon still fires; the server de-duplicates per day
  }
  beaconVisit(code);
};

// Reads ?ref= (or ?r=) from a location.search string. A well-formed code is
// reported as a visit the first time this browser sees it, and stored for
// attribution only when nothing valid is stored yet (first touch wins).
// Returns the code now in effect for attribution. Route changes with the same
// code never count again: the code is already in the seen list.
export const captureReferralFromSearch = (search) => {
  let raw = null;
  try {
    const params = new URLSearchParams(search || "");
    raw = params.get("ref") || params.get("r");
  } catch {
    return getReferralCode();
  }
  const candidate = (raw || "").trim();
  if (!candidate || !CODE_RE.test(candidate)) return getReferralCode();

  const code = candidate.toUpperCase();
  beaconVisitOnce(code);

  const existing = getReferralCode();
  if (existing) return existing;

  try {
    window.localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // storage unavailable: the code lives only for this page load
  }
  return code;
};
