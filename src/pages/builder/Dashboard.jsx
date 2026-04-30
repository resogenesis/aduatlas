import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiInbox, FiTrendingUp, FiUserCheck } from "react-icons/fi";
import { currentUser } from "../../funnel/authStore";
import { allLeads, builderStats } from "../../funnel/builderStore";

const Dashboard = () => {
  const user = currentUser();
  const stats = builderStats();
  const recent = allLeads().slice(0, 4);

  const cards = [
    { label: "New leads", value: stats.newCount, Icon: FiInbox, hi: true },
    { label: "Viewed", value: stats.viewed, Icon: FiUserCheck },
    { label: "Claimed", value: stats.claimed, Icon: FiCheckCircle },
    { label: "Avg. readiness", value: `${stats.avgScore}%`, Icon: FiTrendingUp },
  ];

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">

      {/* Welcome strip */}
      <div className="mb-10">
        <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
          Builder portal
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Welcome back, <span className="italic text-paper-dim">{user?.username || "builder"}.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg mt-3 max-w-2xl">
          Every homeowner here paid $79.99, completed the course, and produced a builder-ready packet. No tire-kickers.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stroke rounded-2xl overflow-hidden mb-10">
        {cards.map(({ label, value, Icon, hi }) => (
          <div key={label} className={`bg-surface-1-solid p-5 sm:p-7 ${hi ? "lg:bg-accent" : ""}`}>
            <div className={`flex items-center gap-2 text-xs uppercase tracking-[0.15em] mb-3 ${hi ? "text-accent-fg/70" : "text-paper-dim"}`}>
              <Icon /> {label}
            </div>
            <p className={`font-display text-4xl sm:text-5xl ${hi ? "text-accent-fg lg:text-accent-fg" : "text-paper"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent leads */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10 mb-6">
        <div className="flex items-end justify-between mb-7 flex-wrap gap-3">
          <div>
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Recent leads</p>
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl">
              Your inbox
            </h2>
          </div>
          <Link
            to="/builder/leads"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
          >
            View all leads <FiArrowRight />
          </Link>
        </div>

        <div className="space-y-px">
          {recent.map((lead) => (
            <Link
              key={lead.id}
              to={`/builder/leads/${lead.id}`}
              className="flex items-center gap-4 sm:gap-6 py-5 border-t border-stroke first:border-t-0 transition-colors hover:bg-canvas/60 -mx-7 sm:-mx-10 px-7 sm:px-10"
            >
              <div className="w-10 h-10 rounded-full bg-canvas border border-stroke flex items-center justify-center font-display text-paper text-sm shrink-0">
                {lead.score}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-paper text-base sm:text-lg">{lead.homeowner}</h3>
                  {lead.status === "new" && (
                    <span className="text-[0.65rem] font-semibold bg-accent text-accent-fg rounded-full px-2 py-0.5 uppercase tracking-wider">
                      New
                    </span>
                  )}
                </div>
                <p className="text-paper-dim text-xs sm:text-sm truncate">
                  {lead.aduType} · {lead.desiredSqft} sq ft · {lead.city}, {lead.state} {lead.zip}
                </p>
              </div>
              <span className="text-paper-dim text-xs hidden sm:inline shrink-0">
                {lead.budget}
              </span>
              <FiArrowRight className="text-paper-dim shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Coming soon callout */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10">
        <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
          What's next
        </p>
        <h2 className="font-display font-medium text-paper text-xl sm:text-2xl leading-snug mb-3">
          Per-lead pricing rolls out after the pilot.
        </h2>
        <p className="text-paper-dim text-sm sm:text-base leading-relaxed max-w-2xl">
          Pilot builders see qualified packets free during the launch period. After the pilot, leads will run $200–$300 per packet or unlimited via subscription. Pricing locks at the rate you join at.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
