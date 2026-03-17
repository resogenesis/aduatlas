import { FiSearch } from "react-icons/fi";
import { IoDocumentTextOutline, IoTrendingUp } from "react-icons/io5";
import { RiVerifiedBadgeLine } from "react-icons/ri";

// Note: Local import
import CommonSectionTitle from "../common/CommonSectionTitle";
import aduImage1 from "../../assets/home/choose_img1.png"
import aduImage2 from "../../assets/home/choose_img2.png"
import aduImage3 from "../../assets/home/choose_img3.png"

// Note: dummy data
const features = [
    {
        icon: RiVerifiedBadgeLine,
        title: "Planning Tools",
        desc: "Use our pre-populated pre-site estimate worksheets and feasibility study",
    },
    {
        icon: FiSearch,
        title: "City and State Regulations",
        desc: "State equals Structure. City mandates everything else.",
    },
    {
        icon: IoDocumentTextOutline,
        title: "ADU Type Education",
        desc: "Explore over 20 different ADU types here",
    },
    {
        icon: IoTrendingUp,
        title: "Match with Pros",
        desc: "Get matched with qualified professionals familiar with your city zoning",
    },
];

const ChooseAtlas = () => {
    return (
        <section className="container mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center py-12 sm:py-16 lg:py-25">

            {/* LEFT SIDE */}
            <div className="w-full flex flex-col gap-8 sm:gap-12">
                {/* top content */}
                <div className="space-y-4">
                    <CommonSectionTitle text="Why Choose ADUAtlas" />

                    <p className="text-secondary text-base sm:text-lg">
                        ADUAtlas is a national platform that helps homeowners navigate every
                        step of building an ADU. Our step-by-step guide provides clarity on
                        what can be legally built, along with timelines, cost estimates, ADU
                        types, and key FAQs. We also match homeowners by ZIP code with both
                        local and national builders and suppliers. Whether you are just
                        starting or ready to build, ADUAtlas guides you through the process.
                    </p>
                </div>

                {/* FEATURE CARDS */}
                <div className="grid sm:grid-cols-2 gap-6">
                    {features?.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                            <div
                                key={idx}
                                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition"
                            >
                                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-green-900 text-white mb-4">
                                    <Icon size={20} />
                                </div>

                                <h4 className="font-bold mb-2 text-primary text-base">{item?.title || "N/F"}</h4>
                                <p className="text-sm text-secondary">{item?.desc || "N/F"}</p>
                            </div>
                        );
                    })}
                </div>

                <button className="w-fit cursor-pointer px-6 py-3 bg-[#2F5D50] rounded-md border border-[#2F5D50] text-white font-semibold text-base hover:bg-transparent hover:text-black hover:shadow-md transition-all duration-300">
                    About Us
                </button>
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