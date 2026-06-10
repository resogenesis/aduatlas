import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiLock, FiShield } from "react-icons/fi";
import { captureLead } from "../lib/supabase";
import { startCheckout, checkoutEnabled } from "../lib/checkout";
import { sendEmail, TEMPLATES } from "../lib/email";
import { EV, identify, track } from "../lib/analytics";
import { loadAnswers } from "../stores/quizStore";

const SUPPORT_EMAIL = "hello@aduatlas.com";

// 3-tier ADU readiness ladder. Free Explorer / $99 Build Prepared / $399
// Property Feasibility Report. Concierge stays in the sidebar (application-only).

const tiers = [
  {
    id: "free",
    name: "ADU Explorer",
    price: "Free",
    pricePeriod: "",
    pitch: "Tier 1",
    desc: "See if the ADU course is right for you. Just sign up at no cost.",
    confidence: "Know your options before you spend a dollar.",
    bullets: [
      "Property Snapshot",
      "Reality Check Quiz (how much do you know?)",
      "FAQ (answers to common ADU questions)",
      "ADU Types, with descriptions and photos",
    ],
    cta: "Start free",
    ctaTo: "/property",
  },
  {
    id: "roadmap",
    name: "ADU Build Prepared",
    price: "$99",
    pricePeriod: "one time",
    pitch: "Tier 2",
    desc: "The ADUAtlas course shows you what to know before spending significant time and money on an ADU — how the process works, how to avoid costly mistakes, and why a feasibility study matters.",
    confidence: "Reduce costly mistakes and prepare with confidence.",
    bullets: [
      "Everything in Tier 1",
      "The 10-module ADUAtlas course",
      "Understand the full ADU process end to end",
      "Learn what a realistic budget must include",
      "Direct email support",
      "$99 credit toward your Property Feasibility Report upgrade (valid within 90 days)",
    ],
    highlight: false,
  },
  {
    id: "report",
    name: "Property Feasibility Report",
    price: "$399",
    pricePeriod: "one time",
    pitch: "Tier 3",
    desc: "Everything in Tiers 1 & 2, plus four dynamic worksheets and a feasibility study — the information builders, suppliers, and city staff commonly need to move your ADU forward.",
    confidence: "Find out what you can build, with a realistic preliminary estimate, before you talk to builders.",
    bullets: [
      "Everything in Tiers 1 & 2, including the 10-module course",
      "One-page feasibility diagram — largest potential ADU footprint, up to 1,200 sq. ft.",
      "GIS property snapshot overlaid with local ADU regs: primary structure, ADU placement, setbacks, approximate utilities (with legend)",
      "Dynamic spreadsheet: pre-site cost estimates, utility connections, and site considerations",
      "Pre-filled spreadsheet: estimated builder, permit, inspection, and city timelines",
      "Pre-filled builder questionnaire to obtain accurate quotes",
      "Contact for a professional utility-locate service",
      "National Property ADU Ready Score (A‑F), 20 questions derived from your packet, for homeowners and Realtors",
    ],
    highlight: true,
    badge: "Most popular",
  },
];

const conciergePoints = [
  "60-min planning consult with an ADU specialist",
  "Independent review of your Property Feasibility Report",
  "Curated introductions to vetted designers, lenders, builders",
  "Ongoing question-answering through pre-construction",
];

