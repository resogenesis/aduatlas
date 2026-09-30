// Auth store. Real Supabase Auth when configured (VITE_SUPABASE_* set),
// otherwise a localStorage mock so the app runs with no backend.
//
// DESIGN — synchronous consumers, async source of truth:
//   Gates/layouts/pages read currentUser() / isPaid() SYNCHRONOUSLY during
//   render. So instead of making all of them async, real auth HYDRATES the same
//   localStorage keys the mock used (SESSION_KEY + the paid mirror). The session
//   is bootstrapped before first paint (initAuth() in main.jsx), and login/
//   signup/logout await hydration before they navigate, so the post-action
//   render always reads fresh state. paid state is sourced from `users.paid_at`
//   (server truth) — the localStorage flag stays a UX cache only.

import { supabase } from "../lib/supabase";
import { SPONSORED_ENTRY_PATH } from "../lib/govPartnership";
import { pendingGovClaimPath } from "../lib/regulatory";
import { setPaid } from "./paymentStore";
import { mergeServerProgress, takeUnsentProgress, sendUnsentProgress } from "./courseStore";
import { accountScopeOwner, clearAccountScope, enterAccountScope, onAccountScopeReset } from "./accountScope";
import { sendUnsentWorksheets, takeUnsentWorksheets } from "./worksheetStore";

const USERS_KEY = "aduatlas.mock.users";
const SESSION_KEY = "aduatlas.mock.session";

const readUsers = () => {
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeUsers = (users) => {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const writeSession = (user) => {
  if (!user) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  const { password: _, ...safe } = user;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
};

export const currentUser = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Where to send a user after auth based on their role + paid state. A builder
// (role "pro") lands in the builder portal, never in the homeowner app: the
// portal shows that builder's own profile and aggregate referral counts only.
//
// A government user is an ordinary homeowner-role account that holds a
// membership of a government entity (2m), so the role alone cannot tell them
// apart: `gov` is set by the hydration below from my_government_context(), the
// server's own answer. It is NAVIGATION, never authorization. /gov re-reads the
// membership from the server before it shows anything, and the database refuses
// everything a government user may not do whatever this flag says.
export const routeForUser = (user) => {
  if (!user) return "/";
  if (user.role === "admin") return "/admin";
  if (user.role === "pro") return "/builder";
  if (user.gov) return "/gov";
  if (user.paid) return "/dashboard";
  return "/unlock";
};

// Where a signed-in person goes from the public site's header: the portal that
// is theirs, named for what it is. An unpaid homeowner has no portal yet, so
// there is nothing to name and the header offers the plans instead.
export const portalForUser = (user) => {
  if (!user) return null;
  if (user.role === "admin") return { to: "/admin", label: "Admin console" };
  if (user.role === "pro") return { to: "/builder", label: "Builder portal" };
  if (user.gov) return { to: "/gov", label: "Government portal" };
  if (user.paid) return { to: "/dashboard", label: "Your portal" };
  return null;
};

// ── Coming back to what the person was doing ────────────────────────────────
//
// A sponsored resident who had to sign in or create an account first was sent
// to the $79 plans afterwards, with nothing pointing back to the access their
// city sponsors. Two things now bring them back, and neither is a credential:
// the token in the remembered entry still has to pass the server.
//   1. `next`, an in-app path the page that sent them to /login or
//      /create-account put in the query string.
//   2. The partner entry PartnerEntry remembers in this browser, for the round
//      trip through an email confirmation, where no query string survives.

// The browser key PartnerEntry writes. Owned here so the sign-in pages can read
// it without importing a page. The path is the router's own constant (DEF-19:
// one string, so the route and every link to it cannot disagree).
export const PARTNER_ENTRY_KEY = "aduatlas.partner.entry";
export const PARTNER_ENTRY_PATH = SPONSORED_ENTRY_PATH;

export const hasPendingPartnerEntry = () => {
  if (typeof window === "undefined") return false;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PARTNER_ENTRY_KEY) || "null");
    return Boolean(parsed?.token) && (parsed.kind === "link" || parsed.kind === "code");
  } catch {
    return false;
  }
};

