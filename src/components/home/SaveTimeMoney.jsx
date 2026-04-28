import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

const steps = [
  { label: "Learn the Process", to: "/how-to-adu" },
  { label: "Explore Options", to: "/adu-types" },
  { label: "Check Regulations", to: "/choose-your-state" },
  { label: "Plan & Build", to: "/pricing" },
];

const cards = [
  {
    title: "How to ADU — 10 Steps",
    desc: "A clear path from idea to certificate of occupancy.",
    to: "/how-to-adu",
    cta: "Next: How to ADU",
  },
  {
    title: "Explore & Compare 25+ ADU Types",
    desc: "Prefab, modular, container, casita, garage conversion, and more.",
    to: "/adu-types",
    cta: "Browse ADU Types",
  },
  {
    title: "Review the ADU FAQ",
    desc: "Costs, permits, taxes, utility hookups, and common mistakes.",
    to: "/faq",
    cta: "Read the FAQ",
  },
  {
    title: "Choose Your City / State",
    desc: "Access local zoning regulations specific to your jurisdiction.",
    to: "/choose-your-state",
    cta: "Find Your Regulations",
  },
];

const SaveTimeMoney = () => {
  return (
    <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto text-center mb-8">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-primary mb-4">
          Save Time and Money with ADUAtlas
        </h2>
        <div className="space-y-3 text-secondary text-sm sm:text-base leading-relaxed mb-6">
          <p>
            ADUAtlas is a national marketplace that helps homeowners understand local ADU regulations and connect with qualified builders and suppliers. Whether you are just starting or ready to build, ADUAtlas guides you through every step of the ADU planning and construction process.
          </p>
          <p>
            Access real-time city and state ADU rules, explore 25+ ADU types and structures, and evaluate your project with the ADU Readiness Score — whether you are buying, building, or selling an ADU.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm sm:text-base text-secondary">
          {steps.map((s, i) => (
            <span key={s.label} className="flex items-center gap-2">
              <Link to={s.to} className="font-medium text-[#2F5D50] hover:underline">
                {s.label}
              </Link>
              {i < steps.length - 1 && <FiArrowRight className="text-[#2F5D50]" />}
            </span>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c) => (
          <Link
            key={c.title}
            to={c.to}
            className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-[#2F5D50] hover:shadow-md transition flex flex-col"
          >
            <h3 className="font-semibold text-primary text-base sm:text-lg mb-2">{c.title}</h3>
            <p className="text-secondary text-sm leading-relaxed flex-1">{c.desc}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-[#2F5D50] text-sm font-medium group-hover:gap-3 transition-all">
              {c.cta} <FiArrowRight />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default SaveTimeMoney;
