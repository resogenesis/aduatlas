import { Link } from "react-router-dom";
import aduCta from "../../assets/home/container_img.png"

const AduCTA = () => {
    return (
        <section className="w-full py-12 sm:py-16 lg:py-25">
            <div className="container mx-auto px-4 sm:px-6">
                <div className="flex flex-col lg:flex-row lg:items-stretch justify-between bg-linear-to-r from-[#0F3D33] to-[#1F6F57] rounded-2xl overflow-hidden">

                    <div className="text-white px-6 py-10 sm:px-10 sm:py-12 lg:pl-18 lg:pr-6 lg:py-12 lg:max-w-[55%]">

                        <h2 className="text-2xl sm:text-3xl font-semibold leading-snug mb-4 sm:mb-5">
                            Whether you are ready to build or starting out, ADUAtlas walks you through the process.
                        </h2>

                        <p className="text-sm text-gray-200 mb-4">
                            Any builder or contractor needs the following information from you to provide an accurate scope of work and realistic estimates. Here are the questions:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-200 mb-6 sm:mb-8">
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>Location (ZIP code)</span></div>
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>Purpose of the ADU (rental, guest house, office, etc.)</span></div>
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>Lot size &amp; existing structure (square footage)</span></div>
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>Budget (site prep + structure)</span></div>
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>ADU type, size, and square footage</span></div>
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>Timeline</span></div>
                            <div className="flex items-start gap-2"><span className="text-white mt-1 shrink-0">•</span><span>Access to the property (entry points, constraints, etc.)</span></div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center">
                            <Link to="/how-to-adu" className="border border-white cursor-pointer px-6 py-3 rounded-md bg-white text-[#0F3D33] font-medium hover:shadow-md hover:bg-transparent hover:text-white transition text-center w-full sm:w-auto">
                                How to ADU
                            </Link>

                            <Link to="/pricing" className="cursor-pointer px-6 py-3 rounded-md border border-white text-white hover:bg-white hover:text-[#0F3D33] transition text-center w-full sm:w-auto">
                                ADU Paid Access
                            </Link>
                        </div>
                    </div>

                    <div className="w-full lg:w-[45%] lg:self-stretch">
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
