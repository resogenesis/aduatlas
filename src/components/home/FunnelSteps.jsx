import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

const steps = [
  {
    n: "1",
    title: "Take the 2-minute Reality Check",
    desc: "Answer 7 quick questions about your property, budget, and goals. No signup needed.",
  },
  {
    n: "2",
    title: "Get your free Readiness Score",
    desc: "See your personalized score and the top 3 risks specific to your situation.",
  },
  {
    n: "3",
    title: "Unlock your full plan — $79.99",
    desc: "Lifetime access to 6 chapters / 20+ modules, your Feasibility Study, GIS site plan, and a builder-ready RFP. 7-day refund.",
  },
];

const FunnelSteps = () => {
  return (
    <section className="bg-[#F4F7F6] py-14 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-[#2F5D50] font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3 uppercase">
            How it works
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary leading-snug">
            From "I'm curious" to builder-ready in three steps
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 sm:gap-6 mb-12">
          {steps.map((s) => (
            <div key={s.n} className="bg-white rounded-xl p-6 sm:p-7 relative">
              <span className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-[#2F5D50] text-white flex items-center justify-center font-bold shadow-md">
                {s.n}
              </span>
              <h3 className="font-semibold text-primary text-base sm:text-lg mb-2 mt-2">{s.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/quiz"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-md bg-[#2F5D50] text-white font-semibold hover:bg-[#244A40] transition shadow-sm"
          >
            Start the Reality Check <FiArrowRight />
          </Link>
          <p className="text-xs text-secondary mt-3">
            Takes ~2 minutes · No signup · No credit card to start
          </p>
        </div>
      </div>
    </section>
  );
};

export default FunnelSteps;
