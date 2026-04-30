import { Link, useNavigate } from "react-router-dom";
import { FiArrowRight, FiUsers, FiInbox, FiCheckCircle, FiLogOut } from "react-icons/fi";
import { useEffect } from "react";
import { currentUser, logout } from "../funnel/authStore";

const stats = [
  { label: "Qualified leads waiting", value: "12", icon: FiInbox },
  { label: "Active builder packets", value: "5", icon: FiUsers },
  { label: "Closed this month", value: "2", icon: FiCheckCircle },
];

// Mock builder dashboard. Real builder-side flow lives in a future slice.
// This exists so role-based login can route somewhere coherent.
const BuilderHome = () => {
  const navigate = useNavigate();
  const user = currentUser();

  useEffect(() => {
    if (!user || user.role !== "pro") navigate("/login", { replace: true });
  }, [user, navigate]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-12">
          <div>
            <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
              Builder dashboard
            </p>
            <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
              Welcome back, <span className="italic text-paper-dim">{user.username}.</span>
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm self-start"
          >
            <FiLogOut /> Log out
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-px bg-stroke rounded-2xl overflow-hidden mb-10">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-surface-1-solid p-7">
              <div className="flex items-center gap-2 text-paper-dim text-xs uppercase tracking-[0.15em] mb-4">
                <Icon /> {label}
              </div>
              <p className="font-display text-paper text-5xl">{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12">
          <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
            Coming soon
          </p>
          <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl leading-snug mb-3">
            Builder marketplace launches next.
          </h2>
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-7 max-w-2xl">
            Qualified Builder Packets — homeowners who paid $79.99, completed the 6-chapter course, and produced a builder-ready RFP — will appear here. Until then, this is a placeholder so role-based auth has somewhere to land.
          </p>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
          >
            How the system works <FiArrowRight />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BuilderHome;