// An in-app path, or "". Anything that could leave the site is dropped rather
// than repaired: a scheme, a protocol-relative "//host", a backslash some
// browsers read as a slash, and any control character, because URL parsing
// strips tabs and newlines, so "/<tab>/host" would be read as "//host". The
// value is then resolved against this site and must still be on it, and what
// comes back is that resolved path, so the path checked is the path followed.
// A path into the sign-in pages is dropped too, so signing in cannot loop.
//
// Path rules are tested against the path the ROUTER will match, not the text
// of the url: React Router decodes each segment and ignores case before it
// matches a route, so "/%70artner/x" and "/PARTNER/x" both open the partner
// entry. A path that does not decode is dropped.
const SIGN_IN_PAGES = /^\/(login|create-account|builders\/join|forgot-password|reset-password)(\/|$)/i;
const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PARTNER_PATHS = new RegExp(`^${escapeForRegExp(SPONSORED_ENTRY_PATH)}(/|$)`, "i");
const routedPathname = (pathname) => {
  try {
    return pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
};
const hasControlCharacter = (value) => {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
};
export const safeNextPath = (raw) => {
  const value = String(raw || "").trim();
  if (!value || value.length > 512) return "";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || hasControlCharacter(value)) return "";
  const origin = typeof window !== "undefined" && /^https?:/.test(window.location?.origin || "") ? window.location.origin : "http://localhost";
  let resolved;
  try {
    resolved = new URL(value, origin);
  } catch {
    return "";
  }
  if (resolved.origin !== origin) return "";
  const routed = routedPathname(resolved.pathname);
  if (routed === null || SIGN_IN_PAGES.test(routed)) return "";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};

