import { useReveal } from "../../hooks/useReveal";

const risks = [
  {
    n: "01",
    title: "Most homeowners don't know what they can legally build.",
    desc: "ADU rules vary by state, city, and ZIP—and they change. Discovering zoning limits after your design is finalized is one of the biggest causes of wasted time and thousands in avoidable costs.",
  },
  {
    n: "02",
    title: "Site prep + utility hookups are often the biggest hidden ADU costs.",
    desc: "Grading, excavation, foundation work, access constraints, sewer, stormwater, water, gas, and trenching can add $10K–$100K+ beyond builder \"structure-only\" pricing.",
  },
  {
    n: "03",
    title: "Builders can't quote accurately without your property details.",
    desc: "Without lot dimensions, zoning limits, site conditions, and a clear project scope, most builder quotes are rough estimates and often lead to costly surprises later.",
  },
];

const RiskRow = ({ r, i }) => {
  const ref = useReveal(i * 100);
  return (
    <div
      ref={ref}
      className="group grid grid-cols-12 gap-4 sm:gap-8 py-8 sm:py-10 border-t border-stroke last:border-b transition-colors hover:bg-surface-1-solid/40"
    >
      <div className="col-span-12 sm:col-span-2 flex items-start">
        <span className="font-display text-paper-dim text-3xl sm:text-4xl group-hover:text-accent transition-colors">
          {r.n}
        </span>
      </div>
      <div className="col-span-12 sm:col-span-10">
        <h3 className="font-display font-medium text-paper text-xl sm:text-2xl lg:text-3xl leading-snug mb-3 sm:mb-4">
          {r.title}
        </h3>
        <p className="text-paper-dim text-base leading-relaxed max-w-2xl">
          {r.desc}
        </p>
      </div>
    </div>
  );
};

const RiskCallouts = () => {
  const headRef = useReveal(0);
  return (
    <section className="bg-canvas py-24 sm:py-32">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
        <div ref={headRef} className="mb-14 sm:mb-20 max-w-2xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Where projects derail
          </p>
          <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            The three things that <span className="italic">silently</span> kill ADU projects.
          </h2>
        </div>

        <div className="space-y-px">
          {risks.map((r, i) => <RiskRow key={r.n} r={r} i={i} />)}
        </div>
      </div>
    </section>
  );
};

export default RiskCallouts;
