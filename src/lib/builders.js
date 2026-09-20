// Homeowner side of the builder directory. Reads go through Supabase with the
// signed-in session (RLS: paid homeowners see active builders); saves and
// introduction requests write only the homeowner's own rows.
import { supabase, supabaseEnabled } from "./supabase";

const BUCKET = "builders";

export const SPECIALTY_LABELS = {
  detached: "Detached ADU",
  attached: "Attached ADU",
  garage_conversion: "Garage conversion",
  jadu: "Interior / JADU",
  prefab: "Prefab / factory-built",
  two_story: "Two-story / above garage",
};
export const SERVICE_TYPE_LABELS = {
  design_build: "Design-build",
  general_contractor: "General contractor",
  prefab_manufacturer: "Prefab manufacturer",
  architect: "Architect / designer",
  permit_expediter: "Permit expediter",
};
export const APPROACH_LABELS = { custom: "Custom builds", prefab: "Prefab only", both: "Custom and prefab" };

export const publicUrl = (path) => {
  if (!supabaseEnabled || !path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

const myAppUserId = async () => {
  if (!supabaseEnabled) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  return data?.id || null;
};

// Directory. Filtering by state/city/ZIP/specialty happens client-side on the
// (small) active set so the search box feels instant.
export const fetchBuilders = async () => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled", items: [] };
  const { data, error } = await supabase.from("builders").select("*").eq("active", true).order("featured", { ascending: false }).order("name");
  if (error) return { ok: false, error: error.message, items: [] };
  return { ok: true, items: data || [] };
};

export const fetchBuilder = async (slug) => {
  if (!supabaseEnabled) return { ok: false, error: "supabase-disabled" };
  const { data, error } = await supabase.from("builders").select("*").eq("slug", slug).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, builder: data || null };
};

export const fetchFeaturedBuilders = async () => {
  if (!supabaseEnabled) return [];
  const { data, error } = await supabase.rpc("get_featured_builders");
  return error ? [] : data || [];
};

export const fetchSaved = async () => {
  if (!supabaseEnabled) return new Set();
  const { data } = await supabase.from("saved_builders").select("builder_id");
  return new Set((data || []).map((r) => r.builder_id));
};

export const toggleSaved = async (builderId, saved) => {
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const q = saved
    ? supabase.from("saved_builders").delete().eq("user_id", userId).eq("builder_id", builderId)
    : supabase.from("saved_builders").insert({ user_id: userId, builder_id: builderId });
  const { error } = await q;
  return error ? { ok: false, error: error.message } : { ok: true, saved: !saved };
};

export const fetchMyIntros = async () => {
  if (!supabaseEnabled) return [];
  const { data } = await supabase.from("intro_requests").select("id, builder_id, status, created_at");
  return data || [];
};

export const requestIntro = async (builderId, message) => {
  const userId = await myAppUserId();
  if (!userId) return { ok: false, error: "not-signed-in" };
  const { data, error } = await supabase
    .from("intro_requests")
    .insert({ user_id: userId, builder_id: builderId, message: (message || "").slice(0, 2000) || null })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "already-requested" : error.message };
  return { ok: true, intro: data };
};

// Simple filter used by the directory and by property-aware suggestions.
export const filterBuilders = (items, { q = "", state = "", specialty = "", approach = "" } = {}) => {
  const needle = q.trim().toLowerCase();
  return items.filter((b) => {
    if (state && b.state !== state) return false;
    if (specialty && !(b.specialties || []).includes(specialty)) return false;
    if (approach && b.build_approach !== "both" && b.build_approach !== approach) return false;
    if (!needle) return true;
    const hay = [b.name, b.state, ...(b.cities || []), ...(b.service_zips || [])].join(" ").toLowerCase();
    return hay.includes(needle);
  });
};

// Rank builders for a homeowner's property: same state, then city or ZIP
// match, then a specialty match on the desired ADU type.
export const suggestForProperty = (items, { state, city, zip, aduType }) => {
  const type = (aduType || "").toLowerCase();
  const wanted = type.includes("garage") ? "garage_conversion" : type.includes("attach") ? "attached" : type.includes("prefab") || type.includes("modular") ? "prefab" : type.includes("jadu") || type.includes("interior") ? "jadu" : type.includes("detach") ? "detached" : null;
  return items
    .map((b) => {
      let score = 0;
      if (state && b.state === state) score += 3;
      if (city && (b.cities || []).some((c) => c.toLowerCase() === city.toLowerCase())) score += 3;
      if (zip && (b.service_zips || []).some((z) => zip.startsWith(z))) score += 3;
      if (wanted && (b.specialties || []).includes(wanted)) score += 2;
      if (b.featured) score += 1;
      return { b, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.b);
};

// "1247 Mulberry Ln, Pasadena, CA 91103" -> { city, state, zip }
export const parseAddress = (address = "") => {
  const m = address.match(/,\s*([^,]+?),\s*([A-Z]{2})\b\s*(\d{5})?/i);
  if (!m) return {};
  return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] || "" };
};
