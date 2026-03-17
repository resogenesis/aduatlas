import { Link } from "react-router-dom";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaPinterestP } from "react-icons/fa";

// Note: local import
import footer_logo from "../../assets/footer_logo.svg"

// Note: dummy data
const footerLinks = [
    {
        title: "Resources",
        links: [
            { name: "City & State Regulations", path: "#" },
            { name: "Feasibility Study", path: "#" },
            { name: "Pre-site Estimate Worksheet", path: "#" },
        ],
    },
    {
        title: "Associations",
        links: [
            { name: "ADUCali", path: "#" },
            { name: "ADUTexas", path: "#" },
            { name: "ADUMissouri", path: "#" },
            { name: "ADUDoval", path: "#" },
            { name: "Click for more", path: "#" },
        ],
    },
    {
        title: "Legal",
        links: [
            { name: "Privacy Policy", path: "#" },
            { name: "Terms of Service", path: "#" },
            { name: "Cookie Policy", path: "#" },
        ],
    },
];

const Footer = () => {
    return (
        <footer className="bg-[#171B26] text-gray-300 pt-10 sm:pt-16 pb-6">
            <div className="container mx-auto px-4 sm:px-6">

                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-12">

                    {/* logo section */}
                    <div className="col-span-2 md:col-span-2 lg:col-span-2">

                        <div className="mb-4 w-40 sm:w-57">
                            <img src={footer_logo} alt="ADUAtlas.com" className="w-full h-full object-contain" />
                        </div>

                        <p className="text-sm leading-relaxed mb-6 text-white">
                            Simplifying ADU regulations and connecting homeowners
                            with trusted professionals.
                        </p>

                        <h4 className="text-white font-medium mb-3 text-lg sm:text-2xl">
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
                            <h3 className="text-white text-lg sm:text-xl lg:text-2xl font-semibold mb-3 sm:mb-4">
                                {section?.title || "N/F"}
                            </h3>

                            <ul className="space-y-2 sm:space-y-3 text-sm text-white">
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