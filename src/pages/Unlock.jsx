import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowRight, FiCheck, FiLock, FiShield } from "react-icons/fi";
import { captureLead } from "../lib/supabase";
import { startCheckout } from "../lib/checkout";
import { EV, identify, track } from "../lib/analytics";
import { loadAnswers } from "../funnel/quizStore";

// 4-tier confidence ladder. Free / $79 Roadmap / $399 Builder-Ready Report /
// Concierge (sidebar CTA, sold-by-application — not self-serve).

const tiers = [
  {
    id: "free",
    name: "Explorer",
    price: "Free",
    pricePeriod: "",
    pitch: "I'm curious",
    confidence: "Honest uncertainty",
    bullets: [
      "Address-based property snapshot",
      "Estimated lot size, max ADU, setbacks",
      "Cost range with confidence labels",
      "Public city + state ADU summaries",
    ],
    cta: "Try the address check",
    ctaTo: "/",
  },
  {
    id: "roadmap",
    name: "Personalized Roadmap",
    price: "$79",
    pricePeriod: "one-time",
    pitch: "I want direction",
    confidence: "A clear next-step plan",
    bullets: [
      "Everything in Explorer",
      "Personalized roadmap based on your lot, budget, and goals",
      "Pre-filled property worksheet (your project brief)",
      "Saved scenarios + take-home summary",
      "Email support",
      "$79 credits toward the Builder-Ready Report if you upgrade within 30 days",
    ],
    cta: "Start the Roadmap",
    ctaTo: "#buy",
    highlight: false,
  },
  {
    id: "report",
    name: "Builder-Ready Report",
    price: "$399",
    pricePeriod: "one-time",
    pitch: "I want confidence",
    confidence: "Verified, builder-ready clarity",
    bullets: [
      "Everything in Roadmap",
      "Property snapshot, verified against city + parcel records",
      "What you can build: sized envelope + 2–3 ADU type options",
      "Cost breakdown with line-item budget and ±20% bands",
      "Risk register: site, utility, HOA, financing, permitting",
      "Financing pathways with grants applicable to your ZIP",
      "Specific next 3 steps (named, sequenced)",
      "Builder Packet (PDF): apples-to-apples RFP for builders",
      "7-day full refund",
    ],
    cta: "Get my Builder-Ready Report",
    ctaTo: "#buy",
    highlight: true,
    badge: "Most popular",
  },
];

const conciergePoints = [
  "60-min planning consult with an ADU specialist",
  "Independent review of your Builder-Ready Report",
  "Curated introductions to vetted designers, lenders, builders",
  "Ongoing question-answering through pre-construction",
];

