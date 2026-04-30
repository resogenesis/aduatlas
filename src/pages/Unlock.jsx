import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiCheck, FiX, FiLock, FiShield } from "react-icons/fi";
import { loadAnswers } from "../funnel/quizStore";

const includes = [
  "Full structured course — 6 chapters, 20+ modules",
  "Personalized Feasibility Study based on your quiz answers",
  "GIS satellite view of your lot with dimensions",
  "Pre-filled pre-site cost estimate worksheet",
  "Total budget worksheet with timelines",
  "Refined National ADU Readiness Score",
  "Free utility-marking contact (locates water/gas/sewer access)",
  "Local + national builder & supplier matches by ZIP",
  "Builder-ready RFP packet (so quotes are comparable)",
];

const excludes = [
  "We do not sell or build ADUs",
  "We do not file permits on your behalf",
  "We do not guarantee permit approval or final pricing",
];

// Funnel FAQ — tension-inducing, designed to surface objections and push to checkout.
// (Public SEO FAQ lives at /faq with full answers.)
const faqs = [
  {
    q: "Is $79.99 a subscription?",
    a: "No. One-time payment, lifetime access. No recurring charges, no upsells.",
  },
  {
    q: "What if my city won't approve an ADU on my lot?",
    a: "That's exactly what the Feasibility Study answers — before you spend $500+ on an official survey. Most homeowners only find out after they've already paid a builder to design something.",
  },
  {
    q: "Can't I just figure this out myself for free?",
    a: "You can. It usually takes 40+ hours across city websites, builder calls, and forum threads — and most homeowners still miss site-prep costs, HOA restrictions, or zoning quirks. Your call on what your time is worth.",
  },
  {
    q: "Do you support my state?",
    a: "ADUAtlas covers all 50 states. Coverage depth is highest in CA, WA, and CO. Other states get the federal IRC baseline plus your city's posted rules.",
  },
  {
    q: "Refund policy?",
    a: "7-day full refund — if the system isn't useful within 7 days, email us and we refund in full, no questions asked.",
  },
];

const Unlock = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const answers = loadAnswers();
  const hasQuiz = Boolean(answers.zip);

  const submitEmail = (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    // INTEGRATION POINT (Supabase): insert {email, quiz_answers, created_at}
    // into `leads` table here.
    // INTEGRATION POINT (Resend): trigger "complete your plan" transactional
    // email after lead row is inserted.
    setEmailSubmitted(true);
  };

  const startCheckout = async () => {
    setLoading(true);

    // INTEGRATION POINT (Stripe): replace this mock with a fetch to your
    // Supabase edge function that creates a Stripe Checkout Session, then
    // window.location = session.url.
    //
    // Example:
    //   const res = await fetch('/api/create-checkout', {
    //     method: 'POST',
    //     body: JSON.stringify({ email, quizAnswers: answers })
    //   });
    //   const { url } = await res.json();
    //   window.location.href = url;
    //
    // For now: simulate the redirect by going straight to /welcome.
    await new Promise((r) => setTimeout(r, 600));
    navigate("/welcome");
  };

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-3xl">

        <div className="text-center mb-14">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5">
            ADUAtlas Paid Access
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            Unlock the full plan.
            <br />
            <span className="italic text-accent">$79.99</span>
          </h1>
          <p className="text-paper-dim text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            One-time payment. Lifetime access. Replaces a $500+ official survey and weeks of builder back-and-forth.
          </p>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl overflow-hidden mb-6">
          <div className="bg-accent text-accent-fg px-8 sm:px-12 py-9">
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-display text-6xl sm:text-7xl">$79.99</span>
              <span className="text-accent-fg/60 line-through text-sm">$500+ official survey</span>
            </div>
            <p className="text-accent-fg/80 text-sm">One-time · Lifetime access · No subscription</p>
          </div>

          <div className="px-8 sm:px-12 py-10">
            <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-5">What's included</h3>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-10">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-paper-dim">
                  <FiCheck className="shrink-0 mt-0.5 text-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-3">What we don't do</h3>
            <ul className="space-y-2 mb-10">
              {excludes.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-paper-dim">
                  <FiX className="shrink-0 mt-0.5 text-stroke" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {!emailSubmitted ? (
              <form onSubmit={submitEmail} className="space-y-3">
                <label className="block text-paper text-sm font-medium">
                  Email to start
                  <span className="text-paper-dim font-normal ml-1">(receipt + access link)</span>
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
                {!hasQuiz && (
                  <p className="text-xs text-paper-dim">
                    Tip: <Link to="/quiz" className="underline hover:text-paper">take the 2-minute quiz first</Link> so your study is personalized.
                  </p>
                )}
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
                  onClick={startCheckout}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-7 py-5 rounded-full bg-accent text-accent-fg text-lg font-semibold hover:bg-paper transition-colors disabled:opacity-60"
                >
                  <FiLock /> {loading ? "Redirecting…" : "Unlock for $79.99"}
                </button>
                <p className="text-center text-xs text-paper-dim flex items-center justify-center gap-1.5">
                  <FiShield /> Secure checkout · Mock for now — Stripe integration pending
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-12">
          <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-6">Frequently asked</h3>
          <div className="divide-y divide-stroke">
            {faqs.map((f) => (
              <div key={f.q} className="py-5 first:pt-0 last:pb-0">
                <p className="font-display text-paper text-base sm:text-lg mb-2">{f.q}</p>
                <p className="text-paper-dim text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Unlock;
