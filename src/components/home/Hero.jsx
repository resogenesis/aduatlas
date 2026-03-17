import heroImage from "../../assets/home/hero_image.png";
import CommonModal from "../common/CommonModal";
import { useState } from "react";

const Hero = () => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <section
                className="relative bg-no-repeat bg-cover bg-center pt-28 md:pt-36 lg:pt-44 pb-24 sm:pb-36 md:pb-48 lg:pb-64"
                style={{ backgroundImage: `url(${heroImage})` }}
            >
                {/* Dark overlay for text contrast */}
                <div className="absolute inset-0 bg-black/40" />

                <div className="relative container mx-auto px-4 text-white flex flex-col gap-5">

                    {/* Brand accent */}
                    <span className="inline-block w-fit text-sm sm:text-base md:text-lg font-semibold tracking-widest uppercase bg-white/15 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/30">
                        ADUAtlas
                    </span>

                    {/* Main heading */}
                    <h1 className="font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl max-w-3xl leading-tight lg:leading-tight">
                        A Smarter Way to Plan Your ADU
                    </h1>

                    {/* Paragraph */}
                    <p className="text-base sm:text-lg md:text-xl lg:text-2xl max-w-2xl text-white/90 leading-relaxed">
                        Understand the process, explore real ADU projects, then use our readiness tools to prepare before talking with your city or builder. Review local rules and connect with both National and local ADU professionals.
                    </p>

                    {/* Button */}
                    <button
                        onClick={() => setOpen(true)}
                        className="cursor-pointer w-fit mt-2 bg-white text-[#2F5D50] font-bold text-sm sm:text-base md:text-lg py-3.5 px-8 md:px-10 rounded-xl border-2 border-white hover:bg-transparent hover:text-white hover:shadow-lg transition-all duration-300"
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
