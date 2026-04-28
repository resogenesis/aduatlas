import { Link } from "react-router-dom";
import { FiCheck } from "react-icons/fi";

import aduImage1 from "../../assets/home/choose_img1.png"
import aduImage2 from "../../assets/home/choose_img2.png"
import aduImage3 from "../../assets/home/choose_img3.png"

const prepares = [
    "ADU education and planning resources",
    "Local zoning and regulatory guidance",
    "Access to pre-filled budget and planning worksheets",
    "National ADU Readiness Score",
    "GIS feasibility study and site plan tools",
    "Match with builders familiar with your regulations",
];

const ChooseAtlas = () => {
    return (
        <section className="container mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center py-12 sm:py-16 lg:py-25">

            {/* LEFT SIDE */}
            <div className="w-full flex flex-col gap-6">
                <h3 className="text-primary font-semibold text-lg sm:text-xl">
                    ADUAtlas prepares homeowners with:
                </h3>

                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {prepares.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-secondary text-sm sm:text-base">
                            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#2F5D50] text-white flex items-center justify-center text-xs">
                                <FiCheck />
                            </span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>

                <p className="text-secondary text-sm sm:text-base leading-relaxed">
                    These tools help homeowners make informed decisions before buying, selling, or building an ADU — saving time, reducing costly mistakes, and improving overall project readiness.
                </p>

                <Link
                    to="/about"
                    className="w-fit cursor-pointer px-6 py-3 bg-[#2F5D50] rounded-md border border-[#2F5D50] text-white font-semibold text-base hover:bg-transparent hover:text-black hover:shadow-md transition-all duration-300"
                >
                    About Us
                </Link>
            </div>

            {/* RIGHT SIDE IMAGE COLLAGE */}
            <div className="relative flex items-center justify-center">

                <div className="flex gap-3 sm:gap-4 md:gap-6 items-center w-full max-w-lg lg:max-w-none mx-auto">

                    {/* LEFT LARGE IMAGE */}
                    <div className="w-1/2 aspect-[2/3] overflow-hidden rounded-tr-[40px] rounded-bl-[40px] sm:rounded-tr-[60px] sm:rounded-bl-[60px] lg:rounded-tr-[80px] lg:rounded-bl-[80px] bg-gray-300">
                        <img
                            src={aduImage1}
                            alt=""
                            className="w-full h-full object-cover"
                        />
                    </div>

                    {/* RIGHT STACKED IMAGES */}
                    <div className="flex flex-col gap-3 sm:gap-4 md:gap-6 w-1/2">

                        <div className="w-full aspect-square overflow-hidden rounded-tl-[40px] rounded-br-[40px] sm:rounded-tl-[60px] sm:rounded-br-[60px] lg:rounded-tl-[80px] lg:rounded-br-[80px] bg-gray-300">
                            <img
                                src={aduImage2}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="w-full aspect-square overflow-hidden rounded-tr-[40px] rounded-bl-[40px] sm:rounded-tr-[60px] sm:rounded-bl-[60px] lg:rounded-tr-[80px] lg:rounded-bl-[80px] bg-gray-300">
                            <img
                                src={aduImage3}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        </div>

                    </div>

                </div>

                {/* CENTER BADGE — spinning circular text */}
                <div className="absolute w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:size-47.5 animate-[spin_30s_linear_infinite]">
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                        <circle cx="100" cy="100" r="100" fill="#2F5D50" />
                        <defs>
                            <path id="circlePath" d="M100,100 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" />
                        </defs>
                        <text fill="white" fontSize="14" fontFamily="'Poppins', 'Quicksand', sans-serif" fontWeight="400" letterSpacing="6">
                            <textPath href="#circlePath" startOffset="0%">
                                START YOUR ADU JOURNEY HERE &#x2022;
                            </textPath>
                        </text>
                        {/* Center arrow — diagonal upper-right like original */}
                        <g transform="translate(100,100)">
                            <line x1="-12" y1="12" x2="12" y2="-12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                            <polyline points="2,-12 12,-12 12,-2" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                    </svg>
                </div>

            </div>

        </section>
    );
};

export default ChooseAtlas;