const Unlock = () => {
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState("report");
  const buyHeadingRef = useRef(null);

  useEffect(() => {
    track(EV.UNLOCK_VIEWED);
  }, []);

  // Select a paid tier: record the choice, then move the user to the checkout
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

    // Persist lead. captureLead returns { ok:false, error:"supabase-disabled" }
    // in the mock phase — that's expected; only surface a real write failure.
    const quizAnswers = loadAnswers();
    const res = await captureLead({ email, source: "unlock", quizAnswers });
    if (res && res.ok === false && res.error !== "supabase-disabled") {
      setEmailError("We couldn't save your email — please try again.");
      track(EV.EMAIL_CAPTURE_FAILED, { tier: selectedTier });
      return;
    }
    identify(email, { email });
    track(EV.EMAIL_CAPTURED, { tier: selectedTier });
    // Fire transactional email (no-op when Resend isn't wired yet). Deep-link
    // back to the buy panel with the selected tier.
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
    const quizAnswers = loadAnswers();
    const res = await startCheckout({ tier: selectedTier, email, quizAnswers });
    if (!res.ok) {
      setLoading(false);
      // Keep raw cause out of the buyer-facing UI; log for diagnostics.
      console.error("Checkout failed:", res.error);
      track(EV.CHECKOUT_FAILED, { tier: selectedTier, error: res.error });
      setCheckoutError("Payment could not be started. Please try again.");
      return;
    }
    window.location.href = res.url;
  };

  const selected = tiers.find((t) => t.id === selectedTier);

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl">

        <div className="text-center mb-14 max-w-3xl mx-auto">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5">
            Sign Up
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            From ADU-curious <span className="italic">to build-ready.</span>
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed">
            Pick the depth of preparation that matches where you are — exploring your options, getting serious about the course, or ready to talk to builders.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid md:grid-cols-3 gap-px bg-stroke rounded-3xl overflow-hidden mb-10">
          {tiers.map((t) => {
            const isSelected = t.id !== "free" && selectedTier === t.id;
            return (
              <div
                key={t.id}
                className={`flex flex-col h-full p-7 sm:p-9 transition-colors ${
                  t.highlight ? "bg-accent text-accent-fg" : "bg-surface-1-solid"
                } ${isSelected ? (t.highlight ? "ring-2 ring-inset ring-accent-fg" : "ring-2 ring-inset ring-accent") : ""}`}
              >
                <div className="h-6 mb-4 flex items-center gap-2">
                  {t.badge && (
                    <span className={`inline-block text-[0.65rem] font-semibold rounded-full px-2 py-0.5 uppercase tracking-wider ${
                      t.highlight ? "bg-accent-fg/15 text-accent-fg" : "bg-accent text-accent-fg"
                    }`}>
                      {t.badge}
                    </span>
                  )}
                  {isSelected && (
                    <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider ${t.highlight ? "text-accent-fg" : "text-accent"}`}>
                      <FiCheck className="text-xs" /> Selected
                    </span>
                  )}
                </div>
                <p className={`text-xs uppercase tracking-[0.18em] mb-2 ${t.highlight ? "text-accent-fg/70" : "text-paper-dim"}`}>
                  {t.pitch}
                </p>
                <h3 className={`font-display text-2xl sm:text-3xl mb-4 leading-tight text-balance min-h-[3.75rem] sm:min-h-[4.75rem] ${t.highlight ? "text-accent-fg" : "text-paper"}`}>
                  {t.name}
                </h3>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className={`font-display text-4xl sm:text-5xl ${t.highlight ? "text-accent-fg" : "text-paper"}`}>
                    {t.price}
                  </span>
                  {t.pricePeriod && (
                    <span className={`text-xs ${t.highlight ? "text-accent-fg/70" : "text-paper-dim"}`}>
                      {t.pricePeriod}
                    </span>
                  )}
                </div>
                <p className={`text-sm mb-3 italic ${t.highlight ? "text-accent-fg/80" : "text-paper-dim"}`}>
                  {t.confidence}
                </p>
                {t.desc && (
                  <p className={`text-xs leading-relaxed mb-6 ${t.highlight ? "text-accent-fg/75" : "text-paper-dim/85"}`}>
                    {t.desc}
                  </p>
                )}
                <ul className="grow space-y-3 mb-7">
                  {t.bullets.map((b) => (
                    <li
                      key={b}
                      className={`flex items-start gap-2 text-sm leading-relaxed ${
                        t.highlight ? "text-accent-fg/85" : "text-paper-dim"
                      }`}
                    >
                      <FiCheck className={`shrink-0 mt-0.5 ${t.highlight ? "text-accent-fg" : "text-accent"}`} />
                      <span>
                        {b}
                        {t.id === "roadmap" && b.includes("10-module") && (
                          <>
                            {" "}
                            <Link
                              to="/course-outline"
                              className="inline-flex items-center gap-1 py-1 -my-1 text-accent hover:text-paper font-medium transition-colors"
                            >
                              See the full outline <FiArrowRight className="text-[0.65rem]" />
                            </Link>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {t.id === "free" ? (
                  <Link
                    to={t.ctaTo}
                    className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1-solid rounded transition"
                  >
                    {t.cta} <FiArrowRight />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectTier(t.id)}
                    aria-pressed={isSelected}
                    className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      t.highlight
                        ? "bg-accent-fg text-accent hover:opacity-90 focus-visible:ring-accent-fg focus-visible:ring-offset-accent"
                        : "bg-accent text-accent-fg hover:bg-paper focus-visible:ring-accent focus-visible:ring-offset-surface-1-solid"
                    }`}
                  >
                    {isSelected ? (
                      <>Selected — go to checkout <FiArrowRight /></>
                    ) : (
                      <>Choose {t.price} <FiArrowRight /></>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Buy panel */}
        <div id="buy" className="grid lg:grid-cols-3 gap-6 scroll-mt-24">
          <div className="lg:col-span-2 bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10">
            <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-2">
              Step 2 · Checkout
            </p>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-6">
              <h2
                ref={buyHeadingRef}
                tabIndex={-1}
                aria-live="polite"
                className="font-display text-paper text-2xl sm:text-3xl outline-none"
              >
                {selected.name}
              </h2>
              <span className="text-paper-dim text-sm">{selected.price} {selected.pricePeriod}</span>
            </div>

            {!emailSubmitted ? (
              <form onSubmit={submitEmail} className="space-y-3" noValidate>
                <label htmlFor="unlock-email" className="block text-paper text-xs font-medium tracking-[0.15em] uppercase mb-2">
                  Email to start
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
                  <button
                    type="submit"
                    className="px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1-solid"
                  >
                    Continue
                  </button>
                </div>
                {emailError && (
                  <p id="unlock-email-error" role="alert" className="text-xs text-red-400 mt-1">
                    {emailError}
                  </p>
                )}
                <p className="text-xs text-paper-dim mt-2">
                  Receipt + access link will go to this address.
                </p>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="bg-canvas border border-stroke rounded-xl p-4 flex items-center gap-3">
                  <FiCheck className="text-accent text-xl shrink-0" />
                  <div className="text-sm">
                    <span className="text-paper font-medium">Email saved.</span>{" "}
                    <span className="text-paper-dim">{email}</span>
                  </div>
                </div>
                {checkoutEnabled ? (
                  <>
                    <button
                      onClick={handleCheckout}
                      disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-7 py-5 rounded-full bg-accent text-accent-fg text-lg font-semibold hover:bg-paper transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1-solid"
                    >
                      <FiLock /> {loading ? "Redirecting…" : `Pay ${selected.price}`}
                    </button>
                    {checkoutError && (
                      <p role="alert" className="text-center text-xs text-red-400">{checkoutError}</p>
                    )}
                    <p className="text-center text-xs text-paper-dim flex items-center justify-center gap-1.5">
                      <FiShield /> Secure checkout · Powered by Stripe · 256-bit encryption
                    </p>
                  </>
                ) : (
                  <div className="bg-canvas border border-stroke rounded-xl p-5 text-sm text-paper-dim leading-relaxed">
                    <span className="text-paper font-medium">You're on the list.</span> Checkout is opening soon — we'll email <span className="text-paper">{email}</span> the moment {selected.name} is available to purchase.
                  </div>
                )}
              </div>
            )}

            <p className="text-paper-dim text-xs leading-relaxed mt-6 italic">
              7 day full refund. If the system isn't useful within 7 days, we refund in full, no questions asked.
            </p>
            <p className="text-paper-dim/70 text-[0.65rem] leading-relaxed mt-3">
              ADUAtlas provides verified pre-construction guidance, not legal advice, engineering, appraisal, or permit determination. Always confirm with your city, a licensed architect or engineer, and a qualified contractor before committing to a design. <Link to="/methodology" className="underline-offset-2 hover:underline hover:text-paper-dim transition">Read our methodology →</Link>
            </p>
          </div>

          {/* Concierge sidebar */}
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
            <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
              Need execution help?
            </p>
            <h3 className="font-display text-paper text-xl sm:text-2xl mb-3">
              Guided Concierge
            </h3>
            <p className="text-paper-dim text-sm leading-relaxed mb-5">
              For homeowners who want a real human to walk through the report, vet the plan, and hand them off to vetted pros.
            </p>
            <ul className="space-y-2 mb-6">
              {conciergePoints.map((p) => (
                <li key={p} className="flex items-start gap-2 text-paper-dim text-sm">
                  <FiCheck className="shrink-0 mt-0.5 text-accent" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Guided Concierge inquiry")}`}
              onClick={() => track(EV.CONCIERGE_CLICKED)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-stroke text-paper hover:border-accent hover:text-accent transition text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1-solid"
            >
              Talk to a specialist
            </a>
            <p className="text-paper-dim/70 text-xs italic text-center mt-3">
              Application-only · pricing on call
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Unlock;
