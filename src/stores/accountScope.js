// Which account this browser's saved work belongs to (T4-01, found at the RC4
// rehearsal).
//
// THE DEFECT. Everything a homeowner types is kept in localStorage first (the
// brief, budget and address in the packet, the worksheets, the lot and the
// Ready Score beside it, chapter completions and quiz scores) and mirrored to
// their row. Log out only cleared the session and the paid flag. The next
// account to sign in on the same browser was shown all of it in My Property and
// /study, and sign-in hydration merged it into that account's copy (union for
// chapters, blank-fill for the packet), so one ordinary Save wrote the previous
// person's address and brief to the new account.
//
// THE RULE NOW.
//   1. Logging out, or the session ending (SIGNED_OUT), removes every key that
//      holds one person's data, and resets the in-memory copies registered
//      below. Nothing of theirs is left for the next person to see or save.
//   2. The browser records WHICH account its copy belongs to (OWNER_KEY). A
//      sign-in by a different account removes that copy before anything is
//      read or merged, so the new account starts from its own server copy.
//   3. Work done while signed out, with no owner recorded (the quiz before an
//      account exists), still carries into the first account that signs in.
//      That is the funnel working as designed, and it cannot hold another
//      account's data because rule 1 empties the browser at every log out.
//
// Browser-level keys stay: the anonymous referral id and the referral code the
// visitor arrived with (attribution belongs to the browser, not to a person),
// and the developer mock flags, which authStore manages itself.

const OWNER_KEY = "aduatlas.owner";

// Every key that holds one person's data. A new per-person key must be added
// here, and check 860 fails the build of a candidate that stores one without it.
export const ACCOUNT_SCOPED_KEYS = [
  "aduatlas.packet",
  "aduatlas.course.completed",
  "aduatlas.course.quizzes",
  "aduatlas.worksheets.sync",
  "aduatlas.claim_code",
  "aduatlas.partner.entry",
  // The government record a signed-out visitor chose to claim, kept across an
  // email-confirmation sign-up (src/lib/regulatory.js). Written while nobody is
  // signed in, so it carries into the first account, and never past a log out.
  "aduatlas.gov.claim_target",
];

const resetHooks = new Set();

// A store with an in-memory copy of account data registers how to drop it.
export const onAccountScopeReset = (fn) => {
  resetHooks.add(fn);
  return () => resetHooks.delete(fn);
};

const storage = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const accountScopeOwner = () => {
  const s = storage();
  try {
    return s?.getItem(OWNER_KEY) || null;
  } catch {
    return null;
  }
};

// Remove this browser's copy of the signed-in (or last signed-in) person's
// data. `keep` names keys that must survive this particular reset (the partner
// page's "log out and continue as a resident", whose remembered entry belongs
// to the person at the keyboard, not to the account being left).
export const clearAccountScope = ({ keep = [] } = {}) => {
  const s = storage();
  if (s) {
    for (const key of [...ACCOUNT_SCOPED_KEYS, OWNER_KEY]) {
      if (keep.includes(key)) continue;
      try {
        s.removeItem(key);
      } catch {
        // Storage blocked: nothing was stored there either.
      }
    }
  }
  for (const fn of resetHooks) {
    try {
      fn();
    } catch {
      // one broken store must not stop the others
    }
  }
};

// Called by every sign-in hydration, before anything is read or merged.
// Returns true when another account's copy was removed.
export const enterAccountScope = (uid) => {
  if (!uid) return false;
  const owner = accountScopeOwner();
  const foreign = Boolean(owner) && owner !== uid;
  if (foreign) clearAccountScope();
  const s = storage();
  try {
    s?.setItem(OWNER_KEY, uid);
  } catch {
    // Storage blocked: nothing can be kept for anyone, so nothing can leak.
  }
  return foreign;
};
