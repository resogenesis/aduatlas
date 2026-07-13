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
//
// Demo accounts (always work, any env — remove the UI before prod if undesired):
//   Homeowner (paid):  demo@aduatlas.com / demo1234
//   Builder:           builder@aduatlas.com / demo1234

import { supabase } from "../lib/supabase";
import { setPaid } from "./paymentStore";
import { mergeServerProgress } from "./courseStore";

const USERS_KEY = "aduatlas.mock.users";
const SESSION_KEY = "aduatlas.mock.session";

const DEMO_HOMEOWNER = {
  id: "demo-homeowner",
  email: "demo@aduatlas.com",
  password: "demo1234",
  username: "Demo Homeowner",
  role: "homeowner",
  paid: true,
};

const DEMO_BUILDER = {
  id: "demo-builder",
  email: "builder@aduatlas.com",
  password: "demo1234",
  username: "Demo Builder",
  role: "pro",
  paid: false,
};

const DEMOS = [DEMO_HOMEOWNER, DEMO_BUILDER];

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

// Where to send a user after auth based on their role + paid state.
export const routeForUser = (user) => {
  if (!user) return "/";
  if (user.role === "admin") return "/admin";
  if (user.role === "pro") return "/builder";
  if (user.paid) return "/dashboard";
  return "/quiz";
};

// ── Supabase-backed path ─────────────────────────────────────────────────────

// Pull the user's row from `users` and mirror role/paid into localStorage so the
// synchronous consumers see the server truth. Returns the session-shaped user.
const hydrateFromSession = async (session) => {
  if (!session?.user) {
    writeSession(null);
    setPaid(false);
    return null;
  }
  const authUser = session.user;

  let row = null;
  try {
    const { data } = await supabase
      .from("users")
      .select("role, paid_at, paid_tier, refunded_at, completed_chapters, builder_packet")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    row = data;
  } catch {
    // network/RLS hiccup — fall back to metadata; don't block login.
  }

  const paid = Boolean(row?.paid_at) && !row?.refunded_at;
  const user = {
    id: authUser.id,
    email: authUser.email,
    username: authUser.user_metadata?.username || authUser.email?.split("@")[0],
    role: row?.role || authUser.user_metadata?.role || "homeowner",
    paid,
  };
  writeSession(user);
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
export const refreshEntitlement = async () => {
  if (!supabase) return currentUser();
  const { data } = await supabase.auth.getSession();
  return hydrateFromSession(data.session);
};

// Bootstrap auth before first paint + keep the mirror in sync on changes.
export const initAuth = async () => {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    await hydrateFromSession(data.session);
  } catch {
    // ignore — app still renders logged-out
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    hydrateFromSession(session);
  });
};

// ── Public API (async; callers await before navigating) ──────────────────────

export const login = async ({ email, password }) => {
  const e = (email || "").trim().toLowerCase();
  const pw = password || "";

  // Demo accounts short-circuit (work in any env for testing).
  const demo = DEMOS.find((d) => d.email === e && d.password === pw);
  if (demo) {
    writeSession(demo);
    if (demo.paid) setPaid(true);
    return { ok: true, user: demo };
  }

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: pw });
    if (error) return { ok: false, error: error.message || "Email or password is incorrect." };
    const user = await hydrateFromSession(data.session);
    return { ok: true, user };
  }

  // Mock fallback (no backend configured).
  const user = readUsers().find((u) => u.email === e && u.password === pw);
  if (!user) return { ok: false, error: "Email or password is incorrect." };
  writeSession(user);
  if (user.paid) setPaid(true);
  return { ok: true, user };
};

export const signup = async ({ email, password, username, role = "homeowner" }) => {
  const e = (email || "").trim().toLowerCase();
  const pw = password || "";
  const safeRole = role === "pro" ? "pro" : "homeowner";
  const name = (username || "").trim() || e.split("@")[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Enter a valid email." };
  if (pw.length < 4) return { ok: false, error: "Password is too short." };

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: e,
      password: pw,
      // role + username land in auth metadata; the on_auth_user_created trigger
      // copies role into public.users (clamped to homeowner|pro server-side).
      options: { data: { username: name, role: safeRole } },
    });
    if (error) return { ok: false, error: error.message };
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

export const logout = async () => {
  // Clear the local mirror synchronously so callers that navigate without
  // awaiting still render logged-out immediately.
  writeSession(null);
  setPaid(false);
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // already cleared locally
    }
  }
};

export const DEMO_ACCOUNTS = [
  { label: "Homeowner (paid)", email: "demo@aduatlas.com", password: "demo1234" },
  { label: "Builder", email: "builder@aduatlas.com", password: "demo1234" },
];
