import { useEffect, useState } from "react";
import { FiShield } from "react-icons/fi";
import { adminGet, adminPost } from "../../lib/adminApi";

const AdminAdmins = () => {
  const [admins, setAdmins] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    adminGet("users")
      .then((d) => setAdmins(d.users.filter((u) => u.role === "admin")))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminPost("create-admin", { email, password });
      setNotice(`Admin created: ${email.trim().toLowerCase()}`);
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-2xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Admin</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-3">
        Admins
      </h1>
      <p className="text-paper-dim text-sm mb-8">
        Only an admin can create another admin. New admins are created pre-confirmed and can log
        in immediately.
      </p>

      <form onSubmit={create} className="bg-surface-1-solid border border-stroke rounded-2xl p-6 mb-10">
        <h2 className="text-paper text-sm font-medium mb-4 flex items-center gap-2">
          <FiShield className="text-accent" /> Create a new admin
        </h2>
        <div className="space-y-3">
          <input
            type="email"
            required
            placeholder="admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
          />
          <input
            type="password"
            required
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
          />
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 text-sm text-accent bg-accent/10 border border-accent/30 rounded-xl px-4 py-3">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create admin"}
        </button>
      </form>

      <h2 className="text-paper text-xs uppercase tracking-[0.2em] mb-4">Current admins</h2>
      {!admins && !error && <p className="text-paper-dim">Loading…</p>}
      {admins && (
        <div className="bg-surface-1-solid border border-stroke rounded-2xl divide-y divide-stroke/60">
          {admins.length === 0 && <p className="px-4 py-4 text-paper-dim text-sm">No admins yet.</p>}
          {admins.map((a) => (
            <div key={a.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <FiShield className="text-accent shrink-0" />
              <span className="text-paper">{a.email}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAdmins;
