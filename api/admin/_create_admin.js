// POST /api/admin/create-admin — create (or promote) an ADUAtlas admin account.
//
// There are exactly two ways to authorise this call.
//
// 1. AN EXISTING ADMIN. requireAdmin(req) validates the caller's Supabase access
//    token and checks users.role === 'admin'. This is the normal path, it is
//    what the Admins page in the console uses, and it is the ONLY path once
//    ADUAtlas has an admin.
//
// 2. FIRST-ADMIN BOOTSTRAP, for launch morning. Until this existed nobody could
//    create the first admin at all: this endpoint required an admin,
//    api/_admin.js returns null for every other caller, and the 0001 signup
//    trigger clamps every new account to homeowner|pro, so the only route in was
//    hand editing production Postgres. Amy could not have got into the console.
//
//    The bootstrap requires BOTH of these, and refuses if either is missing:
//      (a) the x-adu-bootstrap-secret request header matching the
//          ADMIN_BOOTSTRAP_SECRET environment variable. It is server-side only,
//          never VITE_-prefixed, never reaches the browser, and must be at
//          least MIN_SECRET_LENGTH characters, so an unset or blank variable
//          cannot be matched by an unset or blank header. The comparison is over
//          SHA-256 digests with timingSafeEqual, so it is constant time and
//          length independent.
//      (b) ZERO rows in public.users with role 'admin'.
//
//    (b) is what makes this impossible to use as privilege escalation: the first
//    success closes the door behind itself, and every later call falls through
//    to path 1. The count is re-checked immediately before the promotion as well
//    as at the start, and if an admin appeared in between, an account this
//    request created is deleted again so a refused bootstrap leaves nothing
//    behind.
//
//    Once the first admin exists, delete ADMIN_BOOTSTRAP_SECRET from the
//    deployment. With the variable gone the path cannot even be attempted.
//
// Body: { email, password }. In bootstrap mode the password may be omitted when
// the email already has an account, which promotes that existing account (it is
// how Amy signs herself up normally and then becomes the first admin). A
// password is never changed by this endpoint; a forgotten one goes through
// /forgot-password.
import { createHash, timingSafeEqual } from "node:crypto";
import { requireAdmin, readBody, service } from "../_admin.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const MIN_SECRET_LENGTH = 32;
const BOOTSTRAP_HEADER = "x-adu-bootstrap-secret";

const digest = (value) => createHash("sha256").update(String(value), "utf8").digest();

const bootstrapSecret = () => process.env.ADMIN_BOOTSTRAP_SECRET || "";

const bootstrapConfigured = () => bootstrapSecret().length >= MIN_SECRET_LENGTH;

const secretMatches = (presented) => {
  if (!presented || !bootstrapConfigured()) return false;
  // Equal-length digests, so timingSafeEqual never throws and the comparison
  // leaks neither the secret's length nor how far a guess got.
  return timingSafeEqual(digest(presented), digest(bootstrapSecret()));
};

// How many admins public.users holds right now. Returns { count } or { error }.
const countAdmins = async (svc) => {
  const { count, error } = await svc
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) return { error: error.message };
  return { count: count || 0 };
};

