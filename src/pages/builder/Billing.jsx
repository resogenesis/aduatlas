import { FiCheck, FiCreditCard, FiZap } from "react-icons/fi";

const tiers = [
  {
    id: "pilot",
    name: "Pilot · Free",
    price: "$0",
    cadence: "during launch period",
    badge: "Current",
    features: [
      "All qualified Builder Packets in your service area",
      "Lead status tracking",
      "Direct contact with homeowners",
      "Locks in lifetime grandfathered pricing",
    ],
  },
  {
    id: "per-lead",
    name: "Per-lead",
    price: "$249",
    cadence: "per claimed packet",
    features: [
      "Pay only when you claim a lead",
      "Unlimited browsing of qualified packets",
      "48-hour exclusivity window per claim",
      "Refund if homeowner is unreachable in 7 days",
    ],
  },
  {
    id: "subscription",
    name: "Pro subscription",
    price: "$899",
    cadence: "per month",
    features: [
      "Unlimited claims in your service area",
      "Priority placement on Builder Packets",
      "Featured listing on /builders match page",
      "Dedicated account manager",
    ],
  },
];

const Billing = () => {
  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Billing</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-3">
        Plan & invoices.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        You're on the pilot plan during the launch period. No charges. After the pilot, switch to per lead or subscription.
      </p>

      {/* Current plan card */}
      <div className="bg-accent text-accent-fg rounded-3xl p-7 sm:p-10 mb-10">
        <div className="flex items-center gap-2 text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-3">
          <FiZap /> Current plan
        </div>
        <h2 className="font-display font-medium text-3xl sm:text-4xl mb-2">Pilot · Free</h2>
        <p className="text-accent-fg/80 text-sm sm:text-base mb-6 max-w-lg">
          You see every qualified packet in your service area. Pricing locks at the rate you join at when the pilot ends.
        </p>
        <button
          onClick={() => alert("INTEGRATION POINT (Stripe): open billing portal / change plan.")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
        >
          <FiCreditCard /> Manage billing
        </button>
      </div>

      {/* Plans */}
      <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-5">Plans after pilot</p>
      <div className="grid lg:grid-cols-3 gap-5">
        {tiers.map((t) => (
          <div
            key={t.id}
            className={`rounded-3xl p-7 border ${
              t.badge ? "bg-surface-1-solid border-accent" : "bg-surface-1-solid border-stroke"
            }`}
          >
            <div className="flex items-center justify-between mb-5">
              <p className="text-paper text-xs uppercase tracking-[0.15em]">{t.name}</p>
              {t.badge && (
                <span className="text-[0.65rem] font-semibold bg-accent text-accent-fg rounded-full px-2 py-0.5 uppercase tracking-wider">
                  {t.badge}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-display text-paper text-5xl">{t.price}</span>
            </div>
            <p className="text-paper-dim text-sm mb-7">{t.cadence}</p>
            <ul className="space-y-3">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-paper-dim">
                  <FiCheck className="shrink-0 mt-0.5 text-accent" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Invoices placeholder */}
      <div className="mt-10 bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8">
        <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-3">Invoices</p>
        <p className="text-paper-dim text-sm">
          No invoices yet. They'll appear here once you switch to a paid plan.
        </p>
      </div>
    </div>
  );
};

export default Billing;
