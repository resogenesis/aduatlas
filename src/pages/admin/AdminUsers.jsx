import { useEffect, useState } from "react";
import { adminGet, adminPost } from "../../lib/adminApi";
import { planById } from "../../lib/plans";

const ROLES = ["homeowner", "pro", "admin"];
const TIERS = [
  { value: "", label: "No access" },
  { value: "roadmap", label: "Golden" },
  { value: "report", label: "Platinum" },
  { value: "concierge", label: "Concierge" },
];

const planName = (id) => planById(id)?.name || "this plan";

// How an account holds its access, as api/admin/_users.js reports it. Bought,
// sponsored and comped access look the same on the tier alone, so the list says
// which one it is (decision 2r, and Richard's decision of 2026-09-27 for comps).
// An account whose purchase the database only infers (no origin recorded, no
// sponsorship or comp on record) reads "Not recorded", never "Bought": it is
// counted as bought in the revenue figure, and the overview says so, but this
// list does not present an inference as a record. "Not known" appears only when
// the origin data could not be read at all.
const accessKey = (u, originAvailable) => {
  if (!u.paid) return "none";
  if (u.access === "bought") return u.origin_recorded ? "bought" : "not_recorded";
  if (u.access === "comped" || u.access === "sponsored") return u.access;
  return originAvailable ? "not_recorded" : "unknown";
};

const Access = ({ k, u }) => {
  if (k === "none") return <span>-</span>;
  if (k === "bought") return <span>Bought</span>;
  if (k === "comped") return <span>Comped</span>;
  if (k === "sponsored") return <span>Sponsored</span>;
  if (k === "not_recorded") {
    return (
      <span>
        Not recorded
        {u.access === "bought" && (
          <>
            {" "}
            <span className="block text-xs">Counted as bought</span>
          </>
        )}
      </span>
    );
  }
  return <span>Not known</span>;
};

// Taking access away is confirmed when somebody other than ADUAtlas gave it: a
// payment or a partner's sponsorship. Nothing is refunded from here.
const revokeQuestion = (u, k) => {
  const plan = planName(u.paid_tier);
  if (k === "bought" || k === "not_recorded") {
    return `This account's ${plan} counts as bought. Take the access away anyway? No refund is made from here.`;
  }
  if (k === "sponsored") {
    return `An education partner gave this account ${plan}. Take the access away anyway?`;
  }
  return null;
};

const AdminUsers = () => {
  const [users, setUsers] = useState(null);
  const [originAvailable, setOriginAvailable] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  const load = () =>
    adminGet("users")
      .then((d) => {
        setUsers(d.users);
        setOriginAvailable(d.origin_available !== false);
      })
      .catch((e) => setError(e.message));

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
      await load();
    } finally {
      setBusy(null);
    }
  };

  const setRole = (u, role) => patch(u, { role });
  // Choosing a plan COMPS it: the server records it as given at no charge
  // (paid_origin 'admin_comp'), never as a purchase. Choosing "No access" takes
  // the access away and leaves the record of what the account held.
  const setTier = (u, tier, k) => {
    if (tier) return patch(u, { paid: true, paid_tier: tier });
    const question = revokeQuestion(u, k);
    if (question && !window.confirm(question)) return undefined;
    return patch(u, { paid: false });
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-3">
        Users
      </h1>
      <p className="text-paper-dim text-sm mb-2">
        Change a user's role, comp them a plan, or take their access away. Changes take effect on their next page load.
      </p>
      <p className="text-paper-dim text-sm mb-8">
        A comp gives the plan at no charge. It is never counted as revenue and never earns credit toward a higher plan.
        A plan the homeowner bought cannot be comped over, so their payment stays on record.
      </p>

      {error && (
        <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!users && !error && <p className="text-paper-dim">Loading…</p>}

      {users && !originAvailable && (
        <p className="mb-6 text-sm text-paper-dim">
          Payment origin could not be read, so bought, comped and sponsored access cannot be told apart right now.
        </p>
      )}

      {users && (
        <div className="overflow-x-auto bg-surface-1-solid border border-stroke rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-paper-dim text-xs border-b border-stroke">
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Access</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const k = accessKey(u, originAvailable);
                const bought = k === "bought" || (k === "not_recorded" && u.access === "bought");
                return (
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
                        onChange={(e) => setTier(u, e.target.value, k)}
                        title={bought ? "This plan counts as bought, so it cannot be comped over" : "Choosing a plan comps it at no charge"}
                        className="px-2 py-1.5 rounded-lg bg-canvas border border-stroke text-paper text-sm focus:outline-none focus:border-accent"
                      >
                        {TIERS.map((t) => (
                          <option key={t.value} value={t.value} disabled={bought && t.value !== "" && t.value !== u.paid_tier}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-paper-dim" data-access={k}>
                      <Access k={k} u={u} />
                    </td>
                    <td className="px-4 py-3 text-paper-dim">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
