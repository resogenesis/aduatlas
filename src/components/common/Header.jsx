import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { FiMenu, FiX } from "react-icons/fi";
import Logomark from "../brand/Logomark";

const navLinks = [
  { name: "How it works", path: "/#how" },
  { name: "Reality Check", path: "/quiz" },
  { name: "Pricing", path: "/unlock" },
  { name: "FAQ", path: "/faq" },
  { name: "About", path: "/about" },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full sticky top-0 z-50 bg-canvas/85 backdrop-blur-md border-b border-stroke">
      <div className="container mx-auto px-5 sm:px-8 flex items-center justify-between py-3 lg:py-4">
        <Link to="/" className="text-paper hover:text-accent transition-colors">
          <Logomark className="h-7" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <NavLink
              key={link.name}
              to={link.path}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? "text-paper" : "text-paper-dim hover:text-paper"}`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-medium text-paper-dim hover:text-paper transition-colors"
          >
            Log in
          </Link>
          <Link
            to="/quiz"
            className="px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
          >
            Start Free
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden p-2 text-paper"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-canvas border-t border-stroke">
          <nav className="flex flex-col px-5 py-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className="text-paper text-base font-medium py-3"
                onClick={() => setMobileOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-stroke">
              <Link
                to="/login"
                className="text-paper-dim text-sm py-2"
                onClick={() => setMobileOpen(false)}
              >
                Log in
              </Link>
              <Link
                to="/quiz"
                className="px-5 py-3 rounded-full bg-accent text-accent-fg font-semibold text-sm text-center"
                onClick={() => setMobileOpen(false)}
              >
                Start Free
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
