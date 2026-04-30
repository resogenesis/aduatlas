import { Link } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";

const PublicStubFooter = ({ chapterName }) => {
  return (
    <section className="bg-[#F4F7F6] py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-2xl text-center">
        <p className="text-secondary italic text-sm sm:text-base leading-relaxed mb-6">
          We give you the awareness. The system gives you the answers. The feasibility tool gives you yours specifically.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2F5D50]/10 text-[#2F5D50] text-xs font-semibold tracking-wider uppercase mb-4">
            <FiLock /> {chapterName ? `${chapterName} — locked` : "Locked"}
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold text-primary mb-3">
            The full step-by-step is inside the ADU system.
          </h3>
          <p className="text-secondary text-sm sm:text-base leading-relaxed mb-6">
            Start with the 2-minute Reality Check. Find out exactly where you stand — then unlock the full plan if it's right for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/quiz"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-[#2F5D50] text-white font-semibold hover:bg-[#244A40] transition"
            >
              Start the Reality Check <FiArrowRight />
            </Link>
            <Link
              to="/unlock"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-[#2F5D50] text-[#2F5D50] font-semibold hover:bg-[#2F5D50] hover:text-white transition"
            >
              See What's Inside ($79.99)
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicStubFooter;
