import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";

const prepares = [
  "ADU education and planning resources",
  "Local zoning and regulatory guidance",
  "Pre-filled budget and planning worksheets",
  "National ADU Readiness Score",
  "GIS feasibility and site planning tools",
  "Builder matching based on your local regulations",
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
      <div className="max-w-3xl mx-auto text-center mb-10">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-primary mb-3">
          Save Time and Money with ADUAtlas
        </h2>
        <p className="text-[#2F5D50] font-semibold tracking-[0.2em] text-sm sm:text-base mb-5">
          EDUCATE • EXPLORE • PLAN • BUILD
        </p>
        <p className="text-secondary text-sm sm:text-base leading-relaxed mb-5">
          ADUAtlas prepares homeowners with the tools to confidently plan, evaluate, and build an ADU — saving time, reducing costly mistakes, and improving overall project readiness.
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-left max-w-2xl mx-auto">
          {prepares.map((item) => (
            <li key={item} className="flex items-start gap-2 text-secondary text-sm sm:text-base">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#2F5D50] text-white flex items-center justify-center text-xs">
                <FiCheck />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
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
