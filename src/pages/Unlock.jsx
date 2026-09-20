import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiCheck, FiLock, FiShield } from "react-icons/fi";
import { captureLead } from "../lib/supabase";
import { startCheckout, checkoutEnabled } from "../lib/checkout";
import { sendEmail, TEMPLATES } from "../lib/email";
import { EV, identify, track } from "../lib/analytics";
import { CONCIERGE_BOUNDARY, PLANS, PLAN_IDS, formatPrice, planById, upgradeCreditCents } from "../lib/plans";
import { getPaidTier, isPaid } from "../stores/paymentStore";

// Plans & Pricing: Golden / Platinum / Concierge, all purchasable. Plan data
// lives in src/lib/plans.js so this page and the checkout never disagree.
// ?tier=<id> preselects a plan (the homepage cards and the upgrade paywalls
// link here that way).

const Unlock = () => {
  const [searchParams] = useSearchParams();
  const requested = planById(searchParams.get("tier"))?.id || PLAN_IDS.PLATINUM;

  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState(requested);
  const buyHeadingRef = useRef(null);

  useEffect(() => {
    track(EV.UNLOCK_VIEWED, { requested });
  }, [requested]);

  // Select a plan: record the choice, then move the visitor to the checkout
  // panel and focus its heading so the change is perceivable (incl. for AT).
  const selectTier = (id) => {
    setSelectedTier(id);
    track(EV.TIER_SELECTED, { tier: id });
    requestAnimationFrame(() => {
      document.getElementById("buy")?.scrollIntoView({ behavior: "smooth", block: "start" });
      buyHeadingRef.current?.focus({ preventScroll: true });
    });
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    setEmailError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    const res = await captureLead({ email, source: "unlock" });
    if (res && res.ok === false && res.error !== "supabase-disabled") {
      setEmailError("We couldn't save your email. Please try again.");
      track(EV.EMAIL_CAPTURE_FAILED, { tier: selectedTier });
      return;
    }
    identify(email, { email });
    track(EV.EMAIL_CAPTURED, { tier: selectedTier });
    sendEmail({
      template: TEMPLATES.COMPLETE_PLAN,
      to: email,
      data: { url: `${window.location.origin}/unlock?tier=${selectedTier}#buy` },
    });
    setEmailSubmitted(true);
  };

  const handleCheckout = async () => {
    setLoading(true);
    setCheckoutError("");
    track(EV.CHECKOUT_STARTED, { tier: selectedTier });
    const res = await startCheckout({ tier: selectedTier, email });
    if (!res.ok) {
      setLoading(false);
      console.error("Checkout failed:", res.error);
      track(EV.CHECKOUT_FAILED, { tier: selectedTier, error: res.error });
      setCheckoutError("Payment could not be started. Please try again.");
      return;
    }
    window.location.href = res.url;
  };

  const selected = planById(selectedTier);
  // Client-side preview of the upgrade credit for signed-in buyers; the
  // server recomputes it from the database at checkout.
  const ownedTier = isPaid() ? getPaidTier() : null;
  const credit = ownedTier ? upgradeCreditCents(ownedTier, selected.id) : 0;
  const dueCents = selected.priceCents - credit;

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl">
        <div className="max-w-3xl mb-12">
          <h1 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.02] mb-5">
            Teach me. Analyze my property. Help me move forward.
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed">
            Start with the course, add a feasibility study and site plan prepared for your property, or bring in a concierge for the next steps. Every plan includes one year of access and a 7-day full refund.
          </p>
        </div>

        {/* Plan cards */}
        <ul className="grid md:grid-cols-3 gap-5 lg:gap-6 items-stretch mb-12">
          {PLANS.map((p) => {
            const isSelected = selectedTier === p.id;
            const featured = Boolean(p.featured);
            const ink = featured ? "text-white" : "text-paper";
            const dim = featured ? "text-white/70" : "text-paper-dim";
            return (
              <li
                key={p.id}
                className={`relative rounded-[1.5rem] p-7 sm:p-8 flex flex-col transition-shadow ${ featured ?"bg-forest-deep text-white shadow-[0_40px_80px_-40px_rgba(31,68,50,0.7)]":"bg-canvas border border-stroke"} ${isSelected ? (featured ?"ring-2 ring-gold":"ring-2 ring-accent") :""}`}
              >
                <div className="flex items-center justify-between mb-6">
                  <p className={`text-base font-semibold ${ink}`}>{p.name}</p>
                  {featured && <span className="px-2.5 py-1 rounded-full bg-gold/90 text-forest-deep text-xs font-semibold">Most popular</span>}
                  {isSelected && !featured && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                      <FiCheck /> Selected
                    </span>
                  )}
                </div>
                <p className={`font-primary font-extrabold text-5xl leading-none tracking-tight mb-2 ${ink}`}>{formatPrice(p.priceCents)}</p>
                <p className={`text-sm mb-3 ${dim}`}>{p.tagline}</p>
                <p className={`text-sm leading-relaxed mb-6 ${dim}`}>{p.summary}</p>
                <ul className="space-y-3 flex-1">
                  {p.bullets.map((b) => (
                    <li key={b} className={`flex items-start gap-2.5 text-sm leading-snug ${ink}`}>
                      <FiCheck className={`mt-0.5 shrink-0 ${featured ?"text-gold":"text-accent"}`} aria-hidden /> {b}
                    </li>
                  ))}
                </ul>
                {p.id === PLAN_IDS.GOLDEN && (
                  <Link to="/course-outline" className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${featured ?"text-white":"text-accent"} hover:underline underline-offset-4`}>
                    See the course outline <FiArrowRight className="text-xs" />
                  </Link>
                )}
                {p.id === PLAN_IDS.PLATINUM && (
                  <Link to="/feasibility-study" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-white hover:underline underline-offset-4">
                    What the study includes <FiArrowRight className="text-xs" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => selectTier(p.id)}
                  aria-pressed={isSelected}
                  className={`mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${ featured ?"bg-white text-forest-deep hover:bg-mist":"bg-accent text-accent-fg hover:bg-accent-dim"}`}
                >
                  {isSelected ? "Selected, continue below" : `Choose ${p.name}`} <FiArrowRight />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="grid md:grid-cols-2 gap-4 mb-14 text-sm text-paper-dim leading-relaxed">
          <p className="bg-surface-1-solid rounded-2xl p-5">
            <span className="text-paper font-semibold">Upgrade any time.</span> What you have already paid comes off the next plan. Golden to Platinum is $200. Platinum to Concierge is $221.
          </p>
          <p className="bg-surface-1-solid rounded-2xl p-5">
            <span className="text-paper font-semibold">Concierge boundary.</span> {CONCIERGE_BOUNDARY}
          </p>
        </div>

        {/* Buy panel */}
        <div id="buy" className="scroll-mt-24 bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10 max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-2">
            <h2 ref={buyHeadingRef} tabIndex={-1} aria-live="polite" className="font-primary font-extrabold tracking-tight text-paper text-2xl sm:text-3xl outline-none">
              {selected.name}
            </h2>
            <span className="text-paper-dim text-sm">
              {credit > 0 ? (
                <>
                  <s>{formatPrice(selected.priceCents)}</s> {formatPrice(dueCents)} after your {formatPrice(credit)} credit
                </>
              ) : (
                <>{formatPrice(selected.priceCents)} one time</>
              )}
            </span>
          </div>
          <p className="text-paper-dim text-sm mb-6">{selected.tagline}</p>

          {!emailSubmitted ? (
            <form onSubmit={submitEmail} className="space-y-3" noValidate>
              <label htmlFor="unlock-email" className="block text-paper text-sm font-medium mb-2">
                Email for your receipt and access link
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="unlock-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "unlock-email-error" : undefined}
                  className="flex-1 px-5 py-4 bg-canvas border border-stroke rounded-xl text-paper placeholder:text-paper-dim/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent transition"
                />
                <button type="submit" className="px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors">
                  Continue
                </button>
              </div>
              {emailError && (
                <p id="unlock-email-error" role="alert" className="text-xs text-red-500 mt-1">
                  {emailError}
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-5">
              <div className="bg-canvas border border-stroke rounded-xl p-4 flex items-center gap-3">
                <FiCheck className="text-accent text-xl shrink-0" />
                <div className="text-sm">
                  <span className="text-paper font-medium">Email saved.</span> <span className="text-paper-dim">{email}</span>
                </div>
              </div>
              {checkoutEnabled ? (
                <>
                  <button
                    onClick={handleCheckout}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-7 py-5 rounded-xl bg-accent text-accent-fg text-lg font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60"
                  >
                    <FiLock /> {loading ? "Redirecting…" : `Pay ${formatPrice(dueCents)}`}
                  </button>
                  {checkoutError && (
                    <p role="alert" className="text-center text-xs text-red-500">
                      {checkoutError}
                    </p>
                  )}
                  <p className="text-center text-xs text-paper-dim flex items-center justify-center gap-1.5">
                    <FiShield /> Secure checkout powered by Stripe
                  </p>
                </>
              ) : (
                <div className="bg-canvas border border-stroke rounded-xl p-5 text-sm text-paper-dim leading-relaxed">
                  <span className="text-paper font-medium">You're on the list.</span> Checkout is opening soon. We'll email <span className="text-paper">{email}</span> the moment {selected.name} is available to purchase.
                </div>
              )}
            </div>
          )}

          <p className="text-paper-dim text-xs leading-relaxed mt-6">
            7-day full refund. If ADUAtlas isn't useful within 7 days, we refund in full, no questions asked.
          </p>
          <p className="text-paper-dim/70 text-[0.7rem] leading-relaxed mt-3">
            ADUAtlas provides planning guidance, not legal advice, engineering, appraisal, or permit determination. Always confirm with your city, a licensed architect or engineer, and a qualified contractor before committing to a design.{" "}
            <Link to="/methodology" className="underline-offset-2 hover:underline hover:text-paper-dim transition">
              Read our methodology
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Unlock;
