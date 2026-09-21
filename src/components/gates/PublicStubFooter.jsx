import { Link } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";

const PublicStubFooter = ({ chapterName }) => {
  return (
    <section className="bg-canvas section-y border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
        <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-9 max-w-lg mx-auto">
          We give you the awareness. The system gives you the answers. The feasibility tool gives you yours specifically.
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-accent/10 text-accent text-xs font-medium mb-6 press">
            <FiLock /> {chapterName ? `${chapterName} · locked` : "Locked"}
          </div>
          <h3 className="font-display text-paper text-2xl sm:text-3xl leading-snug tracking-tight mb-4">
            The full step by step is inside the ADU system.
          </h3>
          <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto">
            Start with a free property check. See what public records say about your lot, then choose the plan that fits.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/property"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press"
            >
              Check my property <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/unlock"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition press"
            >
              See plans from $79
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicStubFooter;
