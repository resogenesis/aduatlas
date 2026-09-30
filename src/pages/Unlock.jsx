import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiCheck, FiLock, FiShield } from "react-icons/fi";
import { captureLead } from "../lib/supabase";
import { ALREADY_HAS_PLAN, PRICE_CHANGED, startCheckout, checkoutEnabled } from "../lib/checkout";
import { getReferralCode } from "../lib/referral";
import { sendEmail, TEMPLATES } from "../lib/email";
import { EV, identify, track } from "../lib/analytics";
import { CONCIERGE_BOUNDARY, PLANS, PLAN_IDS, formatPrice, planById, planRank } from "../lib/plans";
import { useCheckoutQuote } from "../lib/useCheckoutQuote";
import { PARTNER_ENTRY_PATH, accessToken, currentUser, hasPendingPartnerEntry, isPortalUser } from "../stores/authStore";
import { getPaidTier } from "../stores/paymentStore";

// Plans & Pricing: Golden / Platinum / Concierge, all purchasable. Plan data
// lives in src/lib/plans.js so this page and the checkout never disagree.
// ?tier=<id> preselects a plan (the homepage cards and the upgrade paywalls
// link here that way).

// THE PRICE ON THIS PAGE is checkout's own quote for this account
// (useCheckoutQuote, RC4a T4-03): api/create-checkout.js runs the path a real
// checkout runs and stops before Stripe, so the amount shown is the amount the
// charge will carry. It used to be previewed here from my_qualifying_paid_plan()
// and upgradeCreditCents, the same inputs by a second route; there is now one
// route. A sponsored Golden (2p) holds Golden without having paid the $79, so the
// quote carries no credit for them. A signed-out visitor earns no credit at
// checkout (no token), so they are shown the list price, which is exactly what
// the server would say.

// The plan this account HOLDS, which is the entitlement LEVEL (2r) whatever paid
// for it, a purchase or a sponsorship. It is read from the session mirror the
// server hydrates from users.paid_tier on every load, and it decides only how the
// plan cards read: a held plan says so instead of offering "Choose". It is not a
// price input (the credit below reads qualifying money from the server), and it
// is not the boundary either: api/create-checkout.js refuses to sell a plan the
// account already holds. A paid flag with no recorded tier is unknown, and an
// unknown plan is never shown as held.
const readHeldPlan = () => (currentUser() ? planById(getPaidTier()) : null);

