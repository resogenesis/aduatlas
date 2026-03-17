import { Link } from "react-router-dom";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaPinterestP } from "react-icons/fa";

// Note: local import
import footer_logo from "../../assets/footer_logo.svg"

// Note: dummy data
const footerLinks = [
    {
        title: "Product",
        links: [
            { name: "How It Works", path: "/how-it-works" },
            { name: "Pricing", path: "/pricing" },
            { name: "ADU Rule", path: "/adu-rule" },
            { name: "ADU Types", path: "/adu-types" },
        ],
    },
    {
        title: "Resources",
        links: [
            { name: "Learning Hub", path: "/learning-hub" },
            { name: "About Us", path: "/about" },
            { name: "Contact", path: "/contact" },
            { name: "For Builders", path: "/builders" },
            { name: "For Supplier", path: "/suppliers" },
        ],
    },
    {
        title: "Legal",
        links: [
            { name: "Privacy Policy", path: "/privacy-policy" },
            { name: "Terms of Service", path: "/terms" },
            { name: "Cookie Policy", path: "/cookie-policy" },
        ],
    },
];

const Footer = () => {
    return (
        <footer className="bg-[#171B26] text-gray-300 pt-16 pb-6">
            <div className="container mx-auto px-6">

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">

                    {/* logo section */}
                    <div>

                        <div className="mb-4 w-57">
                            <img src={footer_logo}
                                alt="Footer logo"
                                className="w-full h-full object-contain"
                            />
                        </div>

                        <p className="text-sm leading-relaxed mb-6 text-white">
                            Simplifying ADU regulations and connecting homeowners
                            with trusted professionals.
                        </p>

                        <h4 className="text-white font-medium mb-3 text-2xl">
                            Follow Us
                        </h4>

                        {/* icons */}
                        <div className="flex gap-3">
                            {[FaFacebookF, FaTwitter, FaLinkedinIn, FaPinterestP].map(
                                (Icon, idx) => (
                                    <div
                                        key={idx}
                                        className="w-9 h-9 flex items-center justify-center border border-gray-500 rounded-md hover:bg-white hover:text-black transition cursor-pointer"
                                    >
                                        <Icon size={14} />
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* dynamic footer columns */}
                    {footerLinks?.map((section, i) => (
                        <div key={i}>
                            <h3 className="text-white text-2xl font-semibold mb-4">
                                {section?.title || "N/F"}
                            </h3>

                            <ul className="space-y-3 text-sm text-white">
                                {section?.links?.map((link, index) => (
                                    <li key={index}>
                                        <Link
                                            to={link.path}
                                            className="hover:text-gray-300 transition"
                                        >
                                            {link.name || "N/F"}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                </div>

                {/* divider */}
                <div className="border-t border-gray-600 mt-12 pt-6 text-center text-sm text-gray-400">
                    © 2026 ADUAtlas. All rights reserved.
                </div>

            </div>
        </footer>
    );
};

export default Footer;