import heroImage from "../../assets/home/hero_image.png";
import CommonModal from "../common/CommonModal";
import ComingSoonContent from "../common/ComingSoonContent";
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

                    <h1 className="font-bold text-3xl sm:text-4xl md:text-5xl lg:text-6xl max-w-3xl leading-snug md:leading-snug lg:leading-tight drop-shadow-lg">
                        U.S. ADU Listings and Zoning Guide
                    </h1>

                    <div className="max-w-2xl text-white/90 drop-shadow-md space-y-3 text-base sm:text-lg md:text-xl">
                        <p>
                            ADUAtlas is a national platform that provides ADU regulations from both city and state and educates homeowners on ADUs and tiny homes — so you understand exactly what you can build before you begin.
                        </p>
                        <p>
                            Then you can be matched with both national and local builders and suppliers familiar with your home's zoning regulations.
                        </p>
                    </div>

                    <button
                        onClick={() => setOpen(true)}
                        className="cursor-pointer w-fit bg-white text-[#2F5D50] font-bold text-sm sm:text-base md:text-lg py-3 px-6 md:px-8 rounded-xl border border-[#2F5D50] hover:bg-[#ffffffd7] hover:shadow-md transition-all duration-300"
                    >
                        Start Your Journey
                    </button>

                </div>
            </section>

            <CommonModal isOpen={open} onClose={() => setOpen(false)}>
                <ComingSoonContent />
            </CommonModal>
        </>
    );
};
export default Hero;
