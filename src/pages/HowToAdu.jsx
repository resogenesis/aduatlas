import PageHeader from "../components/common/PageHeader";
import PublicStubFooter from "../components/funnel/PublicStubFooter";
import heroImg from "../assets/home/hero_image.png";

const teasers = [
  "Most homeowners skip steps they don't know exist, and pay for it later.",
  "Builders can't quote accurately until you've done specific prep work upfront.",
  "Permitting often takes 1–2 months on its own, even when everything else is right.",
  "Site work and utility hookups regularly add $10K–$100K builders didn't include.",
];

const HowToAdu = () => {
  return (
    <div>
      <PageHeader
        title="How to ADU"
        subtitle="Building an ADU is a sequence of decisions, most of them have to happen before you ever talk to a builder."
        bg={heroImg}
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-3xl">
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8 text-center">
          The ADU process isn't a single project. It's a stack of decisions where each one constrains the next. One wrong assumption early on can cost months and tens of thousands of dollars.
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-10">
          <p className="text-paper font-semibold mb-4">A few things most homeowners don't realize:</p>
          <ul className="space-y-3">
            {teasers.map((t) => (
              <li key={t} className="flex items-start gap-3 text-paper-dim text-sm sm:text-base">
                <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-[#2F5D50]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-paper-dim text-base sm:text-lg leading-relaxed text-center">
          The full step by step process (what to do, in what order, and what to ask your city and builders along the way) is inside the ADU system.
        </p>
      </section>

      <PublicStubFooter chapterName="Chapter 1" />
    </div>
  );
};

export default HowToAdu;
