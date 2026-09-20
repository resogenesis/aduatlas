// /api/admin/studies/* — feasibility-study queue for the admin console.
// Dispatched by api/admin/[...action].js. Service role + requireAdmin.
//
//   GET  studies/list                       every study + owner email
//   POST studies/update  { id, status?, admin_note?, consult_minutes_used?, consult_link? }
//   POST studies/upload  { id, kind: "report"|"site_plan", dataUrl, filename? }
//   GET  studies/messages?user_id=...       concierge thread for one homeowner
//   POST studies/reply   { user_id, body }  admin reply into that thread
//   GET  studies/file?path=...              short-lived signed URL for a stored file
import { requireAdmin, readBody } from "../_admin.js";

const STATUSES = ["submitted", "in_review", "needs_info", "ready"];
const BUCKET = "studies";
const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,(.+)$/;
const MAX_BYTES = 6 * 1024 * 1024;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
const safe = (s) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);

const list = async (req, res, ctx) => {
  const { data, error } = await ctx.svc
    .from("studies")
    .select("id, user_id, status, intake, homeowner_note, admin_note, report_path, site_plan_path, consult_minutes_used, consult_link, submitted_at, ready_at, updated_at, users!inner(email, paid_tier)")
    .order("submitted_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const items = (data || []).map((s) => ({
    ...s,
    email: s.users?.email,
    paid_tier: s.users?.paid_tier,
    users: undefined,
  }));
  res.status(200).json({ items });
};

const update = async (req, res, ctx) => {
  const { id, status, admin_note, consult_minutes_used, consult_link } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const patch = {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: "invalid status" });
    patch.status = status;
    if (status === "ready") patch.ready_at = new Date().toISOString();
  }
  if (admin_note !== undefined) patch.admin_note = admin_note || null;
  if (consult_minutes_used !== undefined) {
    const n = Number(consult_minutes_used);
    if (!Number.isInteger(n) || n < 0 || n > 60) return res.status(400).json({ error: "minutes must be 0-60" });
    patch.consult_minutes_used = n;
  }
  if (consult_link !== undefined) patch.consult_link = consult_link || null;
  if (!Object.keys(patch).length) return res.status(400).json({ error: "nothing to update" });
  const { data, error } = await ctx.svc.from("studies").update(patch).eq("id", id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true, study: data });
};

const upload = async (req, res, ctx) => {
  const { id, kind, dataUrl, filename } = readBody(req);
  if (!id || !["report", "site_plan"].includes(kind)) return res.status(400).json({ error: "id and kind (report|site_plan) required" });
  const match = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 PDF or image" });
  const contentType = match[1];
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > MAX_BYTES) return res.status(400).json({ error: "file too large (max 6MB)" });

  const { data: study, error: sErr } = await ctx.svc.from("studies").select("user_id").eq("id", id).maybeSingle();
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (!study) return res.status(404).json({ error: "study not found" });

  const path = `${study.user_id}/deliverables/${kind}-${Date.now()}-${safe(filename) || kind}.${EXT[contentType]}`;
  const { error: upErr } = await ctx.svc.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const column = kind === "report" ? "report_path" : "site_plan_path";
  const { error: updErr } = await ctx.svc.from("studies").update({ [column]: path }).eq("id", id);
  if (updErr) return res.status(500).json({ error: updErr.message });
  res.status(200).json({ ok: true, path });
};

const file = async (req, res, ctx) => {
  const path = (req.query?.path || new URL(req.url, "http://x").searchParams.get("path") || "").trim();
  if (!path) return res.status(400).json({ error: "path required" });
  const { data, error } = await ctx.svc.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ url: data.signedUrl });
};

const messages = async (req, res, ctx) => {
  const userId = (req.query?.user_id || new URL(req.url, "http://x").searchParams.get("user_id") || "").trim();
  if (!userId) return res.status(400).json({ error: "user_id required" });
  const { data, error } = await ctx.svc
    .from("support_messages")
    .select("id, author, body, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ messages: data || [] });
};

const reply = async (req, res, ctx) => {
  const { user_id, body } = readBody(req);
  if (!user_id || !body || typeof body !== "string") return res.status(400).json({ error: "user_id and body required" });
  const { data, error } = await ctx.svc
    .from("support_messages")
    .insert({ user_id, author: "admin", body: body.slice(0, 4000) })
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true, message: data });
};

const ROUTES = {
  list: { GET: list },
  update: { POST: update },
  upload: { POST: upload },
  file: { GET: file },
  messages: { GET: messages },
  reply: { POST: reply },
};

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const pathname = (req.url || "").split("?")[0];
  const action = pathname.split("/").filter(Boolean).pop();
  const route = ROUTES[action];
  if (!route) return res.status(404).json({ error: "not found" });
  const fn = route[req.method];
  if (!fn) return res.status(405).json({ error: `${req.method} not allowed` });
  await fn(req, res, ctx);
}
