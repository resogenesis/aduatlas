import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { captureLead } from "../../lib/supabase";
import { FaXTwitter, FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import Logomark from "../brand/Logomark";

const sections = [
  {
    title: "Product",
    links: [
      { name: "Property Check", path: "/property" },
      { name: "How It Works", path: "/how-to-adu" },
      { name: "Course", path: "/course-outline" },
      { name: "Plans & Pricing", path: "/unlock" },
      { name: "For Builders", path: "/for-builders" },
    ],
  },
  {
    title: "Resources",
    links: [
      { name: "ADU Types", path: "/adu-types" },
      { name: "FAQ", path: "/faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "About", path: "/about" },
      { name: "Methodology", path: "/methodology" },
      { name: "Privacy & Terms", path: "/legal" },
    ],
  },
];

// Email capture for launch updates; writes to the leads table via the same
// RPC the pricing page uses (source "footer").
const Updates = () => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | saving | done | error
  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState("error");
      return;
    }
    setState("saving");
    const r = await captureLead({ email, source: "footer" });
    setState(r && r.ok === false && r.error !== "supabase-disabled" ? "error" : "done");
  };
  if (state === "done")
    return (
      <p className="inline-flex items-center gap-2 text-sm text-paper">
        <FiCheck className="text-accent" /> You're on the list.
      </p>
    );
  return (
    <form onSubmit={submit} className="flex gap-2 max-w-sm">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        aria-label="Email for ADU updates"
        aria-invalid={state === "error"}
        className="flex-1 min-w-0 px-4 py-2.5 bg-canvas border border-stroke rounded-xl text-paper text-sm placeholder:text-paper-dim/60 focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button type="submit" disabled={state === "saving"} className="press px-4 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim disabled:opacity-60" aria-label="Subscribe">
        <FiArrowRight />
      </button>
    </form>
  );
};

const Footer = () => (
  <footer className="bg-surface-1-solid border-t border-stroke pt-16 pb-8">
    <div className="container mx-auto px-5 sm:px-8">
      <div className="grid grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12 mb-14">
        <div className="col-span-2 lg:col-span-5">
          <Link to="/" className="text-paper inline-block mb-5" aria-label="ADUAtlas home">
            <Logomark className="h-9" />
          </Link>
          <p className="text-paper-dim text-sm leading-relaxed max-w-sm mb-6">
            Understand what can be built on your property, learn the process, and connect with the right builders before you commit.
          </p>
          <p className="text-paper text-sm font-semibold mb-2">ADU rules, costs, and tips, once a month.</p>
          <div className="mb-6">
            <Updates />
          </div>
          <div className="flex gap-2">
            {[
              { Icon: FaXTwitter, label: "X" },
              { Icon: FaInstagram, label: "Instagram" },
              { Icon: FaLinkedinIn, label: "LinkedIn" },
            ].map(({ Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="w-9 h-9 flex items-center justify-center rounded-full border border-stroke text-paper-dim hover:text-accent-fg hover:bg-accent hover:border-accent transition-colors"
              >
                <Icon size={14} />
              </a>
            ))}
          </div>
        </div>

        {sections.map((section) => (
          <div key={section.title} className="col-span-1 lg:col-span-2">
            <h3 className="text-paper text-xs font-semibold mb-4">{section.title}</h3>
            <ul className="space-y-2.5">
              {section.links.map((link) => (
                <li key={link.name}>
                  <Link to={link.path} className="text-paper-dim text-sm hover:text-paper transition-colors">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-stroke pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
        <p className="text-paper-dim text-xs">© 2026 ADUAtlas. All rights reserved.</p>
        <p className="text-paper-dim text-xs">Requirements vary by jurisdiction and property. Verify with your local planning department.</p>
      </div>
    </div>
  </footer>
);

export default Footer;
