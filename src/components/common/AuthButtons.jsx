import { useState } from "react";
import { Link } from "react-router-dom";
import CommonModal from "./CommonModal";
import ComingSoonContent from "./ComingSoonContent";

const AuthButtons = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <div className="flex items-center gap-3 sm:gap-4 md:gap-6">

                <Link
                    to="/"
                    className="text-sm sm:text-base font-semibold"
                >
                    Faq
                </Link>

                <button
                    onClick={() => setOpen(true)}
                    className="cursor-pointer py-2 px-4 sm:px-6 md:px-8 lg:px-10 text-sm sm:text-base  bg-[#2F5D50] rounded-md border border-[#2F5D50]  text-white font-semibold hover:bg-transparent  hover:text-black  hover:shadow-md transition-all duration-300 "
                >
                    Login
                </button>

            </div>

            <CommonModal isOpen={open} onClose={() => setOpen(false)}>
                <ComingSoonContent />
            </CommonModal>
        </>

    );
};

export default AuthButtons;