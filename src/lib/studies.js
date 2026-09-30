// Homeowner side of the feasibility-study workflow. Talks to Supabase with the
// signed-in user's session; RLS + column grants (0003_studies.sql, 0018) limit
// the client to its own row and to the intake side of it. Deliverables uploaded
// by an admin are read back through short-lived signed URLs.
//
// SAVING AND SUBMITTING ARE TWO DIFFERENT ACTIONS (decision 2q, migration 0018).
// Any homeowner, free and Golden included, may SAVE intake as a draft; only a
// live Platinum or Concierge entitlement may SUBMIT it and turn it into an
// order. The entitlement is not decided here: the database refuses the
// transition, and this module's job is to send the honest write and report the
// refusal as the upgrade it is rather than as a generic error.
import { supabase, supabaseEnabled } from "./supabase";

const BUCKET = "studies";

// ── The fulfilment lifecycle, customer side ─────────────────────────────────
// Decision 2i names six operator states and 2q adds the customer's own draft
// ahead of them. The stored tokens and the operator labels are mapped in one
// place, migrations 0011 and 0018, and the operator labels live in the admin
// console. THESE are the customer's words for the same states, and the step is
// the customer's four-stage tracker.
//
//   draft               (not an order yet)     step 0
//   submitted           Intake Complete        step 1
//   needs_info          (off-ramp)             step 1
//   in_review           Ready for Review       step 2
//   work_started        Work Started           step 3   + work_started_at
//   deliverables_ready  Deliverables Ready     step 3
//   ready               Delivered              step 4
//
// Every stored status has an entry here, because Dashboard.jsx reads
// STUDY_STATUS[status].label straight out of this map. 'draft' has to be in it
// for that reason: a Platinum buyer can hold a saved draft, and a missing key
// there is a crash rather than a wrong label.
export const STUDY_STEPS = ["Submitted", "In review", "Work started", "Delivered"];

export const STUDY_STATUS = {
  draft: {
    label: "Draft saved",
    step: 0,
    note: "Your property details are saved. Nothing has been sent to us yet, so you can keep editing them.",
  },
  submitted: { label: "Submitted", step: 1, note: "We have your details and will start the review shortly." },
  in_review: { label: "In review", step: 2, note: "Your property is being reviewed. You will be notified when the study is ready." },
  needs_info: { label: "Needs information", step: 1, note: "We need a little more from you before we can finish. See the note below and update your details." },
  work_started: {
    label: "Work started",
    step: 3,
    note: "We have begun the work on your feasibility study and site plan. We will let you know as soon as they are ready.",
  },
  deliverables_ready: {
    label: "Being finalized",
    step: 3,
    note: "Your feasibility study and site plan are prepared and getting a final check before we release them to you.",
  },
  ready: { label: "Ready", step: 4, note: "Your feasibility study and site plan are ready." },
};

// Never returns undefined. A deployed frontend can be older than the deployed
// database (decision 2j is on the books because exactly that happened), so an
// unrecognised status must degrade to a truthful "in progress" line rather than
// crash the page on STUDY_STATUS[status].label.
export const studyStatus = (status) =>
  STUDY_STATUS[status] || { label: "In progress", step: 2, note: "Your study is in progress. You will be notified when it is ready." };

const myAppUserId = async () => {
  if (!supabaseEnabled) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  return data?.id || null;
};

export const fetchMyStudy = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase.from("studies").select("*").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, study: data || null };
};

// A refusal from the 2q gate, told apart from every other write failure.
// PostgREST hands back the Postgres error, and the transition into 'submitted'
// fails the RLS WITH CHECK when the account holds no live Platinum or Concierge
// entitlement. That is the product working, not a bug, and the page has to be
// able to say "this needs Platinum" instead of printing a database sentence.
const isEntitlementRefusal = (error) =>
  error?.code === "42501" || /row-level security/i.test(error?.message || "");

// The study row, created as a DRAFT if the homeowner does not have one yet.
//
// studies.user_id is UNIQUE: one study per homeowner. So this never inserts a
// second row — an existing draft is the row an upgrade transitions, and a second
// insert would fail on the unique constraint rather than start a new order. The
// insert names no status, because the status column is not in the homeowner's
// insert grant (0003) and the database default is 'draft' (0018): the only route
// into 'submitted' is the transition below, at every tier.
const ensureStudy = async ({ intake, homeownerNote }) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const existing = await fetchMyStudy();
  if (!existing.ok) return { ok: false, error: existing.error };
  if (existing.study) return { ok: true, study: existing.study };
  const { data, error } = await supabase
    .from("studies")
    .insert({ user_id: userId, intake, homeowner_note: homeownerNote || null })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: isEntitlementRefusal(error) ? "not-entitled" : error.message };
  return { ok: true, study: data, created: true };
};

