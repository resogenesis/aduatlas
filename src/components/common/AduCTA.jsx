import { Link } from "react-router-dom";
import aduCta from "../../assets/home/container_img.png"

const AduCTA = () => {
    return (
        <section className="w-full py-25">
            <div className="container">
                <div className="flex items-center justify-between bg-linear-to-r from-[#0F3D33] to-[#1F6F57] rounded-2xl overflow-hidden ">

                    {/* LEFT CONTENT */}
                    <div className="text-white max-w-150 pl-18">

                        <h2 className="text-3xl font-semibold leading-snug mb-5">
                            Whether you are ready to build or starting out, ADU Atlas can help you either way.
                        </h2>

                        <p className="text-sm text-gray-200 mb-8">
                            Our process will provide you with an accurate scope of work for your city or a builder.
                        </p>

                        <div className="flex gap-4 items-center">
                            <Link to={"#"} className="border border-white cursor-pointer px-6 py-3 rounded-md bg-white text-[#0F3D33] font-medium hover:shadow-md hover:bg-transparent hover:text-white transition">
                                How to ADU
                            </Link>

                            <Link to={"#"} className="cursor-pointer px-6 py-3 rounded-md border border-white text-white hover:bg-white hover:text-[#0F3D33] transition">
                                Join Here
                            </Link>

                        </div>
                    </div>

                    {/* RIGHT IMAGE */}
                    <div className="mt-10 w-140">
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