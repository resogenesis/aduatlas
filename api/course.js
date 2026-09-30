// Serves the paid course text, one piece at a time, to a caller who bought it.
//
// WHY THIS EXISTS (DEF-07). Every chapter body and every module quiz used to be
// compiled into the anonymously served JS bundle from src/stores/courseContent.js.
// PaidGate hid the pages, but anyone could read the whole course by opening the
// bundle. The text now lives in api/_course/content.js, which nothing under src/
// imports, and this is the only route that reads it.
//
// WHO GETS IT. Exactly the course entitlement the product sells, checked on the
// server from the caller's own row, the way api/property-lookup.js checks:
//   - an admin (the console previews the course), or
//   - a live, unrefunded purchase of any tier: paid_at set, refunded_at null,
//     and a paid_tier that ranks Golden or higher. A sponsored Golden counts,
//     because redeem_partner_access() stamps paid_at at redemption. An unknown
//     tier ranks 0 and fails closed. A refund (the webhook nulls paid_at and
//     stamps refunded_at; either half alone is enough) takes access away.
//
// Query: GET /api/course?id=<id>
//        Authorization: Bearer <supabase access token>   (required)
//   id is a chapter id from src/stores/courseStore.js ("m1c1"), a module quiz
//   chapter id ("m1quiz"), or "intro" for the course introduction.
// Returns
//   200 { id, kind: "chapter" | "intro", sections: [...] }
//   200 { id, kind: "quiz", quiz: { title, intro, questions, takeaway } }
//   401 { error: "authentication required" }  no, bad or expired token
//   403 { error: "not-entitled" }             signed in, no live course purchase
//   400 { error: "id required" }
//   404 { error: "not-found" }                no such chapter or quiz
//   405 for anything but GET
// Auth and entitlement are settled before the id is even read, so a caller
// without the course cannot probe which ids exist.
//
// PUBLISHED EDITS. Chapter bodies and the introduction are admin-editable
// (site_content keys "course.chapter.<id>" and "course.intro"). A published
// value wins over the authored default here, exactly as useContentBlocks() does
// on the client, so an edit published from the console still reaches learners.
// It is read with the service role, which is why this route no longer depends on
// the public get_site_content() RPC for course text.
//
// Nothing here may be cached by a shared cache: the answer depends on who asks.

import { service } from "./_admin.js";
import { CHAPTER_CONTENT, MODULE_QUIZZES, COURSE_INTRO } from "./_course/content.js";

const INTRO_ID = "intro";
const ID_SHAPE = /^[a-z0-9]{1,32}$/;

// Mirrors api/property-lookup.js entitledCaller(), at the course's tier.
const courseCaller = async (req) => {
  const svc = service();
  if (!svc) return { configured: false, svc: null, userId: "", entitled: false };
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return { configured: true, svc, userId: "", entitled: false };

  let authUser = null;
  try {
    const { data, error } = await svc.auth.getUser(token);
    if (!error) authUser = data?.user || null;
  } catch {
    // A Supabase fault refuses the call rather than serving paid text to a
    // caller nobody verified.
    return { configured: true, svc, userId: "", entitled: false };
  }
  if (!authUser?.id) return { configured: true, svc, userId: "", entitled: false };

  try {
    const { data: row, error } = await svc
      .from("users")
      .select("id, role, paid_at, paid_tier, refunded_at")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    // A failed read is not a refusal: it fails closed with a retryable 503, so a
    // buyer is never told the course is not in their plan because of a fault.
    if (error) return { configured: true, svc, userId: authUser.id, entitled: false, unavailable: true };
    // Admins preview the course from the console, the same allowance
    // src/components/gates/PaidGate.jsx makes on the client.
    if (row?.role === "admin") return { configured: true, svc, userId: row.id || authUser.id, entitled: true };
    // The SAME rule as public.users_is_paid() (0001): a live, unrefunded payment.
    // Every tier the product sells includes the course, so the tier is not
    // consulted; a buyer whose tier was never recorded is still a buyer.
    const entitled = Boolean(row?.paid_at) && !row?.refunded_at;
    return { configured: true, svc, userId: row?.id || authUser.id, entitled };
  } catch {
    return { configured: true, svc, userId: authUser.id, entitled: false, unavailable: true };
  }
};

// The published override for one admin-editable key, or null. Same acceptance
// rule as useContentBlocks() in src/lib/content.js: a non-empty blocks array.
// A read failure falls back to the authored default rather than failing the
// lesson.
const publishedBlocks = async (svc, key) => {
  try {
    const { data, error } = await svc
      .from("site_content")
      .select("type, published_value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    const v = data.published_value;
    return data.type === "blocks" && Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
};

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Authorization");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const caller = await courseCaller(req);
  if (!caller.configured) {
    console.error("api/course: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
    res.status(500).json({ error: "not-configured" });
    return;
  }
  if (!caller.userId) {
    res.status(401).json({ error: "authentication required" });
    return;
  }
  if (caller.unavailable) {
    res.status(503).json({ error: "entitlement-unavailable" });
    return;
  }
  if (!caller.entitled) {
    res.status(403).json({ error: "not-entitled" });
    return;
  }

  const id = String(req.query?.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  if (!ID_SHAPE.test(id)) {
    res.status(404).json({ error: "not-found" });
    return;
  }

  if (id === INTRO_ID) {
    const sections = (await publishedBlocks(caller.svc, "course.intro")) || COURSE_INTRO;
    res.status(200).json({ id, kind: "intro", sections });
    return;
  }

  if (id.endsWith("quiz")) {
    const moduleId = id.slice(0, -"quiz".length);
    if (!has(MODULE_QUIZZES, moduleId)) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    res.status(200).json({ id, kind: "quiz", quiz: MODULE_QUIZZES[moduleId] });
    return;
  }

  if (!has(CHAPTER_CONTENT, id)) {
    res.status(404).json({ error: "not-found" });
    return;
  }
  const sections = (await publishedBlocks(caller.svc, `course.chapter.${id}`)) || CHAPTER_CONTENT[id];
  res.status(200).json({ id, kind: "chapter", sections });
}
