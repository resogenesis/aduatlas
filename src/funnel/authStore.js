// Mock auth store. Lets users sign up and log in locally without a backend.
//
// Demo accounts (always work):
//   Homeowner (paid):  demo@aduatlas.com / demo1234     → /course/c1
//   Builder:           builder@aduatlas.com / demo1234  → /builder
//
// INTEGRATION POINT (Supabase Auth): replace these functions with calls to
// supabase.auth.signInWithPassword / signUp / getSession. The shape of
// `currentUser()` is intentionally close to a Supabase user object so the
// swap is mostly mechanical.

import { setPaid } from "./paymentStore";

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
  const { password, ...safe } = user;
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

export const login = ({ email, password }) => {
  const e = (email || "").trim().toLowerCase();
  const pw = password || "";

  const demo = DEMOS.find((d) => d.email === e && d.password === pw);
  if (demo) {
    writeSession(demo);
    if (demo.paid) setPaid(true);
    return { ok: true, user: demo };
  }

  const user = readUsers().find((u) => u.email === e && u.password === pw);
  if (!user) return { ok: false, error: "Email or password is incorrect." };

  writeSession(user);
  if (user.paid) setPaid(true);
  return { ok: true, user };
};

// Where to send a user after auth based on their role + paid state.
export const routeForUser = (user) => {
  if (!user) return "/";
  if (user.role === "pro") return "/builder";
  if (user.paid) return "/course/c1";
  return "/quiz";
};

export const signup = ({ email, password, username, role = "homeowner" }) => {
  const e = (email || "").trim().toLowerCase();
  const pw = password || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "Enter a valid email." };
  if (pw.length < 4) return { ok: false, error: "Password is too short." };

  const users = readUsers();
  if (users.some((u) => u.email === e)) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const user = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    email: e,
    password: pw,
    username: (username || "").trim() || e.split("@")[0],
    role,
    paid: false,
  };
  users.push(user);
  writeUsers(users);
  writeSession(user);
  return { ok: true, user };
};

export const logout = () => {
  writeSession(null);
  // Note: we intentionally do NOT clear paid flag here — that's a separate
  // gate tied to the (mock) Stripe payment. Real auth will need to recheck
  // users.paid_at on each session restore.
};

export const DEMO_ACCOUNTS = [
  { label: "Homeowner (paid)", email: "demo@aduatlas.com", password: "demo1234" },
  { label: "Builder", email: "builder@aduatlas.com", password: "demo1234" },
];
