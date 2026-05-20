import { Link, useLocation } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { isPaid } from "../../funnel/paymentStore";
import { isBuildersUnlocked, isFeasibilityUnlocked, courseProgress, packetProgress } from "../../funnel/courseStore";

// Two layers:
// 1. Paid gate (any /course/*, /feasibility, /builders) — must have purchased.
// 2. Progress gate (/feasibility, /builders) — must hit course/packet thresholds.

const PaidGate = ({ children, chapterName, requireFeasibility, requireBuilders }) => {
  const location = useLocation();
  if (!isPaid()) return <PayPaywall location={location} chapterName={chapterName} />;

  if (requireBuilders && !isBuildersUnlocked()) {
    return <BuilderPaywall progress={courseProgress()} packetPercent={packetProgress().percent} feasOk={isFeasibilityUnlocked()} />;
  }
  if (requireFeasibility && !isFeasibilityUnlocked()) {
    return <FeasibilityPaywall progress={courseProgress()} />;
  }

  return children;
};

const PayPaywall = ({ location, chapterName }) => (
  <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
    <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium tracking-[0.2em] uppercase mb-7">
        <FiLock /> {chapterName ? `${chapterName} · locked` : "Locked"}
      </div>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
        This is part of the <span className="italic">paid system.</span>
      </h1>
      <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
        The course, feasibility tool, and builder match unlock together with one $99 payment. 7 day full refund if it's not for you.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/unlock"
          state={{ from: location.pathname }}
          className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
        >
          Unlock for $99 <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
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

const FeasibilityPaywall = ({ progress }) => (
  <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
    <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium tracking-[0.2em] uppercase mb-7">
        <FiLock /> Feasibility · locked
      </div>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
        Finish the course first.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-3 max-w-xl mx-auto">
        Feasibility unlocks at <span className="text-paper font-medium">80% course progress</span>. You're at <span className="text-accent">{progress}%</span>.
      </p>
      <p className="text-paper-dim text-sm leading-relaxed mb-10 max-w-xl mx-auto italic">
        Each chapter sharpens your inputs. Running Feasibility before you've covered budget and regulations would give you a worse plan, not a faster one.
      </p>
      <Link
        to="/course"
        className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
      >
        Continue the course <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
      </Link>
    </div>
  </section>
);

const BuilderPaywall = ({ progress, packetPercent, feasOk }) => (
  <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
    <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium tracking-[0.2em] uppercase mb-7">
        <FiLock /> Builders · locked
      </div>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
        Builders only see <span className="italic">prepared homeowners.</span>
      </h1>
      <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
        Builders in our network only work with homeowners who've completed the system. That's why their quotes are accurate the first time. Finish your plan to unlock matches.
      </p>

      <div className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6 mb-8 text-left max-w-md mx-auto">
        <div className="space-y-3">
          <Row label="Course progress" value={`${progress}%`} done={progress >= 80} />
          <Row label="Feasibility study" value={feasOk ? "Run" : "Not run"} done={feasOk} />
          <Row label="Feasibility packet" value={`${packetPercent}%`} done={packetPercent >= 75} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/course"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
        >
          Continue the course
        </Link>
        <Link
          to="/my-property"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-stroke text-paper font-medium hover:border-paper-dim transition"
        >
          Complete property brief
        </Link>
      </div>
    </div>
  </section>
);

const Row = ({ label, value, done }) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-paper-dim">{label}</span>
    <span className={done ? "text-accent font-medium" : "text-paper"}>{value}</span>
  </div>
);

export default PaidGate;