// Does this in-app path open the sponsored entry? Answered for the route the
// path reaches, whatever its spelling or encoding.
export const isSponsoredEntryPath = (path) => {
  const safe = safeNextPath(path);
  if (!safe) return false;
  const routed = routedPathname(safe.split(/[?#]/)[0]);
  return routed !== null && PARTNER_PATHS.test(routed);
};

// Where a person goes right after signing in or signing up.
//   1. An explicit `next` wins, with one exception: staff, builders and
//      government users are never sent to a sponsored entry, whether the entry
//      came as `next` (in any spelling the router accepts) or was remembered in
//      this browser. Sponsored access is for residents. The entry page itself
//      also refuses to redeem for these accounts (PartnerEntry), so a direct
//      visit does not do it either; /api/partner-redeem has no role check.
//   2. Staff, builders and government users then go to their own portal.
//   3. A resident with a remembered entry goes back to it.
//   4. Everyone else goes to the role default (routeForUser).
// Staff, builders and government users: the people sponsored access is not for.
export const isPortalUser = (user) => Boolean(user) && (user.role === "admin" || user.role === "pro" || Boolean(user.gov));
export const landingAfterSignIn = (user, next = "") => {
  const explicit = safeNextPath(next);
  const portalUser = isPortalUser(user);
  if (explicit && !(portalUser && isSponsoredEntryPath(explicit))) return explicit;
  if (!user) return "/";
  if (portalUser) return routeForUser(user);
  if (hasPendingPartnerEntry()) return PARTNER_ENTRY_PATH;
  // A government record this browser was about to claim when it had to create
  // an account first (the email confirmation drops the query string). Back to
  // that claim, preselected. A claim is still only a request.
  const claimPath = pendingGovClaimPath();
  if (claimPath) return claimPath;
  return routeForUser(user);
};

// ── What a person is told when Supabase Auth refuses ────────────────────────
//
// The provider's own strings ("email rate limit exceeded", "Invalid login
// credentials") used to be shown verbatim. These say what happened and what to
// do, in plain words, and never claim more than the refusal tells us.
const OPS_EMAIL = "hello@aduatlas.com";
const authErrorCode = (error) => String(error?.code || error?.error_code || "").toLowerCase();
const isRateLimited = (error, code) =>
  error?.status === 429 || code.startsWith("over_") || /rate limit|too many/i.test(error?.message || "");

export const plainAuthError = (error, action) => {
  const code = authErrorCode(error);
  const message = String(error?.message || "");
  if (isRateLimited(error, code)) {
    // Whether the refused attempt left an account behind is not something the
    // refusal tells us, so the sentence does not say either way.
    return action === "signup"
      ? `We could not create your account just now because of a temporary limit on our side. Please try again in a few minutes, or write to ${OPS_EMAIL} if it keeps happening.`
      : "Too many attempts in a short time. Wait a few minutes, then try again.";
  }
  if (action === "login") {
    if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "Email or password is incorrect.";
    if (code === "email_not_confirmed" || /not confirmed/i.test(message)) {
      // Whether a confirmation email actually went out is not known here (the
      // mailer can refuse at signup), so the sentence does not assert it.
      return `This email address has not been confirmed yet. Use the confirmation link from your sign-up email, then log in. If no email arrived, write to ${OPS_EMAIL}.`;
    }
    if (code === "user_banned") return `This account cannot sign in. Write to ${OPS_EMAIL} and we will look into it.`;
    return "We could not sign you in just now. Please try again in a moment.";
  }
  // signup
  if (code === "user_already_exists" || code === "email_exists" || /already registered|already exists/i.test(message)) {
    return "An account with this email already exists. Log in instead, or reset your password if you have forgotten it.";
  }
  // validation_failed covers both fields, so the provider's words decide which
  // one the sentence names; a refusal that names neither gets the general line.
  if (code === "weak_password" || (code === "validation_failed" && /password/i.test(message))) {
    return "Choose a stronger password: at least 6 characters, and not one that is easy to guess.";
  }
  if (
    code === "email_address_invalid" ||
    (code === "validation_failed" && /email/i.test(message)) ||
    /email address .* is invalid|invalid email/i.test(message)
  ) {
    return "That email address was not accepted. Check it for typos, or use a different address.";
  }
  if (/password/i.test(message)) {
    return "Choose a stronger password: at least 6 characters, and not one that is easy to guess.";
  }
  if (code === "signup_disabled" || code === "email_provider_disabled") {
    return `New accounts cannot be created right now. Write to ${OPS_EMAIL} and we will help you.`;
  }
  return `We could not create your account just now. Please try again in a moment, or write to ${OPS_EMAIL} if it keeps happening.`;
};

// ── Supabase-backed path ─────────────────────────────────────────────────────

// Does this account hold any government membership (pending, verified, revoked
// or rejected)? my_government_context() is granted to authenticated and always
// answers with a list, empty for everyone else. Used for navigation only (see
// routeForUser). true or false when the server answered; null when it did not,
// because a failed read says nothing about the account.
const readGovernmentMembership = async () => {
  try {
    const { data, error } = await supabase.rpc("my_government_context");
    if (error || !Array.isArray(data?.memberships)) return null;
    return data.memberships.length > 0;
  } catch {
    return null;
  }
};

// ── Session hygiene across log outs and tabs (T4-01, and the RC4a review) ────
// scopeGen moves on every account-scope reset; a hydration that started before
// one never writes after it. renderedUid is the account this tab last showed.
// loggingOut marks this tab's own log out, so the events it causes here are
// not mistaken for another tab's.
let scopeGen = 0;
onAccountScopeReset(() => {
  scopeGen += 1;
});
let renderedUid = null;
let loggingOut = false;
// This tab's own sign-in (login or signup): hydrateFromSession handles an
// account change itself (enterAccountScope), so it is not another tab's.
let signingIn = false;

// "Log out and continue as a resident" keeps the sponsored entry. Other tabs
// hear the same SIGNED_OUT a moment later and must keep it too, so the keep
// list is shared through storage for a short while rather than held in this
// tab alone. Browser-level: never an account's data.
const LOGOUT_KEEP_KEY = "aduatlas.logout.keep";
const LOGOUT_KEEP_MS = 30000;
const writeLogoutKeep = (keys) => {
  try {
    window.localStorage.setItem(LOGOUT_KEEP_KEY, JSON.stringify({ keys, at: Date.now() }));
  } catch {
    // storage blocked: this tab still keeps them itself
  }
};
const readLogoutKeep = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(LOGOUT_KEEP_KEY) || "null");
    return v && Array.isArray(v.keys) && Date.now() - Number(v.at) < LOGOUT_KEEP_MS ? v.keys : [];
  } catch {
    return [];
  }
};
const forgetLogoutKeep = () => {
  try {
    window.localStorage.removeItem(LOGOUT_KEEP_KEY);
  } catch {
    // nothing to forget
  }
};

