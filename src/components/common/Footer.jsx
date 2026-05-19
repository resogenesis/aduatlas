import { Link } from "react-router-dom";
import { FaXTwitter, FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import Logomark from "../brand/Logomark";

const sections = [
    {
        title: "Funnel",
        links: [
            { name: "Reality Check", path: "/quiz" },
            { name: "Unlock Plan", path: "/unlock" },
            { name: "About", path: "/about" },
        ],
    },
    {
        title: "Resources",
        links: [
            { name: "How to ADU", path: "/how-to-adu" },
            { name: "ADU Types", path: "/adu-types" },
            { name: "FAQ", path: "/faq" },
            { name: "By State", path: "/choose-your-state" },
        ],
    },
    {
        title: "Trust",
        links: [
            { name: "Methodology", path: "/methodology" },
            { name: "Sample Report", path: "/report/sample" },
            { name: "Refund Policy", path: "#" },
            { name: "Privacy & Terms", path: "#" },
        ],
    },
];

const Footer = () => {
    return (
        <footer className="bg-canvas border-t border-stroke pt-20 pb-10">
            <div className="container mx-auto px-5 sm:px-8">

                <div className="grid grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12 mb-16">

                    <div className="col-span-2 lg:col-span-5">
                        <Link to="/" className="text-paper hover:text-accent transition-colors inline-block mb-5">
                            <Logomark className="h-8" />
                        </Link>
                        <p className="text-paper-dim text-sm leading-relaxed max-w-sm mb-7">
                            ADU Pre Construction Preparation for Homeowners. Know your options before you call a single contractor.
                        </p>
                        <div className="flex gap-2">
                            {[FaXTwitter, FaInstagram, FaLinkedinIn].map((Icon, idx) => (
                                <a
                                    key={idx}
                                    href="#"
                                    className="w-9 h-9 flex items-center justify-center rounded-full border border-stroke text-paper-dim hover:text-accent-fg hover:bg-accent hover:border-accent transition-colors"
                                >
                                    <Icon size={14} />
                                </a>
                            ))}
                        </div>
                    </div>

                    {sections.map((section) => (
                        <div key={section.title} className="col-span-1 lg:col-span-2 lg:col-start-auto">
                            <h3 className="text-paper text-xs font-medium tracking-[0.2em] uppercase mb-4">
                                {section.title}
                            </h3>
                            <ul className="space-y-3">
                                {section.links.map((link) => (
                                    <li key={link.name}>
                                        <Link
                                            to={link.path}
                                            className="text-paper-dim text-sm hover:text-paper transition-colors"
                                        >
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
                    <p className="text-paper-dim text-xs">Built for homeowners who refuse to guess.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
