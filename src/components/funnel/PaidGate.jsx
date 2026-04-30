import { Link, useLocation } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { isPaid } from "../../funnel/paymentStore";

// Wraps any route. If the user hasn't paid (mock for now), shows a paywall
// hand-off page instead of the gated content.
//
// INTEGRATION POINT: replace isPaid() with a Supabase user lookup on
// users.paid_at once auth is wired.

const PaidGate = ({ children, chapterName }) => {
  const location = useLocation();
  if (isPaid()) return children;

  return (
    <section className="min-h-[70vh] bg-[#F4F7F6] py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2F5D50]/10 text-[#2F5D50] text-xs font-semibold tracking-wider uppercase mb-5">
          <FiLock /> {chapterName ? `${chapterName} — locked` : "Locked"}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
          This is part of the paid system.
        </h1>
        <p className="text-secondary text-base sm:text-lg leading-relaxed mb-8">
          Our course, feasibility tool, and builder match are unlocked together with one $79.99 payment. 7-day full refund if it's not for you.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/unlock"
            state={{ from: location.pathname }}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-[#2F5D50] text-white font-semibold hover:bg-[#244A40] transition"
          >
            Unlock for $79.99 <FiArrowRight />
          </Link>
          <Link
            to="/quiz"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md border border-[#2F5D50] text-[#2F5D50] font-semibold hover:bg-[#2F5D50] hover:text-white transition"
          >
            Take the Free Reality Check First
          </Link>
        </div>
      </div>
    </section>
  );
};

export default PaidGate;
