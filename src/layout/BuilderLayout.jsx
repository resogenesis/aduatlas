import { useState } from "react";
import { NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router-dom";
import { FiGrid, FiInbox, FiBriefcase, FiCreditCard, FiSettings, FiMenu, FiX, FiLogOut } from "react-icons/fi";
import Logomark from "../components/brand/Logomark";
import { currentUser, logout } from "../funnel/authStore";
import { builderStats } from "../funnel/builderStore";

const nav = [
  { to: "/builder", label: "Dashboard", Icon: FiGrid, end: true },
  { to: "/builder/leads", label: "Leads", Icon: FiInbox, badge: () => builderStats().newCount },
  { to: "/builder/profile", label: "Profile", Icon: FiBriefcase },
  { to: "/builder/billing", label: "Billing", Icon: FiCreditCard },
];

const NavItem = ({ to, label, Icon, end, badge, onClick }) => (
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
    {badge && badge() > 0 && (
      <span className="text-[0.65rem] font-semibold bg-accent text-accent-fg rounded-full px-2 py-0.5 leading-none">
        {badge()}
      </span>
    )}
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
        <p className="text-paper-dim text-[0.65rem] uppercase tracking-[0.2em]">Builder portal</p>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {nav.map((item) => (
          <NavItem key={item.to} {...item} onClick={onLinkClick} />
        ))}
        <div className="h-px bg-stroke my-3" />
        <NavItem to="/builder/settings" label="Settings" Icon={FiSettings} onClick={onLinkClick} />
      </nav>

      {user && (
        <div className="px-3 pb-5 border-t border-stroke pt-4">
          <div className="px-4 py-3">
            <p className="text-paper text-sm font-medium truncate">{user.username}</p>
            <p className="text-paper-dim text-xs truncate">{user.email}</p>
          </div>
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

const BuilderLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="lg:hidden sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-stroke">
        <div className="flex items-center justify-between px-5 py-3">
          <Logomark className="h-7 text-paper" />
          <button onClick={() => setMobileOpen((v) => !v)} className="p-2 text-paper" aria-label="Toggle menu">
            {mobileOpen ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
          </button>
        </div>
      </div>

      <div className="flex">
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-stroke flex-col fixed inset-y-0">
          <SidebarContents />
        </aside>

        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-30">
            <div className="absolute inset-0 bg-canvas/80 backdrop-blur-sm" onClick={close} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-canvas border-r border-stroke">
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
