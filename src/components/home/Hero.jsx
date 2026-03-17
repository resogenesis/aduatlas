import heroImage from "../../assets/home/hero_image.png";
import CommonModal from "../common/CommonModal";
import { useState } from "react";

const Hero = () => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <section
                className="relative bg-no-repeat bg-cover bg-center pt-24 md:pt-32 lg:pt-40 pb-20 sm:pb-32 md:pb-44 lg:pb-60"
                style={{ backgroundImage: `url(${heroImage})` }}
            >
                {/* Subtle overlay for readability */}
                <div className="absolute inset-0 bg-black/30" />

                <div className="relative container mx-auto px-4 text-white flex flex-col gap-6">

                    {/* Heading */}
                    <h1 className="font-bold text-3xl sm:text-4xl md:text-5xl lg:text-6xl max-w-3xl leading-snug md:leading-snug lg:leading-tight drop-shadow-lg">
                        <span className="text-white/95">ADUAtlas:</span>{" "}
                        A Smarter Way to Plan Your ADU
                    </h1>

                    {/* Paragraph */}
                    <p className="text-base sm:text-lg md:text-xl lg:text-2xl max-w-2xl text-white/90 drop-shadow-md">
                        Understand the process, explore real ADU projects, then use our readiness tools to prepare before talking with your city or builder. Review local rules and connect with both National and local ADU professionals.
                    </p>

                    {/* Button */}
                    <button
                        onClick={() => setOpen(true)}
                        className="cursor-pointer w-fit bg-white text-[#2F5D50] font-bold text-sm sm:text-base md:text-lg py-3 px-6 md:px-8 rounded-xl border border-[#2F5D50] hover:bg-[#ffffffd7] hover:shadow-md transition-all duration-300"
                    >
                        Start Your Journey
                    </button>

                </div>
            </section>

            <CommonModal isOpen={open} onClose={() => setOpen(false)}>
                <div className="text-center">
                    <h2 className="text-3xl font-semibold mb-2">Coming Soon</h2>
                    <p className="text-gray-500">This feature is under development.</p>
                </div>
            </CommonModal>
        </>
    );
};
export default Hero;
