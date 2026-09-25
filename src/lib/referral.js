// Builder referral attribution (Phase 1 decision 11). A builder shares
// https://aduatlas.com/?ref=<code>. This browser remembers the code for 30
// days so the email gate (captureLead) and the checkout (startCheckout) can
// carry it, and the server records which builder referred the homeowner.
//
// First touch wins: a code that is already stored and not expired is never
// replaced by a later one. Attribution only. Nothing here knows about
// commissions or payouts, and nothing visible changes for the homeowner.
//
// Storage is best-effort: private windows and blocked storage just mean no
// attribution, never an error the visitor can see.

export const REF_KEY = "aduatlas.ref";
export const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// 8 chars from A-HJ-NP-Z2-9 (no 0/O/1/I). Mirrors the check constraint in
// supabase/migrations/0005_builder_referrals.sql; case-insensitive on input.
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/i;

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

// Reads ?ref= (or ?r=) from a location.search string and stores it when it is
// well-formed and nothing valid is stored yet. Returns the code now in effect.
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

  const existing = getReferralCode();
  if (existing) return existing;

  const code = candidate.toUpperCase();
  try {
    window.localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // storage unavailable: the code lives only for this page load
  }
  return code;
};
