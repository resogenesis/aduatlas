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
    <div className="min-h-[80vh] bg-[#F4F7F6] py-12 sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 max-w-3xl">

        <div className="text-center mb-10">
          <p className="text-[#2F5D50] font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3">
            ADUATLAS PAID ACCESS
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-4">
            Unlock your full ADU plan for $79.99
          </h1>
          <p className="text-secondary text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            One-time payment. Lifetime access. Replaces a $500+ official survey and weeks of builder back-and-forth.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="bg-gradient-to-br from-[#0F3D33] to-[#1F6F57] px-6 sm:px-10 py-8 text-white">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-bold">$79.99</span>
              <span className="text-white/70 line-through text-sm">$500+ official survey</span>
            </div>
            <p className="text-white/90 text-sm">One-time · Lifetime access · No subscription</p>
          </div>

          <div className="px-6 sm:px-10 py-8">
            <h3 className="font-semibold text-primary text-lg mb-4">What's included</h3>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-8">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-secondary">
                  <FiCheck className="shrink-0 mt-0.5 text-[#2F5D50]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <h3 className="font-semibold text-primary text-lg mb-3">What we don't do (transparency)</h3>
            <ul className="space-y-2 mb-8">
              {excludes.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-secondary">
                  <FiX className="shrink-0 mt-0.5 text-gray-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {!emailSubmitted ? (
              <form onSubmit={submitEmail} className="space-y-3">
                <label className="block text-sm font-semibold text-primary">
                  Email to start
                  <span className="text-secondary font-normal ml-1">(we'll send your receipt + access link here)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#2F5D50] focus:ring-2 focus:ring-[#2F5D50]/20"
                  />
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-lg bg-[#2F5D50] text-white font-semibold hover:bg-[#244A40] transition"
                  >
                    Continue
                  </button>
                </div>
                {!hasQuiz && (
                  <p className="text-xs text-secondary">
                    Tip: <Link to="/quiz" className="underline">take the 2-minute quiz first</Link> so your feasibility study is personalized.
                  </p>
                )}
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#F4F7F6] rounded-lg p-4 flex items-center gap-3">
                  <FiCheck className="text-[#2F5D50] text-xl shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-primary">Email saved.</span>{" "}
                    <span className="text-secondary">{email}</span>
                  </div>
                </div>
                <button
                  onClick={startCheckout}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-[#2F5D50] text-white text-lg font-semibold hover:bg-[#244A40] transition disabled:opacity-60"
                >
                  <FiLock /> {loading ? "Redirecting…" : "Unlock for $79.99"}
                </button>
                <p className="text-center text-xs text-secondary flex items-center justify-center gap-1.5">
                  <FiShield /> Secure checkout · Mock for now — Stripe integration pending
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-10">
          <h3 className="font-semibold text-primary text-lg mb-5">Frequently asked</h3>
          <div className="space-y-5">
            {faqs.map((f) => (
              <div key={f.q}>
                <p className="font-semibold text-primary text-sm sm:text-base mb-1">{f.q}</p>
                <p className="text-secondary text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Unlock;
