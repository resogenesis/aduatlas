import { useState } from "react";

const CommonModal = ({ isOpen, onClose, children }) => {
    const [closing, setClosing] = useState(false);

    if (!isOpen && !closing) return null;

    const handleClose = () => {
        setClosing(true);

        setTimeout(() => {
            setClosing(false);
            onClose();
        }, 300);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">

            {/* overlay */}
            <div
                onClick={handleClose}
                className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${closing ? "opacity-0" : "opacity-100"}`}
            />

            {/* modal */}
            <div
                className={`relative bg-white rounded-xl p-8 w-[90%] max-w-md shadow-xl
                    ${closing
                        ? "animate-[modalFadeOut_0.3s_ease]"
                        : "animate-[modalFadeIn_0.3s_ease]"
                    }`}
            >
                {children}

                <button
                    onClick={handleClose}
                    className="cursor-pointer absolute top-3 right-4 text-gray-500 hover:text-black"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};

export default CommonModal;