const Unlock = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState("report");

  useEffect(() => {
    track(EV.UNLOCK_VIEWED);
  }, []);

  useEffect(() => {
    track(EV.TIER_SELECTED, { tier: selectedTier });
  }, [selectedTier]);

  const submitEmail = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    // Persist lead. No-op when Supabase env vars aren't set.
    const quizAnswers = loadAnswers();
    await captureLead({ email, source: "unlock", quizAnswers });
    identify(email, { email });
    track(EV.EMAIL_CAPTURED, { tier: selectedTier });
    setEmailSubmitted(true);
  };

  const handleCheckout = async () => {
    setLoading(true);
    track(EV.CHECKOUT_STARTED, { tier: selectedTier });
    const quizAnswers = loadAnswers();
    const res = await startCheckout({ tier: selectedTier, email, quizAnswers });
    if (!res.ok) {
      setLoading(false);
      alert(`Checkout failed: ${res.error}. Set VITE_CHECKOUT_ENDPOINT in .env.local.`);
      return;
    }
    if (res.mock) {
      // Mock fallback: navigate within the SPA.
      navigate(res.url);
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
            Pick your confidence level
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            Turn curiosity <span className="italic">into a buildable plan.</span>
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed">
            You're not paying for content. You're paying for confidence: verified data, named next steps, and a packet builders can actually quote against.
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid lg:grid-cols-3 gap-px bg-stroke rounded-3xl overflow-hidden mb-10">
          {tiers.map((t) => (
            <button
              key={t.id}
              onClick={() => t.id !== "free" && setSelectedTier(t.id)}
              className={`text-left p-7 sm:p-9 transition-colors ${
                t.highlight ? "bg-accent text-accent-fg" : "bg-surface-1-solid"
              } ${t.id !== "free" && selectedTier === t.id && !t.highlight ? "ring-2 ring-accent ring-inset" : ""}`}
            >
              {t.badge && (
                <span className={`inline-block text-[0.65rem] font-semibold rounded-full px-2 py-0.5 uppercase tracking-wider mb-4 ${
                  t.highlight ? "bg-accent-fg/15 text-accent-fg" : "bg-accent text-accent-fg"
                }`}>
                  {t.badge}
                </span>
              )}
              <p className={`text-xs uppercase tracking-[0.15em] mb-2 ${t.highlight ? "text-accent-fg/70" : "text-paper-dim"}`}>
                {t.pitch}
              </p>
              <h3 className={`font-display text-2xl sm:text-3xl mb-3 ${t.highlight ? "text-accent-fg" : "text-paper"}`}>
                {t.name}
              </h3>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`font-display text-4xl sm:text-5xl ${t.highlight ? "text-accent-fg" : "text-paper"}`}>
                  {t.price}
                </span>
                {t.pricePeriod && (
                  <span className={`text-xs ${t.highlight ? "text-accent-fg/70" : "text-paper-dim"}`}>
                    {t.pricePeriod}
                  </span>
                )}
              </div>
              <p className={`text-sm mb-6 italic ${t.highlight ? "text-accent-fg/80" : "text-paper-dim"}`}>
                {t.confidence}
              </p>
              <ul className="space-y-2.5 mb-7">
                {t.bullets.map((b) => (
                  <li
                    key={b}
                    className={`flex items-start gap-2 text-sm leading-relaxed ${
                      t.highlight ? "text-accent-fg/85" : "text-paper-dim"
                    }`}
                  >
                    <FiCheck className={`shrink-0 mt-0.5 ${t.highlight ? "text-accent-fg" : "text-accent"}`} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {t.id === "free" ? (
                <Link
                  to="/"
                  className={`inline-flex items-center gap-2 text-sm font-medium ${t.highlight ? "text-accent-fg" : "text-accent hover:text-paper"}`}
                >
                  {t.cta} <FiArrowRight />
                </Link>
              ) : (
                <span
                  className={`inline-flex items-center gap-2 text-sm font-medium ${
                    selectedTier === t.id ? "" : "opacity-70"
                  } ${t.highlight ? "text-accent-fg" : "text-accent"}`}
                >
                  {selectedTier === t.id ? "Selected" : "Choose this"} <FiArrowRight />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Buy panel */}
        <div id="buy" className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10">
            <div className="flex items-baseline gap-3 mb-6">
              <h2 className="font-display text-paper text-2xl sm:text-3xl">{selected.name}</h2>
              <span className="text-paper-dim text-sm">{selected.price} {selected.pricePeriod}</span>
            </div>

            {!emailSubmitted ? (
              <form onSubmit={submitEmail} className="space-y-3">
                <label className="block text-paper text-xs font-medium tracking-[0.15em] uppercase mb-2">
                  Email to start
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="flex-1 px-5 py-4 bg-canvas border border-stroke rounded-xl text-paper placeholder:text-paper-dim/60 focus:outline-none focus:border-accent transition"
                  />
                  <button
                    type="submit"
                    className="px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
                  >
                    Continue
                  </button>
                </div>
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
                <button
                  onClick={handleCheckout}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-7 py-5 rounded-full bg-accent text-accent-fg text-lg font-semibold hover:bg-paper transition-colors disabled:opacity-60"
                >
                  <FiLock /> {loading ? "Redirecting…" : `Pay ${selected.price}`}
                </button>
                <p className="text-center text-xs text-paper-dim flex items-center justify-center gap-1.5">
                  <FiShield /> Secure checkout · Stripe integration pending
                </p>
              </div>
            )}

            <p className="text-paper-dim text-xs leading-relaxed mt-6 italic">
              7-day full refund. If the system isn't useful within 7 days, we refund in full, no questions asked.
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
            <button
              onClick={() => alert("INTEGRATION POINT: open intake form / Calendly for the Concierge waitlist.")}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-stroke text-paper hover:border-accent hover:text-accent transition text-sm font-medium"
            >
              Talk to a specialist
            </button>
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
