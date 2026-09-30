import { useEffect, useState } from "react";
import { FiUsers, FiDollarSign, FiCheckCircle, FiInbox, FiGift, FiAward } from "react-icons/fi";
import { adminGet } from "../../lib/adminApi";
import { planById } from "../../lib/plans";

const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const planName = (id) => planById(id)?.name || id || "-";

// How an account holds its access, as api/admin/_overview.js reports it.
// Sponsored and comped access are never revenue (decision 2r, and Richard's
// decision of 2026-09-27 for comps). A purchase the database only infers reads
// "Not recorded", as it does on the users screen.
const accessLabel = (u) => {
  if (u.access === "bought") return u.origin_recorded === false ? "Not recorded" : "Bought";
  if (u.access === "comped") return "Comped";
  if (u.access === "sponsored") return "Sponsored";
  return "Not known";
};

const Stat = ({ Icon, label, value, sub }) => (
  <div className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6">
    <div className="flex items-center gap-2 text-paper-dim text-xs mb-3">
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

  // null means the server could not tell bought from sponsored access, so it
  // sent no figure rather than a guess.
  const known = data && data.revenue !== null && data.revenue !== undefined && data.paid && data.sponsored;
  const notRecorded = known ? data.paid.not_recorded || 0 : 0;
  const unknown = data?.unknown || 0;
  // Comps are counted apart from everything else. An older server that sends no
  // comped figure gets "Not known" rather than a zero it never measured.
  const comped = known && data.comped ? data.comped : null;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] tracking-tight mb-10">
        Overview
      </h1>

      {error && (
        <p className="mb-6 text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!data && !error && <p className="text-paper-dim">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <Stat
              Icon={FiDollarSign}
              label="Revenue"
              value={known ? money(data.revenue) : "Not known"}
              sub={known ? "List price of bought plans, not refunded" : "Payment origin could not be read"}
            />
            <Stat
              Icon={FiCheckCircle}
              label="Bought"
              value={known ? data.paid.total : "Not known"}
              sub={known ? `${data.paid.roadmap} Golden · ${data.paid.report} Platinum · ${data.paid.concierge} Concierge` : null}
            />
            <Stat
              Icon={FiGift}
              label="Sponsored"
              value={known ? data.sponsored.total : "Not known"}
              sub="An education partner gave this access. It is not revenue."
            />
            <Stat
              Icon={FiAward}
              label="Comped"
              value={comped ? comped.total : "Not known"}
              sub={
                comped
                  ? `${comped.roadmap} Golden · ${comped.report} Platinum · ${comped.concierge} Concierge. Given by an admin at no charge. It is not revenue.`
                  : "Given by an admin at no charge. It is not revenue."
              }
            />
            <Stat Icon={FiUsers} label="Total users" value={data.users.total} sub={`${data.users.homeowner} homeowner · ${data.users.pro} pro · ${data.users.admin} admin`} />
            <Stat Icon={FiInbox} label="Leads" value={data.leads} sub="top-of-funnel captures" />
          </div>

          <div className="space-y-2 mb-10 text-paper-dim text-xs">
            {!known && (
              <p>
                Payment origin could not be read, so bought, comped and sponsored access cannot be told apart. Revenue
                is not shown until it can be.
              </p>
            )}
            {notRecorded > 0 && (
              <p>
                {notRecorded === 1 ? "1 bought account has" : `${notRecorded} bought accounts have`} no payment origin on
                record. {notRecorded === 1 ? "It counts" : "They count"} as bought because no sponsorship or comp is on
                record for the plan held. That is {money(data.revenue_not_recorded)} of the revenue above.
              </p>
            )}
            {known && unknown > 0 && (
              <p>
                {unknown === 1 ? "1 account holds" : `${unknown} accounts hold`} access that is not bought, comped or
                sponsored on record. It is not counted as revenue.
              </p>
            )}
          </div>

          <h2 className="text-paper text-xs mb-4">Recent signups</h2>
          <div className="overflow-x-auto bg-surface-1-solid border border-stroke rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-paper-dim text-xs border-b border-stroke">
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Tier</th>
                  <th className="px-4 py-3 text-left font-medium">Access</th>
                  <th className="px-4 py-3 text-left font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((u) => (
                  <tr key={u.email} className="border-b border-stroke/60 last:border-0">
                    <td className="px-4 py-3 text-paper">{u.email}</td>
                    <td className="px-4 py-3 text-paper-dim capitalize">{u.role}</td>
                    <td className="px-4 py-3 text-paper-dim">{u.tier ? planName(u.tier) : "-"}</td>
                    <td className="px-4 py-3 text-paper-dim">{u.tier ? accessLabel(u) : "-"}</td>
                    <td className="px-4 py-3 text-paper-dim">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
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
