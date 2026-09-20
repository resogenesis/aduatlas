// POST /api/admin/create-admin — create a new pre-confirmed admin account.
// Admin-only: only an existing admin can mint another. Body: { email, password }.
import { requireAdmin, readBody } from "../_admin.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }

  const body = readBody(req);
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!EMAIL_RE.test(email) || password.length < 6) {
    res.status(400).json({ error: "valid email and 6+ character password required" });
    return;
  }

  // Create the auth user (pre-confirmed). The on_auth_user_created trigger makes
  // a users row with role clamped to homeowner; we then promote it to admin —
  // which only the service role can do, so this path is the only way in.
  const { data: created, error: ce } = await ctx.svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: email.split("@")[0] },
  });
  if (ce) {
    res.status(400).json({ error: ce.message });
    return;
  }

  const { error: ue } = await ctx.svc
    .from("users")
    .update({ role: "admin" })
    .eq("auth_user_id", created.user.id);
  if (ue) {
    res.status(500).json({ error: `account created but promotion failed: ${ue.message}` });
    return;
  }

  res.status(200).json({ ok: true, email });
}
