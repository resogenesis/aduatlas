// Supabase client. Env-var driven so the same code runs locally with mocks
// and in prod with a real database. If env vars aren't set, every call
// short-circuits to a no-op so the UI keeps working off localStorage.
//
// Required env vars (drop in .env.local):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//
// Schema: see supabase/migrations/0001_init.sql (version-controlled).
// `leads` is PII-protected — no direct anon table access — so lead writes go
// through the security-definer RPC `capture_lead(p_email, p_source, p_quiz_answers)`
// rather than a direct .from("leads").upsert().

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);

export const supabase = supabaseEnabled
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// ── Leads ───────────────────────────────────────────────────────────────────
// Insert/merge a lead (email + quiz answers) when a homeowner submits the email
// gate on /unlock. Idempotent on (email) — handled server-side by capture_lead.
export const captureLead = async ({ email, source = "unlock", quizAnswers = null }) => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase.rpc("capture_lead", {
    p_email: email.trim().toLowerCase(),
    p_source: source,
    p_quiz_answers: quizAnswers,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, leadId: data };
};

// ── Quiz answers ────────────────────────────────────────────────────────────
// Persist anonymous quiz answers tied to an email (when known) for funnel
// analytics. Merged into the same `leads` row via capture_lead (which COALESCEs
// quiz_answers, so this never wipes an existing capture).
export const saveQuizAnswers = async ({ email, answers }) => {
  if (!supabase || !email) return { ok: false, error: "no-email-or-supabase" };
  const { error } = await supabase.rpc("capture_lead", {
    p_email: email.trim().toLowerCase(),
    p_source: "quiz",
    p_quiz_answers: answers,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

// ── Builder packet (owned app data) ──────────────────────────────────────────
// `users.builder_packet` is a jsonb column the signed-in user may read/write on
// their own row (RLS: owned app-data, unlike the service-role-only billing cols).
// These are best-effort — callers keep the localStorage copy as the source of
// truth for synchronous rendering and just mirror to the server for durability
// and cross-device continuity. No-op when Supabase is disabled or logged out.
export const fetchBuilderPacket = async () => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const { data: sess } = await supabase.auth.getSession();
  const authUser = sess?.session?.user;
  if (!authUser) return { ok: false, error: "logged-out" };
  const { data, error } = await supabase
    .from("users")
    .select("builder_packet")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, packet: data?.builder_packet || null };
};

export const saveBuilderPacket = async (packet) => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const { data: sess } = await supabase.auth.getSession();
  const authUser = sess?.session?.user;
  if (!authUser) return { ok: false, error: "logged-out" };
  const { error } = await supabase
    .from("users")
    .update({ builder_packet: packet })
    .eq("auth_user_id", authUser.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
