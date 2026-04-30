import { Link, useLocation } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { isPaid } from "../../funnel/paymentStore";

const PaidGate = ({ children, chapterName }) => {
  const location = useLocation();
  if (isPaid()) return children;

  return (
    <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium tracking-[0.2em] uppercase mb-7">
          <FiLock /> {chapterName ? `${chapterName} — locked` : "Locked"}
        </div>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          This is part of the <span className="italic">paid system.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
          The course, feasibility tool, and builder match unlock together with one $79.99 payment. 7-day full refund if it's not for you.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/unlock"
            state={{ from: location.pathname }}
            className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
          >
            Unlock for $79.99 <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/quiz"
            className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-stroke text-paper font-medium hover:border-paper-dim transition"
          >
            Take the Reality Check First
          </Link>
        </div>
      </div>
    </section>
  );
};

export default PaidGate;
