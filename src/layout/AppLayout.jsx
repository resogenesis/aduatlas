import { useState } from "react";
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { FiGrid, FiBookOpen, FiHome, FiUsers, FiHelpCircle, FiSettings, FiMenu, FiX, FiLogOut, FiMapPin, FiMessageSquare } from "react-icons/fi";
import Logomark from "../components/brand/Logomark";
import { usePageTitle } from "../hooks/usePageTitle";
import { currentUser, logout } from "../stores/authStore";

// The homeowner portal has five destinations (Phase 1 spec, section 4, locked
// 2026-09-25): Overview, My Course, My Property and Site Plan, Builders, Help.
//
// This is a navigation change, not a rebuild. Every property page keeps its
// route and its tier gate; they are reached from the sub navigation inside My
// Property and Site Plan, and this sidebar highlights that destination while
// the homeowner is on any of them. Concierge support keeps its route too and
// is reached from Help, so Help highlights on /support as well.
//
// The `also` list below and the sub navigation in src/pages/app/MyProperty.jsx
// are one set: a path that highlights this destination has to be reachable
// from that sub navigation, with the same tier lock the router applies.
const NAV = [
  { to: "/dashboard", label: "Overview", Icon: FiGrid },
  { to: "/course", label: "My Course", Icon: FiBookOpen },
  {
    to: "/my-property",
    label: "My Property and Site Plan",
    Icon: FiHome,
    // Pages that live under this destination without sharing its path.
    also: ["/study", "/site-plan", "/costs", "/adu-options", "/feasibility", "/utility-estimator", "/report", "/packet"],
  },
  { to: "/builders", label: "Builders", Icon: FiUsers },
  // Concierge support is reached from Help and keeps this entry highlighted.
  { to: "/help", label: "Help", Icon: FiHelpCircle, also: ["/support"] },
];

const under = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

const NavItem = ({ to, label, Icon, also = [], onClick }) => {
  const { pathname } = useLocation();
  const alsoActive = also.some((p) => under(pathname, p));
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
          isActive || alsoActive
            ? "bg-accent text-accent-fg"
            : "text-paper-dim hover:text-paper hover:bg-surface-1-solid"
        }`
      }
    >
      <Icon className="text-base shrink-0" />
      <span className="flex-1">{label}</span>
    </NavLink>
  );
};

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
        <NavLink to="/dashboard" onClick={onLinkClick} className="text-paper hover:text-accent transition-colors inline-block">
          <Logomark className="h-7" />
        </NavLink>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1" aria-label="Portal">
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} onClick={onLinkClick} />
        ))}
      </nav>

      {user && (
        <div className="px-3 pb-5 border-t border-stroke pt-4">
          <div className="px-4 py-3">
            <p className="text-paper text-sm font-medium truncate">{user.username}</p>
            <p className="text-paper-dim text-xs truncate">{user.email}</p>
          </div>
          {/* A homeowner who also represents a government entity reaches that
              portal from here (contract C3). The flag comes from the server's
              my_government_context() at sign-in and is navigation only: /gov
              re-reads the membership before it shows anything. */}
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
          {/* Messages with builders (decision 2h). Not a sixth destination (the
              five in section 4 are locked); it sits with the account, like
              Account settings, because the threads are this account's own. It
              is shown at every plan: /messages is open to any signed-in
              homeowner, and the database decides who may start a thread. A
              builder's reply is read on that page, and before this link
              nothing in the portal led back to it. */}
          <NavLink
            to="/messages"
            onClick={onLinkClick}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper hover:bg-surface-1-solid"
              }`
            }
          >
            <FiMessageSquare className="text-base shrink-0" />
            Messages
          </NavLink>
          {/* Account settings is not a destination; it sits with the account. */}
          <NavLink
            to="/settings"
            onClick={onLinkClick}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? "bg-accent text-accent-fg" : "text-paper-dim hover:text-paper hover:bg-surface-1-solid"
              }`
            }
          >
            <FiSettings className="text-base shrink-0" />
            Account settings
          </NavLink>
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

const AppLayout = () => {
  usePageTitle();
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <div className="theme-light min-h-screen bg-canvas">
      {/* Mobile top bar */}
      <div className="lg:hidden print:hidden sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-stroke">
        <div className="flex items-center justify-between px-5 py-3">
          <Logomark className="h-7 text-paper" />
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-paper"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-stroke flex-col fixed inset-y-0 overflow-y-auto">
          <SidebarContents />
        </aside>

        {/* Mobile drawer. Both sidebars scroll: with Messages, and the
            Government portal for a homeowner who holds a membership, the list
            is taller than a small phone (Log out ended below a 320 x 568
            screen) or a short desktop window. */}
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

        {/* min-w-0: a flex item defaults to its min-content width, so the course
            index, the worksheets and the utility estimator used to lay out wider
            than a phone and were cut off (index.css). */}
        <main className="flex-1 min-w-0 lg:pl-64">
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
};

export default AppLayout;
