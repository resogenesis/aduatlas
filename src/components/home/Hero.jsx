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
                    U.S. ADU Zoning &amp; Listing Guide
                </h1>

                <div className="max-w-2xl text-white/90 drop-shadow-md space-y-3 text-base sm:text-lg md:text-xl">
                    <p>
                        ADUAtlas is a national marketplace and educational platform that helps homeowners understand how to build an ADU (Accessory Dwelling Unit or Tiny Home). Access local zoning regulations by city, navigate the building process with step-by-step tools, explore a wide range of ADU options, and connect with local and national ADU builders and suppliers.
                    </p>
                    <p>
                        Explore 25+ ADU types, learn what you can legally build on your property, and prepare with the tools needed to move forward with confidence.
                    </p>
                    <p>
                        Learn before you build to avoid costly mistakes — start your ADU journey here.
                    </p>
                </div>

            </div>
        </section>
    );
};
export default Hero;
