import { Fragment, useState } from "react";
import { NavLink, Outlet, ScrollRestoration, Link } from "react-router-dom";
import { FiGrid, FiUser, FiCreditCard, FiBookmark, FiHelpCircle, FiLogOut, FiMenu, FiX, FiSettings } from "react-icons/fi";
import Logo from "../components/common/Logo";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: FiGrid, end: true },
  { to: "/dashboard/profile", label: "Profile", icon: FiUser },
  { to: "/dashboard/billing", label: "Billing", icon: FiCreditCard },
  { to: "/dashboard/bookmarks", label: "Bookmarks", icon: FiBookmark },
  { to: "/dashboard/manage-builds", label: "Manage Builds", icon: FiSettings },
  { to: "/dashboard/help", label: "Help Centre", icon: FiHelpCircle },
];

const DashboardLayout = () => {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <div className="min-h-screen bg-[#F4F7F6] flex">
        <aside className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-gray-200 z-40 transform transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <Logo />
            <button className="lg:hidden" onClick={() => setOpen(false)}><FiX /></button>
          </div>

          <div className="p-4 flex items-center gap-3 border-b border-gray-100">
            <div className="w-10 h-10 rounded-full bg-[#2F5D50] text-white flex items-center justify-center font-semibold">J</div>
            <div>
              <p className="text-sm font-semibold text-primary">Jonny</p>
              <p className="text-xs text-gray-500">jonny@gmail.com</p>
            </div>
          </div>

          <nav className="p-3 flex flex-col gap-1">
            {navItems.map((it) => {
              const Icon = it.icon;
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition ${isActive ? "bg-[#2F5D50] text-white" : "text-gray-700 hover:bg-[#F4F7F6]"}`
                  }
                >
                  <Icon /> {it.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="absolute bottom-4 left-4 right-4">
            <Link to="/" className="flex items-center gap-3 px-4 py-2.5 rounded-md text-sm text-gray-700 hover:bg-[#F4F7F6]">
              <FiLogOut /> Log out
            </Link>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 bg-white border-b border-gray-200 z-30 lg:hidden flex items-center justify-between px-4 py-3">
            <button onClick={() => setOpen(true)}><FiMenu className="text-xl" /></button>
            <Logo />
            <div className="w-6" />
          </header>
          <main className="p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <ScrollRestoration />
    </Fragment>
  );
};

export default DashboardLayout;
