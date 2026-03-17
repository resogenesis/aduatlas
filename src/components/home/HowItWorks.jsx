import howItworksImage from "../../assets/home/how_it_works.png"
import CommonSectionTitle from "../common/CommonSectionTitle";

// Note: dummy data
const steps = [
    {
        number: "01",
        title: "Select your state",
        desc: "using the dropdown to review statewide ADU guidelines, and why you need to know your local zoning regulations. ",
    },
    {
        number: "02",
        title: "ADU Types",
        desc: `Compare different types of ADU, review the 25+ options and see the difference.`,
    },
    {
        number: "03",
        title: "Enter your ZIP code",
        desc: "to access local zoning and permitting regulations.",
    },
    {
        number: "04",
        title: "Choose your build",
        desc: `options and find national and local builders and suppliers familiar with your area.`,
    },
    {
        number: "05",
        title: "Prepare before you",
        desc: `hire using ADUAtlas’s pre-filled site prep checklist and builder estimate tools to keep your budget on track.Get matched with ADU Builders and suppliers. `,
    },
];

const HowItWorks = () => {
    return (
        <section className="w-full bg-[#F4F7F6] py-25">
            <div className="container mx-auto px-6">

                {/* header */}
                <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
                    <CommonSectionTitle text="How It Works" />
                    <p className="text-secondary text-lg">
                        Be prepared to provide your city with your property planning basics
                    </p>
                </div>

                {/* main content */}
                <div className="grid lg:grid-cols-2 gap-16">

                    {/* left side */}
                    <div className="flex flex-col gap-6">

                        {steps?.map((step, idx) => (
                            <div
                                key={idx}
                                className="flex gap-4 bg-[#E1E8E6] px-8 py-6 rounded-2xl"
                            >
                                {/* number circle */}
                                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-[#2F5D50] text-white font-semibold shrink-0">
                                    {step?.number || "N/F"}
                                </div>

                                {/* text */}
                                <div className="space-y-3">
                                    <h4 className="font-semibold text-primary text-2xl">
                                        {step?.title || "N/F"}
                                    </h4>

                                    <p className="text-secondary text-md">
                                        {step?.desc || "N/F"}
                                    </p>
                                </div>
                            </div>
                        ))}

                    </div>

                    {/* right side image */}
                    <div className="w-full h-252 rounded-2xl">
                        <img
                            src={howItworksImage}
                            alt="ADU House"
                            className="w-full h-full rounded-2xl object-cover"
                        />
                    </div>

                </div>
            </div>
        </section>
    );
};

export default HowItWorks;