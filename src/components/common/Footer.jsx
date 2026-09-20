import { Link } from "react-router-dom";
import { FaXTwitter, FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import Logomark from "../brand/Logomark";

const sections = [
  {
    title: "Product",
    links: [
      { name: "Property Check", path: "/property" },
      { name: "How It Works", path: "/how-to-adu" },
      { name: "Plans & Pricing", path: "/unlock" },
      { name: "Find a Builder", path: "/builders" },
    ],
  },
  {
    title: "Resources",
    links: [
      { name: "How to ADU", path: "/how-to-adu" },
      { name: "ADU Types", path: "/adu-types" },
      { name: "Course Outline", path: "/course-outline" },
      { name: "Videos", path: "/videos" },
      { name: "By State", path: "/choose-your-state" },
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
            <h3 className="text-paper text-xs font-semibold tracking-[0.2em] mb-4">{section.title}</h3>
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
