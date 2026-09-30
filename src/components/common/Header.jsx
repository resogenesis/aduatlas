import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { FiChevronDown, FiMenu, FiX } from "react-icons/fi";
import Logomark from "../brand/Logomark";
import { PARTNER_ENTRY_PATH, currentUser, hasPendingPartnerEntry, logout, portalForUser } from "../../stores/authStore";

// Public nav: Home, How It Works, Course, Pricing, For Builders, Resources. See Packages is the
// primary action. Builders live in the portal (Builders tab); About is in the
// footer only.
const navLinks = [
  { name: "Home", path: "/" },
  { name: "How It Works", path: "/how-to-adu" },
  { name: "Course", path: "/course-outline" },
  { name: "Plans & Pricing", path: "/unlock" },
  { name: "For Builders", path: "/for-builders" },
];

// ADU Rules and Resources leads the Resources menu: it is the nationwide
// regulatory record (Phase 1 spec, decision 2l) and the thing the marketing
// copy means when it promises "state and city resources", so it belongs in
// front of the explainers rather than behind them.
const resources = [
  { name: "ADU Rules & Resources", path: "/rules" },
  { name: "ADU Types", path: "/adu-types" },
  { name: "FAQ", path: "/faq" },
];

// T4-04 (RC4 rehearsal): the header reads the session mirror and the remembered
// sponsored entry when it renders, and nothing else re-renders it while the route
// stays the same. A page that changes either of them in place (the partner entry,
// once the server has answered) dispatches this event on window, and the header
// renders again through the same counter Log out bumps.
export const HEADER_REFRESH_EVENT = "aduatlas:header-refresh";

const linkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors ${isActive ? "text-paper" : "text-paper-dim hover:text-paper"}`;

const ResourcesMenu = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1 text-sm font-medium text-paper-dim hover:text-paper transition-colors"
      >
        Resources <FiChevronDown className={`text-xs transition-transform ${open ?"rotate-180":""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-3 w-60 bg-canvas border border-stroke rounded-xl shadow-[0_20px_40px_-20px_rgba(23,32,27,0.35)] p-2 z-50">
          {resources.map((r) => (
            <Link key={r.path} to={r.path} role="menuitem" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors">
              {r.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// Two kinds of account need one more link than the row has room for between
// 1024 and 1280 px, where the nav leaves almost nothing spare:
//   - an account with two portals (an admin or builder account that also holds
//     a government membership) needs the government portal;
//   - an account with no portal (no plan, including a customer whose refund was
//     processed) needs its account page, /settings, which is where the reply to
//     a refund request appears. Without it such a person landed on /unlock with
//     only See Packages and Log out, and nothing pointed to that reply.
// There it gets this menu in place of the Log out button, holding the account,
// the extra link and Log out. From 1280 px the link sits in the row, and the
// phone menu always lists it.
const AccountMenu = ({ account, links, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Signed in as ${account}`}
        className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl border border-stroke text-sm font-semibold text-paper hover:bg-surface-1-solid transition-colors whitespace-nowrap"
      >
        Account <FiChevronDown className={`text-xs transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-3 w-64 bg-canvas border border-stroke rounded-xl shadow-[0_20px_40px_-20px_rgba(23,32,27,0.35)] p-2 z-50">
          <p className="px-3 py-2 text-paper-dim text-xs break-all">
            Signed in as <span className="text-paper">{account}</span>
          </p>
          {links.map((l) => (
            <Link key={l.to} to={l.to} role="menuitem" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors">
              {l.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full text-left px-3 py-2 rounded-lg text-sm text-paper-dim hover:text-paper hover:bg-surface-1-solid transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

// SIGNED IN OR NOT. The header used to render the anonymous actions for
// everybody, so a signed-in homeowner, resident or government user on a public
// page was still offered "Sign In" and had no way to log out from where they
// landed. It now reads the same session mirror every layout reads (the server
// hydrates it before first paint) and shows the account, the way into the
// person's own portal, and Log out. What a person may DO is still decided by the
// server and the database; this only decides which links to show.
const Header = () => {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Bumped on Log out so the header re-renders at once, even when the
  // navigation that follows lands on the page already open, and on
  // HEADER_REFRESH_EVENT (T4-04: a sponsored entry redeemed or cleared in place).
  const [, setSignedOut] = useState(0);
  useEffect(() => {
    const rerender = () => setSignedOut((n) => n + 1);
    window.addEventListener(HEADER_REFRESH_EVENT, rerender);
    return () => window.removeEventListener(HEADER_REFRESH_EVENT, rerender);
  }, []);
  const user = currentUser();
  const portal = portalForUser(user);
  const account = user ? user.email || user.username || "your account" : "";
  // A signed-in resident with no plan who started sponsored access in this browser
  // (the email confirmation round trip signs them in on the home page, not on
  // the entry) is pointed back to it rather than to the $79 plans. Remembering
  // the link grants nothing; the server decides on /partner.
  const primary = portal
    ? portal
    : user && hasPendingPartnerEntry()
      ? { to: PARTNER_ENTRY_PATH, label: "Finish sponsored access" }
      : { to: "/unlock", label: "See Packages" };
  // An admin or builder account that also holds a government membership has two
  // portals; the header names the first (routeForUser order) and links the other.
  const govToo = Boolean(user?.gov) && portal?.to !== "/gov";
  // A signed-in account with no portal has no sidebar with "Account settings"
  // in it, so the header links its account page. That is where a customer whose
  // refund was processed (and who therefore holds no plan and lands on /unlock)
  // reads ADUAtlas's reply. /settings is open to any signed-in account; what it
  // shows is decided by the server's billing facts.
  const accountLink = Boolean(user) && !portal;
  const rowMenuLinks = govToo
    ? [{ to: "/gov", label: "Government portal" }]
    : accountLink
      ? [{ to: "/settings", label: "Your account" }]
      : null;
  const handleLogout = async () => {
    setMobileOpen(false);
    await logout();
    setSignedOut((n) => n + 1);
    navigate("/", { replace: true });
  };
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const close = () => setMobileOpen(false);

  return (
    <header data-scrolled={scrolled} className="hdr w-full sticky top-0 z-50 bg-canvas/90 backdrop-blur-md border-b border-stroke">
      <div className="container mx-auto px-5 sm:px-8 flex items-center justify-between py-3 lg:py-3.5">
        <Link to="/" className="text-paper hover:opacity-80 transition-opacity" aria-label="ADUAtlas home">
          <Logomark className="h-9" />
        </Link>

        {/* gap-4 below 1280 px. At 1024 px a signed-in row had between 0 and
            35 px spare: with "Finish sponsored access" three nav links already
            wrapped onto two lines, and the account menu below needs about
            20 px more than the Log out button it replaces. */}
        <nav className="hidden lg:flex items-center gap-4 xl:gap-8" aria-label="Primary">
          {navLinks.map((link) => (
            <NavLink key={link.path} to={link.path} end={link.path === "/"} className={linkClass}>
              {link.name}
            </NavLink>
          ))}
          <ResourcesMenu />
        </nav>

        {user ? (
          <div className="hidden lg:flex items-center gap-3 shrink-0" data-header-account="signed-in">
            {/* From 1280 px. Between 1024 and 1280 the nav leaves no room for it
                (a government user's header ran 19 px past a 1024 px screen), so
                there the account rides on the Log out button's tooltip, or in
                the Account menu. Narrower beside the Account link, which needs
                the room: with a long address and "Finish sponsored access" the
                row had 7 px spare. */}
            <span className={`hidden xl:inline-block text-paper-dim text-xs ${accountLink ? "max-w-[8rem]" : "max-w-[12rem]"} truncate`} title={account}>
              Signed in as <span className="text-paper">{account}</span>
            </span>
            {/* A second portal, or the account page of an account with no
                portal: in the row from 1280 px, and in the Account menu, which
                takes the Log out button's place, below that. */}
            {govToo && (
              <Link to="/gov" className="hidden xl:inline-block text-sm font-medium text-paper-dim hover:text-paper transition-colors whitespace-nowrap">
                Government portal
              </Link>
            )}
            {accountLink && (
              <Link to="/settings" title={`Your account: ${account}`} className="hidden xl:inline-block text-sm font-medium text-paper-dim hover:text-paper transition-colors whitespace-nowrap">
                Account
              </Link>
            )}
            {rowMenuLinks && (
              <div className="xl:hidden">
                <AccountMenu account={account} links={rowMenuLinks} onLogout={handleLogout} />
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              title={`Signed in as ${account}`}
              className={`${rowMenuLinks ? "hidden xl:inline-block " : ""}px-4 py-2.5 rounded-xl border border-stroke text-sm font-semibold text-paper hover:bg-surface-1-solid transition-colors whitespace-nowrap`}
            >
              Log out
            </button>
            <Link to={primary.to} className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors whitespace-nowrap">
              {primary.label}
            </Link>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-3" data-header-account="signed-out">
            <Link to="/login" className="px-4 py-2.5 rounded-xl border border-stroke text-sm font-semibold text-paper hover:bg-surface-1-solid transition-colors">
              Sign In
            </Link>
            <Link to="/unlock" className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors">
              See Packages
            </Link>
          </div>
        )}

        <button className="lg:hidden p-2 text-paper" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu" aria-expanded={mobileOpen}>
          {mobileOpen ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-canvas border-t border-stroke">
          <nav className="flex flex-col px-5 py-4 gap-1" aria-label="Mobile">
            {navLinks.map((link) => (
              <Link key={link.path} to={link.path} className="text-paper text-base font-medium py-3" onClick={close}>
                {link.name}
              </Link>
            ))}
            <p className="text-paper-dim text-[0.65rem] font-semibold pt-4 pb-1">Resources</p>
            {resources.map((r) => (
              <Link key={r.path} to={r.path} className="text-paper-dim text-sm py-2" onClick={close}>
                {r.name}
              </Link>
            ))}
            {user ? (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-stroke" data-header-account="signed-in">
                <p className="text-paper-dim text-xs break-all">
                  Signed in as <span className="text-paper">{account}</span>
                </p>
                <Link to={primary.to} className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm text-center" onClick={close}>
                  {primary.label}
                </Link>
                {govToo && (
                  <Link to="/gov" className="px-5 py-3 rounded-xl border border-stroke text-paper font-semibold text-sm text-center" onClick={close}>
                    Government portal
                  </Link>
                )}
                {accountLink && (
                  <Link to="/settings" className="px-5 py-3 rounded-xl border border-stroke text-paper font-semibold text-sm text-center" onClick={close}>
                    Account
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-5 py-3 rounded-xl border border-stroke text-paper font-semibold text-sm text-center"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-stroke" data-header-account="signed-out">
                <Link to="/login" className="px-5 py-3 rounded-xl border border-stroke text-paper font-semibold text-sm text-center" onClick={close}>
                  Sign In
                </Link>
                <Link to="/unlock" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm text-center" onClick={close}>
                  See Packages
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
