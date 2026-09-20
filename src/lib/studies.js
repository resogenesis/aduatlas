// Homeowner side of the feasibility-study workflow. Talks to Supabase with the
// signed-in user's session; RLS + column grants (0003_studies.sql) limit the
// client to its own row and to the intake side of it. Deliverables uploaded
// by an admin are read back through short-lived signed URLs.
import { supabase, supabaseEnabled } from "./supabase";

const BUCKET = "studies";

export const STUDY_STATUS = {
  submitted: { label: "Submitted", step: 1, note: "We have your details and will start the review shortly." },
  in_review: { label: "In review", step: 2, note: "Your property is being reviewed. You will be notified when the study is ready." },
  needs_info: { label: "Needs information", step: 1, note: "We need a little more from you before we can finish. See the note below and update your details." },
  ready: { label: "Ready", step: 3, note: "Your feasibility study and site plan are ready." },
};

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

// Create or resubmit the intake. Resubmission after needs_info moves the
// study back to 'submitted' (the only status the client may write).
export const submitIntake = async ({ intake, homeownerNote }) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const existing = await fetchMyStudy();
  if (existing.ok && existing.study) {
    const { data, error } = await supabase
      .from("studies")
      .update({ intake, homeowner_note: homeownerNote || null, status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", existing.study.id)
      .select()
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, study: data };
  }
  const { data, error } = await supabase
    .from("studies")
    .insert({ user_id: userId, intake, homeowner_note: homeownerNote || null })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, study: data };
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

// Concierge portal support thread.
export const fetchMessages = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase
    .from("support_messages")
    .select("id, author, body, created_at")
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, messages: data || [] };
};

export const sendMessage = async (body) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const { data, error } = await supabase
    .from("support_messages")
    .insert({ user_id: userId, author: "homeowner", body: body.slice(0, 4000) })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: data };
};
