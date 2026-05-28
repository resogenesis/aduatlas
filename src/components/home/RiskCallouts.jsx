import { useReveal } from "../../hooks/useReveal";

const items = [
  {
    title: "Understand local ADU regulations",
    desc: "and how they pertain to your property.",
  },
  {
    title: "Explore 30+ ADU types",
    desc: "compare construction, design methods, and costs.",
  },
  {
    title: "Build a realistic total budget",
    desc: "understand both pre-site and ADU structure cost.",
  },
  {
    title: "Follow the ADUAtlas 10-Step Guide",
    desc: "the process to your property feasibility.",
  },
  {
    title: "Obtain a realistic feasibility study",
    desc: "for your property before you make any decisions.",
  },
  {
    title: "Be prepared to speak with builders",
    desc: "about the specifics of your property, with a feasibility study that lets you get reasonable quotes that are easy to compare.",
  },
];

const ItemRow = ({ item, i }) => {
  const ref = useReveal(i * 80);
  return (
    <div
      ref={ref}
      className="group flex gap-5 sm:gap-7 py-6 sm:py-7 border-t border-stroke last:border-b transition-colors hover:bg-surface-1-solid/40"
    >
      <span
        aria-hidden
        className="font-display text-paper-dim text-2xl sm:text-3xl tabular-nums shrink-0 w-10 sm:w-12 group-hover:text-accent transition-colors"
      >
        {String(i + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h3 className="font-display font-medium text-paper text-lg sm:text-xl lg:text-2xl leading-snug">
          {item.title}
        </h3>
        <p className="text-paper-dim text-base leading-relaxed mt-1.5 max-w-2xl">
          {item.desc}
        </p>
      </div>
    </div>
  );
};

const RiskCallouts = () => {
  const headRef = useReveal(0);
  const closeRef = useReveal(120);
  return (
    <section className="bg-canvas py-24 sm:py-32">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
        <div ref={headRef} className="mb-12 sm:mb-16 max-w-3xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Where projects derail
          </p>
          <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Most homeowners are unprepared <span className="italic">— and this is how projects go off track.</span>
          </h2>
          <div className="mt-7 space-y-4 text-paper-dim text-base sm:text-lg leading-relaxed">
            <p>
              Learn about the process and products before you waste any time or money. ADUAtlas provides specific information on both.
            </p>
            <p className="text-paper font-medium">ADUAtlas helps you:</p>
          </div>
        </div>

        <div className="space-y-px">
          {items.map((item, i) => <ItemRow key={i} item={item} i={i} />)}
        </div>

        <p ref={closeRef} className="mt-12 sm:mt-14 text-paper text-lg sm:text-xl font-display leading-snug max-w-2xl">
          Be prepared before speaking with builders, suppliers, or your city.
        </p>
      </div>
    </section>
  );
};

export default RiskCallouts;
