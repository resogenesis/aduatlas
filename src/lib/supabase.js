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
// through the security-definer RPC
// `capture_lead(p_email, p_source, p_quiz_answers, p_referral_code)` rather
// than a direct .from("leads").upsert(). p_referral_code arrived with
// migration 0005 (builder referral attribution).
//
// THE PACKET IS TWO STORES, NOT ONE COLUMN (migration 0013, decision 2n).
// `users.builder_packet` holds the PROJECT BRIEF — the twelve questions every
// builder asks, plus turnkey — and the signed-in owner may read and write it on
// their own row whatever they bought. The worksheets, the ADU Ready Score (a key
// INSIDE the worksheets map) and the lot geometry are Platinum and Concierge
// only, so they live in `public.homeowner_worksheets` behind RLS gated on the
// tier the Stripe webhook wrote. Before 0013 they sat in builder_packet, which
// every signed-in account is granted UPDATE on, and PaidGate was the whole
// boundary.
//
// What that means for this file: saveBuilderPacket() writes the BRIEF ONLY. It
// strips worksheets and the lot before the write rather than relying on the
// database trigger, and it never writes them anywhere else: src/stores/
// worksheetStore.js is the only writer of worksheets and the lot (through
// saveEntitledPacket), because only the store's three-way merge knows whether
// its copy is newer than the server's (R3-02, I4-01).

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);

export const supabase = supabaseEnabled
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// ── Leads ───────────────────────────────────────────────────────────────────
// Insert/merge a lead (email + quiz answers, plus the builder referral code
// when this browser holds one) when a homeowner submits the email gate on
// /unlock. Idempotent on (email) — handled server-side by capture_lead.
export const captureLead = async ({ email, source = "unlock", quizAnswers = null, referralCode = null }) => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const base = {
    p_email: email.trim().toLowerCase(),
    p_source: source,
    p_quiz_answers: quizAnswers,
  };
  // First attempt carries the referral code when this browser holds one.
  let { data, error } = await supabase.rpc("capture_lead", referralCode ? { ...base, p_referral_code: referralCode } : base);
  // If the frontend is deployed before migration 0005 lands, PostgREST has no
  // four-argument capture_lead and reports no matching function. Rather than
  // hard-block every referred visitor at the email gate, retry once with the
  // older three-argument signature. The lead still lands; only the referral
  // attribution is lost for that submit.
  if (error && referralCode) {
    ({ data, error } = await supabase.rpc("capture_lead", base));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, leadId: data };
};


// ── The packet, split (owned app data) ───────────────────────────────────────
// Two stores, one caller-facing shape. See the header.
//
//   users.builder_packet          the project brief, any tier, own row only
//   public.homeowner_worksheets   worksheets + Ready Score + lot, Platinum and
//                                 Concierge only, enforced by RLS
//
// Everything here is best-effort: callers keep the localStorage copy as the
// source of truth for synchronous rendering and mirror to the server for
// durability and cross-device continuity. No-op when Supabase is disabled or
// logged out, and a refusal from the entitled half is never fatal — an account
// without the entitlement is SUPPOSED to be refused there.

// The two keys that moved. Named once so nothing has to remember the list.
export const ENTITLED_PACKET_KEYS = ["worksheets", "lot"];

// The project brief half: the packet minus the two moved keys. The database
// strips them too (0013), but sending them would be a client asking for
// something it is not allowed to have, so they never leave the browser.
export const briefOnly = (packet) => {
  if (!packet || typeof packet !== "object") return {};
  const brief = {};
  for (const [k, v] of Object.entries(packet)) {
    if (!ENTITLED_PACKET_KEYS.includes(k)) brief[k] = v;
  }
  return brief;
};

const sessionUser = async () => {
  if (!supabase) return null;
  const { data: sess } = await supabase.auth.getSession();
  return sess?.session?.user || null;
};

// Read the entitled half. Returns worksheets = {} and lot = null for an account
// that holds no worksheet entitlement, because RLS filters the row rather than
// refusing the request — "nothing there" and "not yours" look the same to the
// client on purpose, and the tier gate in the interface is what explains it.
export const fetchEntitledPacket = async () => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const authUser = await sessionUser();
  if (!authUser) return { ok: false, error: "logged-out" };
  const { data, error } = await supabase
    .from("homeowner_worksheets")
    .select("worksheets, lot")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    authUserId: authUser.id,
    worksheets: data?.worksheets || {},
    lot: data?.lot || null,
  };
};

// Write the entitled half through the RPC, which resolves the caller's own row
// server-side. SECURITY INVOKER on the database side: the policies decide, so a
// Golden or free account is refused here and that refusal is the boundary
// working, not a bug to route around.
export const saveEntitledPacket = async ({ worksheets = null, lot = null } = {}) => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  if (!worksheets && !lot) return { ok: true, skipped: true };
  const authUser = await sessionUser();
  if (!authUser) return { ok: false, error: "logged-out" };
  const { error } = await supabase.rpc("save_homeowner_worksheets", {
    p_worksheets: worksheets,
    p_lot: lot,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

// Read both halves and hand back one packet-shaped object, so a caller that had
// the whole thing in one column before 0013 still gets the whole thing.
export const fetchBuilderPacket = async () => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const authUser = await sessionUser();
  if (!authUser) return { ok: false, error: "logged-out" };
  const { data, error } = await supabase
    .from("users")
    .select("builder_packet")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const brief = briefOnly(data?.builder_packet || null);
  const entitled = await fetchEntitledPacket();
  const packet = { ...brief };
  if (entitled.ok) {
    if (Object.keys(entitled.worksheets).length) packet.worksheets = entitled.worksheets;
    if (entitled.lot) packet.lot = entitled.lot;
  }
  if (!Object.keys(packet).length) return { ok: true, packet: null };
  return { ok: true, packet };
};

// Mirror the brief to users.builder_packet. Whatever else the packet carries is
// dropped here on purpose: a whole packet handed in by mistake can never write
// an older copy of the worksheets or the lot over newer server data.
export const saveBuilderPacket = async (packet) => {
  if (!supabase) return { ok: false, error: "supabase-disabled" };
  const authUser = await sessionUser();
  if (!authUser) return { ok: false, error: "logged-out" };

  const { error } = await supabase
    .from("users")
    .update({ builder_packet: briefOnly(packet) })
    .eq("auth_user_id", authUser.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