// Supabase keeps the session under its own storage key. A sign-out whose
// request fails (offline, a 5xx) returns an error and LEAVES that session in
// place, and the next reload, tab focus or refresh signs the previous account
// back in for whoever is at the keyboard. So a failed sign-out removes it here.
const removeStoredSession = () => {
  try {
    const key = supabase?.auth?.storageKey;
    if (!key) return;
    for (const k of [key, `${key}-code-verifier`, `${key}-user`]) window.localStorage.removeItem(k);
  } catch {
    // storage blocked: nothing was stored either
  }
};

// Another tab changed the account: this tab's rendered state (a form holding the
// previous person's brief, a dashboard, a lesson) belongs to someone else now.
// Nothing short of a reload drops every component's copy, so reload to the home
// page. The account's browser data is already gone by then.
const leaveForeignView = () => {
  renderedUid = null;
  try {
    window.location.replace("/");
  } catch {
    // no window (tests): nothing is rendered either
  }
};

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ error: new Error("timeout") }), ms))]);

// Pull the user's row from `users` and mirror role/paid into localStorage so the
// synchronous consumers see the server truth. Returns the session-shaped user.
const hydrateFromSession = async (session) => {
  if (!session?.user) {
    writeSession(null);
    setPaid(false);
    return null;
  }
  const authUser = session.user;
  // Before anything is read or merged: a copy this browser holds for another
  // account is removed, so it can neither be shown to this one nor merged into
  // its row (T4-01). This account's own copy, and work done signed out, stay.
  enterAccountScope(authUser.id);
  forgetLogoutKeep();
  // Any reset from here on (a log out, SIGNED_OUT from another tab, another
  // account's sign-in) makes this hydration stale: its reads may land after the
  // reset, and must not write this account's mirror or copy back (RC4a review).
  const gen = scopeGen;

  const readRow = async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("role, paid_at, paid_tier, refunded_at, completed_chapters, builder_packet")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();
      return data;
    } catch {
      // network/RLS hiccup — fall back to metadata; don't block login.
      return null;
    }
  };
  // Read beside the users row, not after it, so sign-in waits for one round
  // trip rather than two. Unknown stays unknown: when the read fails, this
  // browser keeps what the server last said about this same account, so one
  // failed read during a token refresh does not make the header and the next
  // landing forget /gov. Only an answer changes it. With nothing heard before,
  // the person is not treated as a government user, which changes only where
  // they land.
  const [row, govAnswer] = await Promise.all([readRow(), readGovernmentMembership()]);
  if (gen !== scopeGen) return currentUser();
  const previous = currentUser();
  const gov =
    govAnswer === null ? Boolean(previous && previous.id === authUser.id && previous.gov) : govAnswer;

  const paid = Boolean(row?.paid_at) && !row?.refunded_at;
  const user = {
    id: authUser.id,
    email: authUser.email,
    username: authUser.user_metadata?.username || authUser.email?.split("@")[0],
    role: row?.role || authUser.user_metadata?.role || "homeowner",
    paid,
    gov,
  };
  writeSession(user);
  renderedUid = user.id;
  // Server truth overwrites the mirror outright, tier included. A row that is
  // paid but records no paid_tier clears the tier rather than leaving an older
  // one standing, so an unknown tier reads as unknown and the tier gates fail
  // closed until the webhook writes the real one.
  setPaid(paid, row?.paid_tier || undefined);
  // Merge any server-side course progress / packet into local state (union +
  // blank-fill, never destructive) so the progress-based gates reflect what
  // this account has done, cross-device.
  mergeServerProgress({
    completedChapters: row?.completed_chapters,
    builderPacket: row?.builder_packet,
  });
  return user;
};

