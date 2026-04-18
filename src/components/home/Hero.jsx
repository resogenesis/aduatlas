import heroImage from "../../assets/home/hero_image.png";

const Hero = () => {
    return (
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

            </div>
        </section>
    );
};
export default Hero;
