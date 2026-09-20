import { Link, useLocation } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { isPaid, hasTier, TIERS } from "../../stores/paymentStore";
import { planById } from "../../lib/plans";
import { isBuildersUnlocked, isFeasibilityUnlocked, courseProgress, packetProgress } from "../../stores/courseStore";
import { currentUser } from "../../stores/authStore";

// Three layers:
// 1. Paid gate (any /course/*, /dashboard, /my-property, worksheets,
//    builder directory) — must have purchased SOMETHING (isPaid()). Golden
//    includes builder profile access.
// 2. Tier gate (requireTier="report") — the Platinum deliverables (feasibility
//    study, site plan, feasibility tools) require Platinum or Concierge; a
//    Golden buyer must NOT reach them.
// 3. Progress gate (requireBuilders) — property-aware builder matching only;
//    not used for the directory itself.
//
// NOTE: getPaidTier() is a client-side UX hint. The server must re-verify
// `users.paid_tier` before generating any report-tier deliverable.

const PaidGate = ({ children, chapterName, requireTier, requireBuilders }) => {
  const location = useLocation();
  // Admins can always preview gated content (course chapters, report-tier
  // tools) — needed so the visual content editor's iframe can render these
  // pages for review/editing without also faking a purchase.
  if (currentUser()?.role === "admin") return children;
  if (!isPaid()) return <PayPaywall location={location} chapterName={chapterName} />;

  if (requireTier && !hasTier(requireTier)) {
    return <TierUpgradePaywall location={location} chapterName={chapterName} requireTier={requireTier} />;
  }

  if (requireBuilders && !isBuildersUnlocked()) {
    return <BuilderPaywall progress={courseProgress()} packetPercent={packetProgress().percent} feasOk={isFeasibilityUnlocked()} />;
  }

  return children;
};

const PayPaywall = ({ location, chapterName }) => (
  <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
    <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-accent/10 text-accent text-xs font-medium mb-7">
        <FiLock /> {chapterName ? `${chapterName} · locked` : "Locked"}
      </div>
      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
        This is part of the <span className="">paid system.</span>
      </h1>
      <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
        Golden ($79) unlocks the full course, the planning worksheets, the ADU Ready Score, and builder profiles. Platinum ($279) adds a feasibility study and visual site plan prepared for your property. Concierge ($500) adds portal support and 60 minutes of private consultation. 7 day full refund if it's not for you.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/unlock"
          state={{ from: location.pathname }}
          className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
        >
          See plans <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </Link>
        <Link
          to="/property"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition"
        >
          Check my property first
        </Link>
      </div>
    </div>
  </section>
);

// Shown when a buyer IS paid but only holds Golden and is trying to reach a
// Platinum deliverable. The $79 Golden purchase applies as a credit toward
// Platinum (handled server-side at checkout), so the upgrade costs $200.
const TierUpgradePaywall = ({ location, chapterName, requireTier }) => {
  const plan = planById(requireTier) || planById(TIERS.REPORT);
  const isConcierge = plan.id === TIERS.CONCIERGE;
  return (
  <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
    <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-accent/10 text-accent text-xs font-medium mb-7">
        <FiLock /> {chapterName ? `${chapterName} · ${plan.name}` : plan.name}
      </div>
      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
        This is part of <span>{plan.name}.</span>
      </h1>
      <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
        {isConcierge
          ? "Concierge adds portal support, personalized next-step guidance, builder-match assistance, and 60 minutes of private consultation. What you have already paid applies as a credit."
          : "Golden includes the full course, the planning worksheets, the ADU Ready Score, and builder profiles. The feasibility study, visual site plan, and feasibility tools are part of Platinum. Your $79 applies as a credit, so the upgrade is $200."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to={`/unlock?tier=${plan.id}`}
          state={{ from: location.pathname, tier: plan.id }}
          className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
        >
          Upgrade to {plan.name} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </Link>
        <Link
          to="/packet"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition"
        >
          Keep working your worksheets
        </Link>
      </div>
    </div>
  </section>
  );
};

const BuilderPaywall = ({ progress, packetPercent, feasOk }) => (
  <section className="min-h-[80vh] bg-canvas py-20 sm:py-28">
    <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-accent/10 text-accent text-xs font-medium mb-7">
        <FiLock /> Builders · locked
      </div>
      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
        Builders only see <span className="">prepared homeowners.</span>
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
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
        >
          Continue the course
        </Link>
        <Link
          to="/my-property"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition"
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
