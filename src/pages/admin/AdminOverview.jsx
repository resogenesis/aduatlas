import { useEffect, useState } from "react";
import { FiUsers, FiDollarSign, FiCheckCircle, FiInbox } from "react-icons/fi";
import { adminGet } from "../../lib/adminApi";

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

const Stat = ({ Icon, label, value, sub }) => (
  <div className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6">
    <div className="flex items-center gap-2 text-paper-dim text-xs uppercase tracking-[0.15em] mb-3">
      <Icon className="text-accent" /> {label}
    </div>
    <p className="font-display text-paper text-3xl sm:text-4xl">{value}</p>
    {sub && <p className="text-paper-dim text-xs mt-1.5">{sub}</p>}
  </div>
);

const AdminOverview = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminGet("overview").then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Admin</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-10">
        Overview
      </h1>

      {error && (
        <p className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!data && !error && <p className="text-paper-dim">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <Stat Icon={FiDollarSign} label="Revenue" value={money(data.revenue)} sub="list price, paid & not refunded" />
            <Stat Icon={FiCheckCircle} label="Paid users" value={data.paid.total} sub={`${data.paid.roadmap} roadmap · ${data.paid.report} report`} />
            <Stat Icon={FiUsers} label="Total users" value={data.users.total} sub={`${data.users.homeowner} homeowner · ${data.users.pro} pro · ${data.users.admin} admin`} />
            <Stat Icon={FiInbox} label="Leads" value={data.leads} sub="top-of-funnel captures" />
          </div>

          <h2 className="text-paper text-xs uppercase tracking-[0.2em] mb-4">Recent signups</h2>
          <div className="overflow-x-auto bg-surface-1-solid border border-stroke rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-paper-dim text-xs uppercase tracking-[0.15em] border-b border-stroke">
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Tier</th>
                  <th className="px-4 py-3 text-left font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((u) => (
                  <tr key={u.email} className="border-b border-stroke/60 last:border-0">
                    <td className="px-4 py-3 text-paper">{u.email}</td>
                    <td className="px-4 py-3 text-paper-dim capitalize">{u.role}</td>
                    <td className="px-4 py-3 text-paper-dim">{u.tier || "—"}</td>
                    <td className="px-4 py-3 text-paper-dim">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminOverview;
