import { useState } from "react";

const ComingSoonContent = () => {
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (email.trim()) {
            setSubmitted(true);
        }
    };

    return (
        <div className="text-center px-2 py-4">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 bg-[#2F5D50]/10 rounded-full flex items-center justify-center mb-5">
                <svg className="w-8 h-8 text-[#2F5D50]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
            </div>

            {/* Heading */}
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                We're Almost Ready
            </h2>

            <p className="text-[#2F5D50] font-semibold text-sm uppercase tracking-wider mb-4">
                Launching Soon
            </p>

            {/* Description */}
            <p className="text-gray-600 text-base leading-relaxed mb-6 max-w-sm mx-auto">
                ADUAtlas is putting the finishing touches on your complete ADU planning toolkit. Be the first to access state regulations, builder matching, and cost estimating tools.
            </p>

            {/* Email signup or success */}
            {submitted ? (
                <div className="bg-[#2F5D50]/10 rounded-lg p-4">
                    <p className="text-[#2F5D50] font-semibold">You're on the list!</p>
                    <p className="text-gray-500 text-sm mt-1">We'll notify you when ADUAtlas launches.</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
                    <input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#2F5D50] focus:ring-1 focus:ring-[#2F5D50]"
                    />
                    <button
                        type="submit"
                        className="cursor-pointer px-6 py-3 bg-[#2F5D50] text-white font-semibold text-sm rounded-lg hover:bg-[#244a3f] transition-colors"
                    >
                        Notify Me
                    </button>
                </form>
            )}
        </div>
    );
};

export default ComingSoonContent;
