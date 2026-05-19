import Accordion from "../components/common/Accordion";
import PublicStubFooter from "../components/funnel/PublicStubFooter";

const faqs = [
  {
    q: "Do you know the ADU regulations for your city and ZIP code?",
    a: (
      <p>
        Many homeowners assume "ADUs are legal here" means their plan will work. Not always. Cities cap ADU size as a percentage of the primary home, set specific setbacks, restrict height, and change the rules. Many discover the conflict only after they've already decided on a particular ADU. You need a feasibility study completed before you know what size ADU to build.
      </p>
    ),
  },
  {
    q: "Have you accounted for site prep and utility hookup costs?",
    a: (
      <p>
        Builder ADU prices typically cover the structure, not the sewer tie in, water and gas trenching, stormwater drainage, foundation prep, or grading. These regularly add $10,000 to $100,000+ on top. Homeowners need these estimates before they begin a project.
      </p>
    ),
  },
  {
    q: "Will your HOA allow an ADU on your property?",
    a: (
      <p>
        Even if local zoning allows an ADU, your HOA's CC&Rs can override city and state regulations. Some HOAs require architectural review; others have blanket prohibitions. This is a common late stage surprise. Most homeowners know how flexible their own HOA can be. If you don't, the ADU course shows you how to determine whether an HOA or a city prohibits ADUs on a particular street. Always verify local ADU zoning with your city. The carpenter's rule: measure twice, cut once.
      </p>
    ),
  },
  {
    q: "Are you prepared to speak with a builder?",
    a: (
      <p>
        Without a defined scope, lot dimensions, ADU size, placement, and a realistic pre site estimate, a builder cannot give you an accurate total estimate or clear specifications. Only a realistic feasibility study will prepare you and provide general estimates for everything. When you collect 3 bids, you'll know what should be included so there are no surprises. An average survey runs $600 to $1,200. Save time and money with the ADUAtlas feasibility study tailored to your property and your ZIP code's ADU regulations.
      </p>
    ),
  },
  {
    q: "Do you know the difference between state and city ADU rules?",
    a: (
      <p>
        States generally mandate the structural code (the IRC). Cities set the zoning: what, where, and how big. Both apply, and while they rarely conflict, it's better to know before you begin. Knowing which authority decides what saves weeks of back and forth. Ask your builder how they meet or exceed your state's IRC code. The course identifies which elements matter most.
      </p>
    ),
  },
  {
    q: "Will your total ADU budget (pre site, permits, structure) match your actual budget?",
    a: (
      <p>
        Do you have a realistic all in budget that includes an official survey, a pre site plan for utilities, foundations, permits, excavating, plus the total ADU cost with setup, delivery, and timelines? Some builders can provide everything, and some do it well. Either way, it makes sense to know what to expect before collecting 3 quotes. Start with the $99 course to understand the process, learn about ADU types, and prep the right way. Then get the $399 feasibility study (the $99 applies as credit). After the course and feasibility study you may change your mind, or find the ADU tiny home of your dreams.
      </p>
    ),
  },
];

const FAQ = () => {
  return (
    <div>
      <section className="bg-canvas py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl text-center">
          <p className="text-accent font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3 uppercase">
            Free FAQ
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-paper leading-tight">
            Six questions every ADU homeowner should know before contacting a builder or city.
          </h1>
          <p className="mt-5 text-paper-dim text-sm sm:text-base leading-relaxed">
            Many ADU projects fail because of the questions homeowners never knew to ask. Answer these honestly. If even one gives you pause, you have a real risk in your project, and you're not alone. The $99 course covers these and 20+ other common questions you need answered before contacting a builder or your city.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-3xl">
        <Accordion items={faqs} />
      </section>

      <PublicStubFooter chapterName="Full answers · Chapter 4" />

      <section className="container mx-auto px-5 sm:px-8 max-w-3xl pb-16">
        <p className="text-paper-dim/70 text-xs italic leading-relaxed text-center">
          ADUAtlas strives to provide accurate information; verify everything before you act. Zoning and regulations change often. Refer to qualified professionals for taxes, building code, and variances.
        </p>
      </section>
    </div>
  );
};

export default FAQ;
