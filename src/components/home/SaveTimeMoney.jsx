import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

const cards = [
  {
    title: "How to ADU — 10 Step Guide",
    desc: "A clear path from idea to a feasibility study and site plan.",
    to: "/how-to-adu",
  },
  {
    title: "FAQ",
    desc: "Comprehensive answers to virtually every ADU-related question — from zoning and costs to timelines, design options, and common mistakes.",
    to: "/faq",
  },
  {
    title: "ADU Video Library",
    desc: "Explore how different ADUs are built, delivered, installed, and completed through educational video content.",
    to: "/videos",
  },
  {
    title: "ADU Type Education",
    desc: "Compare more than 30 ADU types, styles, structures, and building methods.",
    to: "/adu-types",
  },
  {
    title: "ADU Regulations Database",
    desc: "Choose your state, city, or ZIP code to access local ADU zoning regulations.",
    to: "/choose-your-state",
  },
  {
    title: "Planning Tools",
    desc: "Step-by-step resources to help homeowners plan timelines, budgets, and project scope.",
    to: "/how-to-adu",
  },
  {
    title: "Paid Feasibility & Estimate Tools",
    desc: "Gain access to pre-populated pre-site estimate worksheets, budget tools, and GIS feasibility studies.",
    to: "/feasibility",
  },
  {
    title: "Match with Pros",
    desc: "Connect with qualified builders, suppliers, and professionals familiar with your local zoning and ADU requirements.",
    to: "/builders",
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
        <p className="text-secondary text-sm sm:text-base leading-relaxed">
          These tools help homeowners make informed decisions before buying, selling, or building an ADU — saving time, reducing costly mistakes, and preparing the homeowner to speak with a builder. Whether you're just beginning your research or ready to build, ADUAtlas provides step-by-step guidance to help you move forward with confidence.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((c, i) => (
          <Link
            key={c.title}
            to={c.to}
            className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-[#2F5D50] hover:shadow-md transition flex flex-col"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#2F5D50] text-white text-xs font-semibold flex items-center justify-center">{i + 1}</span>
              <h3 className="font-semibold text-primary text-base sm:text-lg">{c.title}</h3>
            </div>
            <p className="text-secondary text-sm leading-relaxed flex-1">{c.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[#2F5D50] text-sm font-medium group-hover:gap-2 transition-all">
              Learn more <FiArrowRight />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default SaveTimeMoney;
