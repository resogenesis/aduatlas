// /api/admin/* — ONE Vercel serverless function for every admin endpoint,
// to stay well under the Hobby plan's 12-function cap. Dispatches on the path
// after /api/admin/:
//   users, create-admin, update-user, overview        (api/admin/_*.js)
//   content/<action>                                   (api/admin/_content.js)
//   studies/<action>                                   (api/admin/_studies.js)
//   builders/<action>                                  (api/admin/_builders.js)
//   regulatory/<action>                                (api/admin/_regulatory.js)
//   regulatory/gov-<action>                            (api/admin/_regulatory.js)
// Each module re-checks requireAdmin, so nothing here is trusted on its own.
//
// The government claims, explicit-authority and education-partnership routes of
// decision 2p are gov-* actions on the regulatory module rather than a function
// of their own, so adding that whole surface leaves the Vercel function count
// exactly where it was.
//
// Vercel's Vite build mangles the catch-all query param name, so the path is
// parsed from req.url rather than req.query (see the note in _content.js).
import users from "./_users.js";
import createAdmin from "./_create_admin.js";
import updateUser from "./_update_user.js";
import overview from "./_overview.js";
import content from "./_content.js";
import studies from "./_studies.js";
import builders from "./_builders.js";
import regulatory from "./_regulatory.js";

const segmentsAfterAdmin = (req) => {
  const pathname = (req.url || "").split("?")[0];
  const parts = pathname.split("/").filter(Boolean); // ["api","admin",...]
  const i = parts.indexOf("admin");
  return i >= 0 ? parts.slice(i + 1) : [];
};

// Vercel, outside Next.js, routes [...action].js as ONE path segment. So
// /api/admin/regulatory/provision-save never reached this function: found on
// staging 2026-09-26, every three-segment admin path returned Vercel's own
// NOT_FOUND, which left the content, builders, studies and regulatory consoles
// unreachable while /api/admin/overview worked. vercel.json now rewrites a
// deeper path to its first segment and carries the remainder in __admin_rest.
// The original URL is rebuilt HERE, before any module reads req.url, so every
// module sees exactly the path the console requested. If the platform already
// passed the original path, it is left alone rather than doubled. "." and ".."
// segments are dropped; nothing here is trusted anyway, because every module
// re-checks requireAdmin.
const REST_PARAM = "__admin_rest";
const restoreDeepPath = (req) => {
  const raw = req.url || "";
  const q = raw.indexOf("?");
  if (q < 0) return;
  const params = new URLSearchParams(raw.slice(q + 1));
  if (!params.has(REST_PARAM)) return;
  const extra = (params.get(REST_PARAM) || "").split("/").filter((s) => s && s !== "." && s !== "..");
  params.delete(REST_PARAM);
  const parts = raw.slice(0, q).split("/").filter(Boolean);
  const alreadyThere = extra.length > 0 && parts.slice(-extra.length).join("/") === extra.join("/");
  const path = "/" + (alreadyThere ? parts : parts.concat(extra)).join("/");
  const qs = params.toString();
  req.url = qs ? `${path}?${qs}` : path;
};

export default async function handler(req, res) {
  restoreDeepPath(req);
  const [head] = segmentsAfterAdmin(req);
  switch (head) {
    case "users":
      return users(req, res);
    case "create-admin":
      return createAdmin(req, res);
    case "update-user":
      return updateUser(req, res);
    case "overview":
      return overview(req, res);
    case "content":
      return content(req, res);
    case "studies":
      return studies(req, res);
    case "builders":
      return builders(req, res);
    case "regulatory":
      return regulatory(req, res);
    default:
      res.status(404).json({ error: "not found" });
  }
}
