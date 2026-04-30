const risks = [
  {
    n: "01",
    title: "Most homeowners don't know what they can legally build.",
    desc: "Zoning rules vary by state, city, and ZIP — and they change. Discovering this after your design is locked is the #1 source of thousands in wasted spend.",
  },
  {
    n: "02",
    title: "Site prep + utility hookups are the surprise cost killer.",
    desc: "Sewer ties, stormwater, trenching for water and gas — these regularly add $10K–$100K to a project that builders quoted on \"the structure only.\"",
  },
  {
    n: "03",
    title: "Builders can't quote accurately without your details.",
    desc: "Without lot dimensions, zoning constraints, and a clear scope, every quote is a rough guess. Comparing them apples-to-apples becomes impossible.",
  },
];

const RiskCallouts = () => {
  return (
    <section className="bg-canvas py-24 sm:py-32">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
        <div className="mb-14 sm:mb-20 max-w-2xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Where projects derail
          </p>
          <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            The three things that <span className="italic">silently</span> kill ADU projects.
          </h2>
        </div>

        <div className="space-y-px">
          {risks.map((r, i) => (
            <div
              key={r.n}
              className="group grid grid-cols-12 gap-4 sm:gap-8 py-8 sm:py-10 border-t border-stroke last:border-b transition-colors hover:bg-surface-1-solid/40"
            >
              <div className="col-span-12 sm:col-span-2 flex items-start">
                <span className="font-display text-paper-dim text-3xl sm:text-4xl">{r.n}</span>
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
          ))}
        </div>
      </div>
    </section>
  );
};

export default RiskCallouts;
