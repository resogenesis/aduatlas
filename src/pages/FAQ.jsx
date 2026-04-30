import Accordion from "../components/common/Accordion";
import PublicStubFooter from "../components/funnel/PublicStubFooter";

// Public-facing FAQ — designed to surface gaps, NOT answer them.
// The full 22-entry version with answers, IRC bullets, and the lot diagram
// lives inside the paid course at /course/c4 (Regulations chapter).

const faqs = [
  {
    q: "Do you actually know what your city allows on your lot?",
    a: (
      <p>
        Most homeowners assume "ADUs are legal here" means their plan will work. They don't. Cities cap ADU size as a percentage of the primary home, set specific setbacks, restrict height, and change the rules regularly. Many discover the conflict only after they've already paid a builder to draw plans.
      </p>
    ),
  },
  {
    q: "Have you accounted for site prep and utility hookups?",
    a: (
      <p>
        Builder ADU prices typically cover the structure — not the sewer tie-in, water and gas trenching, stormwater drainage, foundation prep, or grading. These regularly add $10,000 to $100,000+ on top. Most homeowners only discover this after construction starts.
      </p>
    ),
  },
  {
    q: "Will your HOA actually let you build an ADU?",
    a: (
      <p>
        Even when zoning permits an ADU, your HOA's CC&Rs can override and block it. Some HOAs require architectural review; others have blanket prohibitions. This is one of the most common late-stage surprises.
      </p>
    ),
  },
  {
    q: "Are you ready to compare builder quotes — or just collect them?",
    a: (
      <p>
        Without a defined scope, lot dimensions, and a clear specification, every builder gives you a different number for a different scope. Comparing those quotes is impossible. The fix isn't more quotes; it's a feasibility study and an apples-to-apples spec sheet.
      </p>
    ),
  },
  {
    q: "Do you know the difference between state and city ADU rules?",
    a: (
      <p>
        States generally set the structural code (the IRC). Cities set the zoning — what, where, and how big. Both apply, and they conflict more often than people expect. Knowing which authority decides what saves weeks of back-and-forth.
      </p>
    ),
  },
  {
    q: "Will your project taxes, permits, and impact fees actually fit your budget?",
    a: (
      <p>
        Property taxes usually rise. Permit, plan-check, school, and impact fees vary widely by city — sometimes by tens of thousands. These are almost never in the advertised "ADU price." If you don't know your local numbers, your budget is a guess.
      </p>
    ),
  },
];

const FAQ = () => {
  return (
    <div>
      <section className="bg-white py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl text-center">
          <p className="text-[#2F5D50] font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3 uppercase">
            Six questions every ADU homeowner should answer first
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary leading-tight">
            Most ADU projects fail in the questions you didn't ask.
          </h1>
          <p className="mt-5 text-secondary text-sm sm:text-base leading-relaxed">
            Answer these honestly. If even one of them gives you pause, you have a real risk in your project — and you're not alone. The full system walks you through each one.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-3xl">
        <Accordion items={faqs} />
      </section>

      <PublicStubFooter chapterName="Full answers — Chapter 4" />
    </div>
  );
};

export default FAQ;