// Re-read entitlement from the server for the current session (e.g. after the
// Stripe success redirect). Safe no-op when Supabase is disabled.
//
// Whatever the server says wins, including "not paid": this clears the local
// mirror when there is no session or no purchase on the row. Callers that hold
// a grant the server has not caught up with yet (a just-verified Stripe
// checkout whose webhook has not landed) must therefore only call this once the
// buyer actually has a session to re-read. See hasServerSession().
export const refreshEntitlement = async () => {
  if (!supabase) return currentUser();
  const { data } = await supabase.auth.getSession();
  return hydrateFromSession(data.session);
};

// Is there a real Supabase session in this browser? /welcome uses this to tell
// the two post-checkout cases apart: a signed-in buyer, whose entitlement can
// be re-read from the server, and the normal case of a buyer who paid before
// creating an account, who has nothing to re-read yet. Returns false when
// Supabase is disabled.
export const hasServerSession = async () => {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session?.user);
  } catch {
    return false;
  }
};

// The current Supabase access token, or "" when signed out or disabled. The
// serverless endpoints verify the caller from this the way api/_admin.js does,
// so anything that asks the server to act as this user has to send it.
export const accessToken = async () => {
  if (!supabase) return "";
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  } catch {
    return "";
  }
};

// Bootstrap auth before first paint + keep the mirror in sync on changes.
//
// A session that ENDED (SIGNED_OUT: log out here or in another tab, a refresh
// token the server revoked) takes the account's browser copy with it (T4-01).
// A session that could not be read (offline, a network error during refresh)
// is not an ending, so it leaves the copy alone: the same person reloading on
// a train keeps their unsent work.
//
// ONE-TIME SWEEP (RC4a review). Builds before RC4a left the previous person's
// data behind at log out with no owner recorded, which would read here as work
// done signed out and be carried into the next account. On the first clean boot
// of this build with no session, that ownerless data is removed once, and
// SCOPE_MARKER records that it was. Signed-out work done after that carries into
// the first account as designed. A boot whose session read failed does not
// sweep, and tries again next time.
const SCOPE_MARKER = "aduatlas.scope.v1";
const hasScopeMarker = () => {
  try {
    return window.localStorage.getItem(SCOPE_MARKER) === "1";
  } catch {
    return true; // storage blocked: nothing can be stored to sweep
  }
};
const setScopeMarker = () => {
  try {
    window.localStorage.setItem(SCOPE_MARKER, "1");
  } catch {
    // storage blocked
  }
};

let keepOnSignOut = [];
export const initAuth = async () => {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      if (!data?.session && accountScopeOwner()) clearAccountScope();
      if (!hasScopeMarker()) {
        if (!data?.session && !accountScopeOwner()) clearAccountScope();
        setScopeMarker();
      }
    }
    await hydrateFromSession(data.session);
  } catch {
    // ignore — app still renders logged-out
  }
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id || null;
    if (event === "SIGNED_OUT") {
      const shown = renderedUid;
      clearAccountScope({ keep: [...new Set([...keepOnSignOut, ...readLogoutKeep()])] });
      hydrateFromSession(null);
      // Not this tab's own log out, and this tab was showing an account.
      if (!loggingOut && shown) leaveForeignView();
      return;
    }
    // This tab's own log out: nothing it causes here (a refresh before the
    // sign-out call) may write the leaving account back.
    if (loggingOut) return;
    // Another tab signed a DIFFERENT account in while this one shows the first.
    if (uid && renderedUid && uid !== renderedUid && !signingIn) {
      clearAccountScope();
      hydrateFromSession(null);
      leaveForeignView();
      return;
    }
    hydrateFromSession(session);
  });
  // Belt and braces for a session removed from storage by another tab without an
  // auth event reaching this one (a failed sign-out cleaned up locally).
  window.addEventListener("storage", (e) => {
    const key = supabase?.auth?.storageKey;
    if (!key || e.key !== key || e.newValue !== null || !renderedUid || loggingOut) return;
    clearAccountScope({ keep: readLogoutKeep() });
    writeSession(null);
    setPaid(false);
    leaveForeignView();
  });
};

// ── Public API (async; callers await before navigating) ──────────────────────

