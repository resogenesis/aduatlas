import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";

const navLinks = [
  { name: "Home", path: "#" },
  { name: "About", path: "#" },
  { name: "How To", path: "#" },
  { name: "ADU FAQ", path: "#" },
  { name: "ADU Types", path: "#" },
  { name: "Video", path: "#" },
  { name: "Choose Your State", path: "#" },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full sticky top-0 bg-white z-50 shadow-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-2 lg:py-4">
        {/* Logo */}
        <Logo />

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              className="text-sm font-medium text-gray-700 hover:text-[#2F5D50] transition"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            to="#"
            className="px-5 py-2 rounded-md border border-[#2F5D50] text-[#2F5D50] font-semibold text-sm hover:bg-[#2F5D50] hover:text-white transition"
          >
            Sign Up
          </Link>
          <Link
            to="#"
            className="px-5 py-2 rounded-md bg-[#2F5D50] text-white font-semibold text-sm hover:bg-[#244A40] transition"
          >
            Log In
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <button
          className="lg:hidden flex flex-col gap-1.5 cursor-pointer p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span
            className={`block w-6 h-0.5 bg-gray-800 transition-transform duration-300 ${
              mobileOpen ? "rotate-45 translate-y-2" : ""
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-gray-800 transition-opacity duration-300 ${
              mobileOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-gray-800 transition-transform duration-300 ${
              mobileOpen ? "-rotate-45 -translate-y-2" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 shadow-lg">
          <nav className="flex flex-col px-6 py-4 gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className="text-sm font-medium text-gray-700 hover:text-[#2F5D50] py-2 transition"
                onClick={() => setMobileOpen(false)}
              >
                {link.name}
              </Link>
            ))}
            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100">
              <Link
                to="#"
                className="px-5 py-2.5 rounded-md border border-[#2F5D50] text-[#2F5D50] font-semibold text-sm text-center hover:bg-[#2F5D50] hover:text-white transition"
                onClick={() => setMobileOpen(false)}
              >
                Sign Up
              </Link>
              <Link
                to="#"
                className="px-5 py-2.5 rounded-md bg-[#2F5D50] text-white font-semibold text-sm text-center hover:bg-[#244A40] transition"
                onClick={() => setMobileOpen(false)}
              >
                Log In
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