// Write the intake side of an existing row.
//
// Three outcomes, kept apart because they need three different sentences:
//   ok          the write landed, and the returned row is what the database has.
//   not-entitled  the 2q gate refused it. Only 'submitted' can be refused this
//               way; saving a draft never is.
//   locked      the update matched NO row. RLS (0003) lets the customer write
//               their intake only while the study is draft, submitted or
//               needs_info, and past that PostgREST returns no data and no
//               error. A stale tab has to be told the work has moved on instead
//               of being handed a null study and dropped back to an empty form.
const patchStudy = async (study, patch) => {
  const { data, error } = await supabase
    .from("studies")
    .update(patch)
    .eq("id", study.id)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: isEntitlementRefusal(error) ? "not-entitled" : error.message, study };
  if (!data) return { ok: false, error: "locked", study };
  return { ok: true, study: data };
};

// SAVE. Free at every tier (2q). The status is deliberately not in the patch: a
// draft stays a draft, and a customer editing an intake they have already
// submitted keeps their order where it is.
export const saveDraft = async ({ intake, homeownerNote }) => {
  const r = await ensureStudy({ intake, homeownerNote });
  if (!r.ok) return r;
  if (r.created) return { ok: true, study: r.study };
  return patchStudy(r.study, { intake, homeowner_note: homeownerNote || null });
};

// SUBMIT. The gated transition, and the only thing that makes a study an order.
// Always two statements for a first-time submit, because the insert can only
// ever create a draft: that is the shape 2q asks for, not a round trip that
// could be saved.
//
// Resubmission after needs_info comes back through here as well, which is why
// submitted_at is re-stamped: the queue is ordered by it.
export const submitStudy = async ({ intake, homeownerNote }) => {
  const r = await ensureStudy({ intake, homeownerNote });
  if (!r.ok) return r;
  return patchStudy(r.study, {
    intake,
    homeowner_note: homeownerNote || null,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });
};

// Upload a photo or document under <my id>/intake/. Returns the storage path.
export const uploadIntakeFile = async (file) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const path = `${userId}/intake/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path, name: file.name, size: file.size, type: file.type };
};

export const signedUrl = async (path, seconds = 3600) => {
  if (!supabaseEnabled || !path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) return null;
  return data.signedUrl;
};

// Written threads with ADUAtlas (support_messages, migration 0024).
//
// One table, two conversations, told apart by `kind` (contract C1):
//   'support'         Concierge written support, on /support. The database
//                     accepts a homeowner's message only while the account
//                     holds a live Concierge entitlement.
//   'refund_request'  a refund request and ADUAtlas's replies to it, on
//                     /settings. Accepted only while the account holds a live
//                     entitlement that MONEY bought (my_qualifying_paid_plan() is
//                     not null): never for sponsored or comped access.
// The homeowner reads their own messages of both kinds, and an admin reply is
// written with the kind of the thread it answers, so each page asks for its own
// kind and never shows the other conversation.
export const MESSAGE_KINDS = { SUPPORT: "support", REFUND_REQUEST: "refund_request" };
const KNOWN_KINDS = new Set(Object.values(MESSAGE_KINDS));

// A frontend can be deployed ahead of its migration (decision 2j, lane C). A
// database without 0024 has no kind column: 42703 from a select, PGRST204 from
// an insert that names it. It also has only one thread, the support thread, and
// no gate on it, so the honest fallback is the pre-0024 read and write: every
// row is support, and there is no separate refund thread to show.
const noKindColumn = (error) => ["42703", "PGRST204"].includes(error?.code) && /kind/.test(error?.message || "");

export const fetchMessages = async (kind = MESSAGE_KINDS.SUPPORT) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  if (!KNOWN_KINDS.has(kind)) return { ok: false, error: "unknown-kind" };
  const { data, error } = await supabase
    .from("support_messages")
    .select("id, author, body, created_at, kind")
    .eq("kind", kind)
    .order("created_at", { ascending: true });
  if (error && noKindColumn(error)) {
    if (kind !== MESSAGE_KINDS.SUPPORT) return { ok: true, messages: [] };
    const old = await supabase.from("support_messages").select("id, author, body, created_at").order("created_at", { ascending: true });
    if (old.error) return { ok: false, error: old.error.message };
    return { ok: true, messages: (old.data || []).map((m) => ({ ...m, kind: MESSAGE_KINDS.SUPPORT })) };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, messages: data || [] };
};

// A refusal from the 0024 insert policy (the account does not hold what that
// kind of message needs), told apart from every other failure so the page can
// say which it was.
export const sendMessage = async (body, kind = MESSAGE_KINDS.SUPPORT) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  if (!KNOWN_KINDS.has(kind)) return { ok: false, error: "unknown-kind" };
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const row = { user_id: userId, author: "homeowner", body: body.slice(0, 4000) };
  let { data, error } = await supabase
    .from("support_messages")
    .insert({ ...row, kind })
    .select()
    .maybeSingle();
  if (error && noKindColumn(error)) {
    ({ data, error } = await supabase.from("support_messages").insert(row).select().maybeSingle());
  }
  if (error) return { ok: false, error: isEntitlementRefusal(error) ? "not-entitled" : error.message };
  return { ok: true, message: data };
};
