// /api/admin/* — ONE Vercel serverless function for every admin endpoint,
// to stay well under the Hobby plan's 12-function cap. Dispatches on the path
// after /api/admin/:
//   users, create-admin, update-user, overview        (api/admin/_*.js)
//   content/<action>                                   (api/admin/_content.js)
//   studies/<action>                                   (api/admin/_studies.js)
// Each module re-checks requireAdmin, so nothing here is trusted on its own.
//
// Vercel's Vite build mangles the catch-all query param name, so the path is
// parsed from req.url rather than req.query (see the note in _content.js).
import users from "./_users.js";
import createAdmin from "./_create_admin.js";
import updateUser from "./_update_user.js";
import overview from "./_overview.js";
import content from "./_content.js";
import studies from "./_studies.js";

const segmentsAfterAdmin = (req) => {
  const pathname = (req.url || "").split("?")[0];
  const parts = pathname.split("/").filter(Boolean); // ["api","admin",...]
  const i = parts.indexOf("admin");
  return i >= 0 ? parts.slice(i + 1) : [];
};

export default async function handler(req, res) {
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
    default:
      res.status(404).json({ error: "not found" });
  }
}
