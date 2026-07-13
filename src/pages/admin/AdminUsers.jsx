import { useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/adminApi";

const ROLES = ["homeowner", "pro", "admin"];
const TIERS = [
  { value: "", label: "— unpaid —" },
  { value: "roadmap", label: "roadmap ($99)" },
  { value: "report", label: "report ($399)" },
  { value: "concierge", label: "concierge" },
];

const AdminUsers = () => {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const load = () =>
    adminGet("users").then((d) => setUsers(d.users)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const patch = async (u, body) => {
    setBusy(u.id);
    setError("");
    try {
      await adminPost("update-user", { id: u.id, ...body });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const setRole = (u, role) => patch(u, { role });
  const setTier = (u, tier) => patch(u, tier ? { paid: true, paid_tier: tier } : { paid: false, paid_tier: null });

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Admin</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-3">
        Users
      </h1>
      <p className="text-paper-dim text-sm mb-8">
        Change a user's role or grant a paid tier. Changes take effect on their next page load.
      </p>

      {error && (
        <p className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!users && !error && <p className="text-paper-dim">Loading…</p>}

      {users && (
        <div className="overflow-x-auto bg-surface-1-solid border border-stroke rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-paper-dim text-xs uppercase tracking-[0.15em] border-b border-stroke">
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Paid tier</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-stroke/60 last:border-0 ${busy === u.id ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 text-paper">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={busy === u.id}
                      onChange={(e) => setRole(u, e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-canvas border border-stroke text-paper text-sm capitalize focus:outline-none focus:border-accent"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.paid ? u.paid_tier || "" : ""}
                      disabled={busy === u.id}
                      onChange={(e) => setTier(u, e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-canvas border border-stroke text-paper text-sm focus:outline-none focus:border-accent"
                    >
                      {TIERS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-paper-dim">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
