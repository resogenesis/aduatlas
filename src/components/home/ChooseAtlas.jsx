import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

import aduImage1 from "../../assets/home/choose_img1.png"
import aduImage2 from "../../assets/home/choose_img2.png"
import aduImage3 from "../../assets/home/choose_img3.png"

const ChooseAtlas = () => {
    return (
        <section className="relative overflow-hidden bg-[#F4F7F6] py-16 sm:py-20 lg:py-24">

            {/* Decorative blurred shape */}
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-[#2F5D50]/10 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-[#2F5D50]/10 blur-3xl" />

            <div className="container relative mx-auto px-4 sm:px-6">

                <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
                    <p className="text-[#2F5D50] font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3">
                        START YOUR ADU JOURNEY
                    </p>
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-primary mb-4">
                        From Concept to Completion
                    </h2>
                    <p className="text-secondary text-sm sm:text-base leading-relaxed">
                        Turn your ADU vision into reality with ADUAtlas.
                    </p>
                </div>

                <div className="relative flex items-center justify-center mb-10 sm:mb-12">

                    <div className="flex gap-3 sm:gap-4 md:gap-6 items-center w-full max-w-xl mx-auto">

                        <div className="w-1/2 aspect-[2/3] overflow-hidden rounded-tr-[40px] rounded-bl-[40px] sm:rounded-tr-[60px] sm:rounded-bl-[60px] lg:rounded-tr-[80px] lg:rounded-bl-[80px] bg-gray-300 shadow-lg">
                            <img src={aduImage1} alt="" className="w-full h-full object-cover" />
                        </div>

                        <div className="flex flex-col gap-3 sm:gap-4 md:gap-6 w-1/2">
                            <div className="w-full aspect-square overflow-hidden rounded-tl-[40px] rounded-br-[40px] sm:rounded-tl-[60px] sm:rounded-br-[60px] lg:rounded-tl-[80px] lg:rounded-br-[80px] bg-gray-300 shadow-lg">
                                <img src={aduImage2} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="w-full aspect-square overflow-hidden rounded-tr-[40px] rounded-bl-[40px] sm:rounded-tr-[60px] sm:rounded-bl-[60px] lg:rounded-tr-[80px] lg:rounded-bl-[80px] bg-gray-300 shadow-lg">
                                <img src={aduImage3} alt="" className="w-full h-full object-cover" />
                            </div>
                        </div>

                    </div>

                    {/* CENTER BADGE — spinning circular text */}
                    <div className="absolute w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:size-47.5 animate-[spin_30s_linear_infinite] drop-shadow-xl">
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
                            <g transform="translate(100,100)">
                                <line x1="-12" y1="12" x2="12" y2="-12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                                <polyline points="2,-12 12,-12 12,-2" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                        </svg>
                    </div>

                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                    <Link
                        to="/how-to-adu"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-[#2F5D50] text-white font-semibold rounded-md hover:bg-[#244A40] transition shadow-sm"
                    >
                        How to ADU <FiArrowRight />
                    </Link>
                    <Link
                        to="/about"
                        className="inline-flex items-center gap-2 px-6 py-3 border border-[#2F5D50] text-[#2F5D50] font-semibold rounded-md hover:bg-[#2F5D50] hover:text-white transition"
                    >
                        About Us
                    </Link>
                </div>

            </div>

        </section>
    );
};

export default ChooseAtlas;
