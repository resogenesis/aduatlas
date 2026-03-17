import { BiBookOpen } from "react-icons/bi";
import { HiOutlineShieldCheck } from "react-icons/hi";
import { HiOutlineCurrencyDollar } from "react-icons/hi2";
import { RiVerifiedBadgeLine } from "react-icons/ri";

// Note: Local import
import bg_pic from "../../assets/home/why_choose_us.png"

// Note: dummy data
const features = [
    {
        icon: BiBookOpen,
        title: "Education First",
        desc: "Learn before you commit",
    },
    {
        icon: HiOutlineCurrencyDollar,
        title: "Accurate Estimating Tools",
        desc: "Feasibility study for a fraction of the cost",
    },
    {
        icon: HiOutlineShieldCheck,
        title: "National and Local Suppliers",
        desc: "Professionals familiar with your zoning",
    },
    {
        icon: RiVerifiedBadgeLine,
        title: "Video Library",
        desc: "Watch and Explore ADU Construction Videos",
    },
];

const WhyChooseUs = () => {
    return (
        <section className="py-10 sm:py-16 relative overflow-hidden bg-no-repeat bg-cover bg-center" style={{ backgroundImage: `url(${bg_pic})` }}>

            <div className="container mx-auto px-4 sm:px-6 relative">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

                    {features?.map((item, idx) => {
                        const Icon = item.icon;

                        return (
                            <div
                                key={idx}
                                className="bg-[#244A40] text-white rounded-xl px-6 py-8 sm:px-8 sm:py-10 lg:px-10 text-center shadow-lg hover:-translate-y-1 transition"
                            >
                                <div className="flex justify-center mb-3">
                                    <Icon className="text-[32px] sm:text-[40px]" />
                                </div>

                                <h4 className="font-bold text-lg sm:text-xl lg:text-2xl">{item?.title || "N/F"}</h4>

                                <p className="text-sm sm:text-base text-[#EEF5F2] mt-1">{item?.desc || "N/F"}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default WhyChooseUs;