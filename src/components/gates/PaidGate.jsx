import { Link, useLocation } from "react-router-dom";
import { FiArrowRight, FiLock } from "react-icons/fi";
import { isPaid, hasTier, TIERS } from "../../stores/paymentStore";
import { formatPrice, planById } from "../../lib/plans";
import { useCheckoutQuote } from "../../lib/useCheckoutQuote";
import { currentUser } from "../../stores/authStore";

// Three layers:
// 1. Paid gate (any /course/*, /dashboard, /my-property, /costs, /adu-options,
//    builder directory): must have purchased SOMETHING (isPaid()). Golden
//    includes builder profile access.
// 2. Tier gate (requireTier="report"): the Platinum deliverables (feasibility
//    study, site plan, feasibility tools) AND the preparation worksheets with
//    the ADU Ready Score (/packet/*) require Platinum or Concierge. A Golden
//    buyer must NOT reach them (Richard and Amy call, 2026-09-24).
// 3. Tier gate (requireTier="concierge"): written portal support and the
//    60 minutes of consultation.
// The builder directory itself needs only a paid plan. "Match Me With
// Builders" is Phase 2, is not sold in Phase 1, and will get its own gate if
// and when it ships.
//
// NOTE: getPaidTier() is a client-side UX hint. The server must re-verify
// `users.paid_tier` before generating any report-tier deliverable.

const PaidGate = ({ children, chapterName, requireTier }) => {
  const location = useLocation();
  // Admins can always preview gated content (course chapters, report-tier
  // tools) — needed so the visual content editor's iframe can render these
  // pages for review/editing without also faking a purchase.
  if (currentUser()?.role === "admin") return children;
  if (!isPaid()) return <PayPaywall location={location} chapterName={chapterName} />;

  if (requireTier && !hasTier(requireTier)) {
    return <TierUpgradePaywall location={location} chapterName={chapterName} requireTier={requireTier} />;
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
        Golden ($79) unlocks the full course, which teaches you how to find and verify your own state and city rules, plus builder profiles. Platinum ($279) adds the preparation worksheets and ADU Ready Score, plus a feasibility study and a site plan in two versions prepared for your property. Concierge ($500) adds written support through the portal and 60 minutes of private consultation. 48 hour full refund if it's not for you.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/unlock"
          state={{ from: location.pathname }}
          className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
        >
          See plans <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  </section>
);

// Shown when a buyer IS paid but holds a lower tier than the page needs: a
// Golden buyer reaching the worksheets or a Platinum deliverable, or a
// Platinum buyer reaching Concierge support.
//
// THE PRICE (RC4a, T4-03). This used to say "Your $79 applies as a credit, so
// the upgrade is $200" to everyone, and a sponsored Golden resident, whose $79
// nobody paid, was then charged $279 at checkout. The figure now comes from
// checkout's own quote for this account (useCheckoutQuote), so it is the amount
// the charge will carry, and while there is no quote no figure is printed.
const priceSentence = (quote, plan) => {
  if (!quote?.ok) return "";
  if (quote.creditCents > 0) {
    const from = planById(quote.creditFrom)?.name || "your earlier plan";
    return ` What you paid for ${from} comes off, so the upgrade is ${formatPrice(quote.dueCents)}.`;
  }
  return ` ${plan.name} is ${formatPrice(quote.dueCents)}.`;
};

const TierUpgradePaywall = ({ location, chapterName, requireTier }) => {
  const plan = planById(requireTier) || planById(TIERS.REPORT);
  const isConcierge = plan.id === TIERS.CONCIERGE;
  const quote = useCheckoutQuote(plan.id);
  const price = priceSentence(quote, plan);
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
          ? `Concierge adds written support through the ADUAtlas portal and 60 minutes of private consultation.${price}`
          : `Golden includes the full course, which teaches you how to find and verify your own state and city rules, plus builder profiles. The preparation worksheets, the ADU Ready Score, the feasibility study, and the site plan in two versions are part of Platinum.${price}`}
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
          to="/course"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition"
        >
          Back to the course
        </Link>
      </div>
    </div>
  </section>
  );
};

export default PaidGate;
