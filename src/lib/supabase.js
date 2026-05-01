// Supabase client. Env-var driven so the same code runs locally with mocks
// and in prod with a real database. If env vars aren't set, every call
// short-circuits to a no-op so the UI keeps working off localStorage.
//
// Required env vars (drop in .env.local):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//
// Schema expected:
//   leads(id uuid pk, email text, source text, quiz_answers jsonb, created_at timestamptz default now())
//   users(id uuid pk, email text unique, stripe_customer_id text, paid_at timestamptz, role text, created_at timestamptz default now())

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);

export const supabase = supabaseEnabled
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// ── Leads ───────────────────────────────────────────────────────────────────
// Insert a lead (email + quiz answers) when a homeowner submits the email
// gate on /unlock. Idempotent on (email).
export const captureLead = async ({ email, source = "unlock", quizAnswers = null }) => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase
    .from("leads")
    .upsert(
      { email: email.trim().toLowerCase(), source, quiz_answers: quizAnswers },
      { onConflict: "email" }
    )
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, lead: data };
};

// ── Quiz answers ────────────────────────────────────────────────────────────
// Persist anonymous quiz answers tied to an email (when known) for funnel
// analytics. Stored in the same `leads` row.
export const saveQuizAnswers = async ({ email, answers }) => {
  if (!supabase || !email) return { ok: false, error: "no-email-or-supabase" };
  const { error } = await supabase
    .from("leads")
    .update({ quiz_answers: answers })
    .eq("email", email.trim().toLowerCase());
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
