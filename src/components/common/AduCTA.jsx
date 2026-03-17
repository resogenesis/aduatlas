import { Link } from "react-router-dom";
import aduCta from "../../assets/home/container_img.png"

const AduCTA = () => {
    return (
        <section className="w-full py-12 sm:py-16 lg:py-25">
            <div className="container mx-auto px-4 sm:px-6">
                <div className="flex flex-col lg:flex-row items-center justify-between bg-linear-to-r from-[#0F3D33] to-[#1F6F57] rounded-2xl overflow-hidden">

                    {/* LEFT CONTENT */}
                    <div className="text-white px-6 py-10 sm:px-10 sm:py-12 lg:pl-18 lg:py-0 lg:max-w-[55%]">

                        <h2 className="text-2xl sm:text-3xl font-semibold leading-snug mb-4 sm:mb-5">
                            Whether you are ready to build or starting out, ADU Atlas can help you either way.
                        </h2>

                        <p className="text-sm text-gray-200 mb-6 sm:mb-8">
                            Our process will provide you with an accurate scope of work for your city or a builder.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center">
                            <Link to={"#"} className="border border-white cursor-pointer px-6 py-3 rounded-md bg-white text-[#0F3D33] font-medium hover:shadow-md hover:bg-transparent hover:text-white transition text-center w-full sm:w-auto">
                                How to ADU
                            </Link>

                            <Link to={"#"} className="cursor-pointer px-6 py-3 rounded-md border border-white text-white hover:bg-white hover:text-[#0F3D33] transition text-center w-full sm:w-auto">
                                Join Here
                            </Link>

                        </div>
                    </div>

                    {/* RIGHT IMAGE */}
                    <div className="w-full lg:w-[45%] lg:mt-10">
                        <img
                            src={aduCta}
                            alt="ADU build"
                            className="w-full h-full object-cover"
                        />
                    </div>

                </div>
            </div>
        </section>
    );
};

export default AduCTA;