export const login = async ({ email, password }) => {
  const e = (email || "").trim().toLowerCase();
  const pw = password || "";

  if (supabase) {
    signingIn = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: pw });
      if (error) return { ok: false, error: plainAuthError(error, "login") };
      const user = await hydrateFromSession(data.session);
      return { ok: true, user };
    } finally {
      signingIn = false;
    }
  }

  // Mock fallback (no backend configured).
  const user = readUsers().find((u) => u.email === e && u.password === pw);
  if (!user) return { ok: false, error: "Email or password is incorrect." };
  writeSession(user);
  // A mock record carries no tier, so the paid flag alone unlocks only what
  // every package includes. Nothing here may imply a tier the record lacks.
  if (user.paid) setPaid(true, user.paid_tier || undefined);
  return { ok: true, user };
};

export const signup = async ({ email, password, username, role = "homeowner" }) => {
  const e = (email || "").trim().toLowerCase();
  const pw = password || "";
  const safeRole = role === "pro" ? "pro" : "homeowner";
  const name = (username || "").trim() || e.split("@")[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Enter a valid email." };
  // Six, as the form's hint says and as Supabase Auth requires by default: a
  // shorter password used to pass here and come back as the provider's refusal.
  if (pw.length < 6) return { ok: false, error: "Use at least 6 characters for your password." };

  if (supabase) {
    signingIn = true;
    try {
    const { data, error } = await supabase.auth.signUp({
      email: e,
      password: pw,
      // role + username land in auth metadata; the on_auth_user_created trigger
      // copies role into public.users (clamped to homeowner|pro server-side).
      options: { data: { username: name, role: safeRole } },
    });
    if (error) return { ok: false, error: plainAuthError(error, "signup") };
    if (data.session) {
      const user = await hydrateFromSession(data.session);
      return { ok: true, user };
    }
    // Email confirmation is enabled — no session yet.
    return {
      ok: true,
      needsConfirmation: true,
      user: { id: data.user?.id, email: e, username: name, role: safeRole, paid: false },
    };
    } finally {
      signingIn = false;
    }
  }

  // Mock fallback.
  const users = readUsers();
  if (users.some((u) => u.email === e)) {
    return { ok: false, error: "An account with this email already exists." };
  }
  const user = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    email: e,
    password: pw,
    username: name,
    role: safeRole,
    paid: false,
  };
  users.push(user);
  writeUsers(users);
  writeSession(user);
  return { ok: true, user };
};

// Log out. Everything this browser holds for the account is removed
// synchronously, with the session mirror, so a caller that navigates without
// awaiting renders logged-out and empty at once (T4-01). A chapter mark still
// waiting on its 400 ms debounce is sent first, under the session that made it.
//
// `keepPartnerEntry`: the partner page's "log out and continue as a resident".
// The sponsored entry it remembers was opened by the person at the keyboard and
// is what they are continuing with, so that one key survives this log out.
export const logout = async ({ keepPartnerEntry = false } = {}) => {
  const keep = keepPartnerEntry ? [PARTNER_ENTRY_KEY] : [];
  // Taken before the copy is removed: chapter marks not yet written (or whose
  // write failed) and worksheet edits not yet sent. Sent below under the session
  // that made them, then the session ends.
  const unsentProgress = takeUnsentProgress();
  const unsentSheets = takeUnsentWorksheets();
  loggingOut = true;
  renderedUid = null;
  if (keep.length) writeLogoutKeep(keep);
  writeSession(null);
  setPaid(false);
  clearAccountScope({ keep });
  if (!supabase) {
    loggingOut = false;
    return;
  }
  keepOnSignOut = keep;
  try {
    // Bounded, so a hanging request never keeps the session alive.
    await withTimeout(Promise.allSettled([sendUnsentProgress(unsentProgress), sendUnsentWorksheets(unsentSheets)]), 2500);
    let res;
    try {
      res = await withTimeout(supabase.auth.signOut(), 5000);
    } catch (err) {
      res = { error: err };
    }
    // The sign-out request failed or never answered: remove the session here, so
    // no reload, tab focus or refresh can sign this account back in.
    if (res?.error) removeStoredSession();
  } finally {
    // Anything that slipped in while signing out is removed again.
    clearAccountScope({ keep });
    writeSession(null);
    setPaid(false);
    keepOnSignOut = [];
    loggingOut = false;
  }
};

