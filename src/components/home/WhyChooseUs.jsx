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
        title: "Educational-first",
        desc: "Learn before you commit",
    },
    {
        icon: HiOutlineCurrencyDollar,
        title: "Transparent Pricing",
        desc: "No hidden fees",
    },
    {
        icon: HiOutlineShieldCheck,
        title: "Secure Payments",
        desc: "Your data is safe",
    },
    {
        icon: RiVerifiedBadgeLine,
        title: "Verified Data",
        desc: "From trusted sources",
    },
];

const WhyChooseUs = () => {
    return (
        <section className="py-16 relative overflow-hidden bg-no-repeat bg-cover bg-center" style={{ backgroundImage: `url(${bg_pic})` }}>

            <div className="container mx-auto px-6 relative">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">

                    {features?.map((item, idx) => {
                        const Icon = item.icon;

                        return (
                            <div
                                key={idx}
                                className="bg-[#244A40] text-white rounded-xl px-14 py-10 text-center shadow-lg hover:-translate-y-1 transition"
                            >
                                <div className="flex justify-center mb-3">
                                    <Icon className="text-[40px]" />
                                </div>

                                <h4 className="font-bold text-2xl">{item?.title || "N/F"}</h4>

                                <p className="text-base text-[#EEF5F2] mt-1">{item?.desc || "N/F"}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default WhyChooseUs;