const Unlock = () => {
  const [searchParams] = useSearchParams();
  const explicitTier = planById(searchParams.get("tier"))?.id || null;
  const requested = explicitTier || PLAN_IDS.PLATINUM;
  const heldPlan = readHeldPlan();

  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [emailError, setEmailError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  // True when the server refused because the account already holds this plan or
  // a higher one (api/create-checkout.js, 409). That is not a failure, so the
  // line reads as information and links to the portal instead of asking for a retry.
  const [alreadyHasPlan, setAlreadyHasPlan] = useState(false);
  const [loading, setLoading] = useState(false);
  // Without an explicit ?tier, a holder starts on the next plan up rather than on
  // one they already have. An explicit ?tier is honoured as asked.
  // A holder of the top plan has nothing above it, so the panel names the plan
  // they hold (and says it is held) rather than a lower one to pay for.
  const [selectedTier, setSelectedTier] = useState(() => {
    if (explicitTier || !heldPlan || planRank(requested) > heldPlan.rank) return requested;
    return PLANS.find((p) => p.rank > heldPlan.rank)?.id || heldPlan.id;
  });
  // A signed-in resident who started sponsored access in this browser (a link or
  // a typed code) and has no plan yet is pointed back to it before being asked to
  // pay. Remembering the entry grants nothing and this does not say it will: the
  // server decides on /partner. Staff, builders and government users are not
  // pointed there, as after sign-in (landingAfterSignIn).
  const signedIn = currentUser();
  const partnerWaiting = Boolean(signedIn) && !isPortalUser(signedIn) && !heldPlan && hasPendingPartnerEntry();
  const buyHeadingRef = useRef(null);

  useEffect(() => {
    track(EV.UNLOCK_VIEWED, { requested });
  }, [requested]);

  // Select a plan: record the choice, then move the visitor to the checkout
  // panel and focus its heading so the change is perceivable (incl. for AT).
  const selectTier = (id) => {
    setSelectedTier(id);
    // A refusal names the plan it was about; it must not linger over another one.
    setCheckoutError("");
    setAlreadyHasPlan(false);
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
    const res = await captureLead({ email, source: "unlock", referralCode: getReferralCode() });
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
    setAlreadyHasPlan(false);
    track(EV.CHECKOUT_STARTED, { tier: selectedTier });
    // The access token is how the server recognises a signed-in buyer: it is what
    // earns the upgrade credit the panel above previews, and what lets the server
    // say the account already holds this plan. This page used to send none, so a
    // signed-in buyer was charged as a stranger. Signed out, it is "" and the
    // request is anonymous, exactly as before.
    //
    // Only a buyer this page shows as signed in sends a token, so the account the
    // price was quoted for is the account that is charged; and the amount the
    // button shows goes with the request, so the server refuses a charge that
    // would differ from it (price_changed) rather than take a different sum.
    const token = currentUser() ? await accessToken() : "";
    const res = await startCheckout({ tier: selectedTier, email, referralCode: getReferralCode(), accessToken: token, expectedDueCents: dueCents ?? undefined });
    if (!res.ok) {
      setLoading(false);
      if (res.code === PRICE_CHANGED) {
        track(EV.CHECKOUT_FAILED, { tier: selectedTier, error: PRICE_CHANGED });
        setQuoteRefresh((n) => n + 1);
        setCheckoutError(res.message || "The price for your account changed, so nothing was charged. The button now shows the current price.");
        return;
      }
      const alreadyHas = res.code === ALREADY_HAS_PLAN;
      console.error("Checkout failed:", res.error);
      track(EV.CHECKOUT_FAILED, { tier: selectedTier, error: alreadyHas ? ALREADY_HAS_PLAN : res.error });
      setAlreadyHasPlan(alreadyHas);
      setCheckoutError(
        alreadyHas
          ? res.message || "Your account already has this plan or a higher one, so there is nothing to pay for."
          : "Payment could not be started. Please try again."
      );
      return;
    }
    window.location.assign(res.url);
  };

  const selected = planById(selectedTier);
  const selectedCovered = Boolean(heldPlan) && selected.rank <= heldPlan.rank;
  // The signed-in buyer's price is checkout's quote. While it has not arrived no
  // credit line is shown: the panel may understate a discount for a moment, never
  // overstate one, which is the direction the endpoint itself takes.
  const quote = useCheckoutQuote(signedIn && !selectedCovered ? selected.id : null, quoteRefresh);
  const credit = quote?.ok ? quote.creditCents : 0;
  // A figure to pay is printed only when it is the figure checkout will charge:
  // the list price for a signed-out buyer (the server charges an anonymous caller
  // exactly that), and the quote for a signed-in one. No quote yet, or none at
  // all, means no figure (RC4a review).
  const dueCents = !signedIn ? selected.priceCents : quote?.ok ? quote.dueCents : null;
  // The server says this account already holds the plan: say so, as the held-plan
  // panel does, instead of asking for an email and a payment.
  const quoteHeld = Boolean(signedIn) && quote && !quote.ok && quote.code === ALREADY_HAS_PLAN;

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl">
        <div className="max-w-3xl mb-12">
          <h1 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.02] mb-5">
            Plans and pricing.
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed">
            Every plan includes one year of access and a 48 hour full refund.
          </p>
          {heldPlan && (
            <p data-held-plan={heldPlan.id} className="mt-4 text-paper text-sm sm:text-base leading-relaxed flex items-start gap-2">
              <FiCheck className="text-accent mt-1 shrink-0" aria-hidden />
              <span>
                Your account already has {heldPlan.name}.{" "}
                <Link to="/dashboard" className="font-medium text-accent underline underline-offset-2">
                  Go to your portal
                </Link>
              </span>
            </p>
          )}
          {partnerWaiting && (
            <p data-partner-waiting className="mt-4 text-paper text-sm sm:text-base leading-relaxed flex items-start gap-2">
              <FiCheck className="text-accent mt-1 shrink-0" aria-hidden />
              <span>
                You started sponsored access in this browser. Finish it before you choose a plan: if it covers
                you, the Golden plan costs you nothing.{" "}
                <Link to={PARTNER_ENTRY_PATH} className="font-medium text-accent underline underline-offset-2">
                  Finish your sponsored access
                </Link>
              </span>
            </p>
          )}
        </div>

        {/* Plan cards */}
        <ul className="grid md:grid-cols-3 gap-5 lg:gap-6 items-stretch mb-12">
          {PLANS.map((p) => {
            const isSelected = selectedTier === p.id;
            const held = heldPlan?.id === p.id;
            const included = !held && Boolean(heldPlan) && heldPlan.rank > p.rank;
            const featured = Boolean(p.featured);
            const ink = featured ? "text-white" : "text-paper";
            const dim = featured ? "text-white/70" : "text-paper-dim";
            return (
              <li
                key={p.id}
                className={`lift relative rounded-[1.5rem] p-7 sm:p-8 flex flex-col ${ featured ?"bg-forest-deep text-white shadow-[0_40px_80px_-40px_rgba(31,68,50,0.7)]":"bg-canvas border border-stroke"} ${isSelected ? (featured ?"ring-2 ring-gold":"ring-2 ring-accent") :""}`}
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
                {held || included ? (
                  <p
                    data-plan-held={held ? "held" : "included"}
                    className={`mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border ${featured ? "border-white/40 text-white" : "border-stroke text-paper"}`}
                  >
                    <FiCheck aria-hidden /> {held ? `You have ${p.name}` : `Included in your ${heldPlan.name}`}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectTier(p.id)}
                    aria-pressed={isSelected}
                    className={`mt-6 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${ featured ?"bg-white text-forest-deep hover:bg-mist":"bg-accent text-accent-fg hover:bg-accent-dim"}`}
                  >
                    {isSelected ? "Selected, continue below" : `Choose ${p.name}`} <FiArrowRight />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="grid md:grid-cols-2 gap-4 mb-14 text-sm text-paper-dim leading-relaxed">
          <p className="bg-surface-1-solid rounded-2xl p-5">
            <span className="text-paper font-semibold">Upgrade any time.</span> Money you paid for a plan comes off the next one up: after buying Golden, Platinum is $200, and after buying Platinum, Concierge is $221. Access a city sponsors, or one ADUAtlas grants, is not a payment, so it carries no credit.
            {!signedIn && (
              <>
                {" "}
                Bought a plan before?{" "}
                <Link to={`/login?next=${encodeURIComponent(`/unlock?tier=${selectedTier}`)}`} data-unlock-login-for-credit className="font-medium text-accent underline underline-offset-2">
                  Log in first
                </Link>{" "}
                so what you paid comes off.
              </>
            )}
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
              {dueCents == null ? null : credit > 0 ? (
                <>
                  <s>{formatPrice(selected.priceCents)}</s> {formatPrice(dueCents)} after your {formatPrice(credit)} credit
                </>
              ) : (
                <>{formatPrice(dueCents)} one time</>
              )}
            </span>
          </div>
          <p className="text-paper-dim text-sm mb-6">{selected.tagline}</p>

          {quoteHeld && !selectedCovered ? (
            <p data-buy-covered={selected.id} role="status" className="bg-canvas border border-stroke rounded-xl p-5 text-sm text-paper leading-relaxed">
              {quote.message || `Your account already has ${selected.name} or a higher plan, so there is nothing to pay for.`}{" "}
              <Link to="/dashboard" className="font-medium text-accent underline underline-offset-2">
                Go to your portal
              </Link>
            </p>
          ) : selectedCovered ? (
            // The same fact the plan cards show: this account already has the
            // plan, or one above it. api/create-checkout.js would refuse the
            // purchase anyway; this does not ask for an email and a payment first.
            <p data-buy-covered={selected.id} role="status" className="bg-canvas border border-stroke rounded-xl p-5 text-sm text-paper leading-relaxed">
              {heldPlan.id === selected.id
                ? `Your account already has ${selected.name}, so there is nothing to pay for.`
                : `${selected.name} is included in your ${heldPlan.name}, so there is nothing to pay for.`}{" "}
              <Link to="/dashboard" className="font-medium text-accent underline underline-offset-2">
                Go to your portal
              </Link>
            </p>
          ) : !emailSubmitted ? (
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
                <button type="submit" className="px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press">
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
                    className="w-full inline-flex items-center justify-center gap-2 px-7 py-5 rounded-xl bg-accent text-accent-fg text-lg font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60 press"
                  >
                    <FiLock /> {loading ? "Redirecting…" : dueCents != null ? `Pay ${formatPrice(dueCents)}` : "Continue to payment"}
                  </button>
                  {checkoutError &&
                    (alreadyHasPlan ? (
                      <p role="status" data-testid="checkout-already-has-plan" className="text-center text-sm text-paper leading-relaxed">
                        {checkoutError}{" "}
                        <Link to="/dashboard" className="font-medium text-accent underline underline-offset-2">
                          Go to your portal
                        </Link>
                      </p>
                    ) : (
                      <p role="alert" className="text-center text-xs text-red-500">
                        {checkoutError}
                      </p>
                    ))}
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
            48 hour full refund. If ADUAtlas isn't useful within 48 hours of purchase, we refund in full, no questions asked.
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
