import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { FiChevronDown, FiMenu, FiSearch, FiX } from "react-icons/fi";
import Logomark from "../brand/Logomark";

const navLinks = [
  { name: "How It Works", path: "/how-to-adu" },
  { name: "Plans & Pricing", path: "/unlock" },
  { name: "Find a Builder", path: "/builders" },
  { name: "About", path: "/about" },
];

const resources = [
  { name: "How to ADU", path: "/how-to-adu" },
  { name: "ADU Types", path: "/adu-types" },
  { name: "Course Outline", path: "/course-outline" },
  { name: "Videos", path: "/videos" },
  { name: "By State", path: "/choose-your-state" },
  { name: "FAQ", path: "/faq" },
];

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
        <div role="menu" className="absolute left-0 top-full mt-3 w-52 bg-canvas border border-stroke rounded-xl shadow-[0_20px_40px_-20px_rgba(23,32,27,0.35)] p-2 z-50">
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

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  return (
    <header className="w-full sticky top-0 z-50 bg-canvas/90 backdrop-blur-md border-b border-stroke">
      <div className="container mx-auto px-5 sm:px-8 flex items-center justify-between py-3 lg:py-3.5">
        <Link to="/" className="text-paper hover:opacity-80 transition-opacity" aria-label="ADUAtlas home">
          <Logomark className="h-9" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8" aria-label="Primary">
          {navLinks.slice(0, 3).map((link) => (
            <NavLink key={link.path} to={link.path} className={linkClass}>
              {link.name}
            </NavLink>
          ))}
          <ResourcesMenu />
          <NavLink to="/about" className={linkClass}>
            About
          </NavLink>
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <Link to="/property" className="p-2 text-paper-dim hover:text-paper transition-colors" aria-label="Check a property address">
            <FiSearch className="text-lg" />
          </Link>
          <Link to="/login" className="px-4 py-2.5 rounded-xl border border-stroke text-sm font-semibold text-paper hover:bg-surface-1-solid transition-colors">
            Sign In
          </Link>
          <Link to="/signup" className="px-5 py-2.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors">
            Get Started
          </Link>
        </div>

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
            <p className="text-paper-dim text-[0.65rem] font-semibold tracking-[0.24em] pt-4 pb-1">Resources</p>
            {resources.map((r) => (
              <Link key={r.path} to={r.path} className="text-paper-dim text-sm py-2" onClick={close}>
                {r.name}
              </Link>
            ))}
            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-stroke">
              <Link to="/login" className="px-5 py-3 rounded-xl border border-stroke text-paper font-semibold text-sm text-center" onClick={close}>
                Sign In
              </Link>
              <Link to="/signup" className="px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold text-sm text-center" onClick={close}>
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
