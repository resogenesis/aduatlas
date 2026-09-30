import { useState } from "react";
import { Navigate, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { FiGrid, FiLogOut, FiMapPin, FiMenu, FiMessageSquare, FiTool, FiX } from "react-icons/fi";
import Logomark from "../components/brand/Logomark";
import { usePageTitle } from "../hooks/usePageTitle";
import { currentUser, logout, routeForUser } from "../stores/authStore";

// Builder portal shell (/builder/*). A builder is a user with role "pro".
// The portal shows that builder's own profile and aggregate referral counts,
// and nothing about any individual homeowner: no names, emails, phones,
// addresses or projects appear anywhere under this layout. That is a product
// principle from the 2026-09-24 call, not a styling choice.
//
// Gate: logged out goes to /login; a homeowner or admin goes to their own
// home (routeForUser). The server enforces the same rule in the RPCs.
//
// Messages lists the conversations homeowners opened with this builder
// (decision 2h). A builder replies there and never starts one; RLS in migration
// 0011 returns only the threads on the listing this account owns. It is also
// the only place a homeowner's message shows up, so it is in the sidebar rather
// than behind the dashboard's "Open messages" alone.
const nav = [
  { to: "/builder", label: "Dashboard", Icon: FiGrid, end: true },
  { to: "/builder/profile", label: "Profile", Icon: FiTool },
  { to: "/builder/messages", label: "Messages", Icon: FiMessageSquare },
];

const NavItem = ({ to, label, Icon, end, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
        isActive ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper hover:bg-surface-1-solid"
      }`
    }
  >
    <Icon className="text-base shrink-0" />
    <span className="flex-1">{label}</span>
  </NavLink>
);

const SidebarContents = ({ onLinkClick }) => {
  const navigate = useNavigate();
  const user = currentUser();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-7 border-b border-stroke">
        <NavLink to="/builder" onClick={onLinkClick} className="text-paper hover:text-accent transition-colors inline-block mb-3">
          <Logomark className="h-7" />
        </NavLink>
        <p className="text-paper-dim text-[0.65rem]">Builder portal</p>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {nav.map((item) => (
          <NavItem key={item.to} {...item} onClick={onLinkClick} />
        ))}
      </nav>

      {user && (
        <div className="px-3 pb-5 border-t border-stroke pt-4">
          <div className="px-4 py-3">
            <p className="text-paper text-sm font-medium truncate">{user.username}</p>
            <p className="text-paper-dim text-xs truncate">{user.email}</p>
          </div>
          {/* A builder account that also represents a government entity reaches
              that portal from here too (contract C3), as the homeowner and admin
              sidebars do. The flag comes from the server's my_government_context()
              at sign-in and is navigation only: /gov re-reads the membership
              before it shows anything. */}
          {user.gov && (
            <NavLink
              to="/gov"
              onClick={onLinkClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors"
            >
              <FiMapPin className="text-base shrink-0" />
              Government portal
            </NavLink>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors"
          >
            <FiLogOut className="text-base shrink-0" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

// Wraps the homeowner app's layout route: a builder who lands on /dashboard,
// /builders or any other homeowner route is sent to the portal instead.
// Everyone else renders the children unchanged. Lives here rather than in
// router.jsx so that module keeps exporting only the router.
export const BuilderRedirect = ({ children }) => {
  const user = currentUser();
  if (user?.role === "pro") return <Navigate to="/builder" replace />;
  return children;
};

const BuilderLayout = () => {
  usePageTitle();
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);
  const { pathname, search } = useLocation();

  const user = currentUser();
  // A signed-out builder keeps the page they asked for, the way SignedInOnly
  // does, so the message-waiting email's /builder/messages link lands there
  // after sign-in. Login passes `next` through safeNextPath.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`${pathname}${search}`)}`} replace />;
  if (user.role !== "pro") return <Navigate to={routeForUser(user)} replace />;

  return (
    <div className="theme-light min-h-screen bg-canvas">
      <div className="lg:hidden sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-stroke">
        <div className="flex items-center justify-between px-5 py-3">
          <Logomark className="h-7 text-paper" />
          <button onClick={() => setMobileOpen((v) => !v)} className="p-2 text-paper" aria-label="Toggle menu">
            {mobileOpen ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
          </button>
        </div>
      </div>

      <div className="flex">
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-stroke flex-col fixed inset-y-0 overflow-y-auto">
          <SidebarContents />
        </aside>

        {mobileOpen && (
          // T4-21 (RC4 rehearsal): above the sticky top bar (z-40), which used
          // to cover the drawer's own logo row. The backdrop still closes it,
          // including where the menu toggle sits.
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-canvas/80 backdrop-blur-sm" onClick={close} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-canvas border-r border-stroke overflow-y-auto">
              <SidebarContents onLinkClick={close} />
            </aside>
          </div>
        )}

        <main className="flex-1 lg:pl-64">
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
};

export default BuilderLayout;