const ALREADY_REGISTERED = /already (been )?registered|already exists|duplicate key|email address is already/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const ctx = await requireAdmin(req);
  const presentedSecret = req.headers[BOOTSTRAP_HEADER] || "";
  let svc = ctx?.svc || null;
  let mode = ctx ? "admin" : null;

  if (!ctx) {
    // Not an admin caller. The bootstrap is the only other door, and it only
    // opens while ADUAtlas has no admin at all.
    if (!presentedSecret) {
      res.status(403).json({ error: "admin only" });
      return;
    }
    if (!bootstrapConfigured()) {
      // Worth saying plainly: an operator holding the secret needs to know the
      // deployment is missing the variable, and this reveals nothing that helps
      // anyone guess it.
      res.status(503).json({
        error: `first-admin bootstrap is not configured on this deployment (set ADMIN_BOOTSTRAP_SECRET, at least ${MIN_SECRET_LENGTH} characters)`,
      });
      return;
    }
    if (!secretMatches(presentedSecret)) {
      res.status(403).json({ error: "admin only" });
      return;
    }
    svc = service();
    if (!svc) {
      res.status(500).json({ error: "server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
      return;
    }
    const before = await countAdmins(svc);
    if (before.error) {
      res.status(500).json({ error: before.error });
      return;
    }
    if (before.count > 0) {
      res.status(409).json({
        error: "first-admin bootstrap is closed: an admin already exists. Sign in as that admin to create another.",
      });
      return;
    }
    mode = "bootstrap";
  }

  const body = readBody(req);
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "valid email required" });
    return;
  }
  if (mode === "admin" && password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `valid email and ${MIN_PASSWORD_LENGTH}+ character password required` });
    return;
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  // Create the auth user (pre-confirmed). The on_auth_user_created trigger makes
  // the public.users row with role clamped to homeowner; the promotion below is
  // service-role only, so this endpoint is the only way to reach 'admin'.
  let createdAuthUserId = null;
  let promotedExisting = false;

  if (password) {
    const { data: created, error: ce } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: email.split("@")[0] },
    });
    if (ce) {
      // In bootstrap mode an existing account is not a failure: promote it.
      // Amy signing up through the normal form and then bootstrapping is the
      // expected launch-morning sequence.
      if (mode === "bootstrap" && ALREADY_REGISTERED.test(ce.message || "")) {
        promotedExisting = true;
      } else {
        res.status(400).json({ error: ce.message });
        return;
      }
    } else {
      createdAuthUserId = created?.user?.id || null;
    }
  } else {
    // Bootstrap with no password: promote an account that already exists.
    promotedExisting = true;
  }

  const { data: row, error: re } = await svc
    .from("users")
    .select("id, auth_user_id, role")
    .eq("email", email)
    .maybeSingle();
  if (re) {
    res.status(500).json({ error: re.message });
    return;
  }
  if (promotedExisting && !row) {
    res.status(404).json({
      error: "no ADUAtlas account uses that email. Send a password to create the account as well.",
    });
    return;
  }
  if (promotedExisting && !row.auth_user_id) {
    // A purchase created the email row before anyone signed up, so there is no
    // login to promote yet.
    res.status(409).json({
      error: "that email has an ADUAtlas record but no login yet. Send a password to create the login.",
    });
    return;
  }

  if (mode === "bootstrap") {
    // Re-check on the narrow window between the first count and this promotion.
    const stillEmpty = await countAdmins(svc);
    if (stillEmpty.error) {
      res.status(500).json({ error: stillEmpty.error });
      return;
    }
    if (stillEmpty.count > 0) {
      if (createdAuthUserId) {
        try {
          await svc.auth.admin.deleteUser(createdAuthUserId);
        } catch {
          // Best effort: the account stays as a plain homeowner, never an admin.
        }
      }
      res.status(409).json({
        error: "first-admin bootstrap is closed: an admin already exists. Sign in as that admin to create another.",
      });
      return;
    }
  }

  const authUserId = createdAuthUserId || row?.auth_user_id || null;
  const promote = svc.from("users").update({ role: "admin" });
  const { error: ue } = authUserId
    ? await promote.eq("auth_user_id", authUserId)
    : await promote.eq("email", email);
  if (ue) {
    res.status(500).json({ error: `account created but promotion failed: ${ue.message}` });
    return;
  }

  res.status(200).json({
    ok: true,
    email,
    mode,
    promotedExisting,
    ...(mode === "bootstrap"
      ? {
          note: "First admin created. Remove ADMIN_BOOTSTRAP_SECRET from the deployment; every further admin is created from the Admins page in the console.",
        }
      : {}),
  });
}
