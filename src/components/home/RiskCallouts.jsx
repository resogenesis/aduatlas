import { FiAlertTriangle, FiHelpCircle, FiDollarSign } from "react-icons/fi";

const risks = [
  {
    icon: FiAlertTriangle,
    title: "Most homeowners don't know what they can legally build.",
    desc: "Zoning rules vary by state, city, and ZIP — and they change. Discovering this after your design is locked is the #1 source of $1,000s in wasted spend.",
  },
  {
    icon: FiDollarSign,
    title: "Site prep + utility hookups are the surprise cost killer.",
    desc: "Sewer ties, stormwater, trenching for water and gas — these regularly add $10K–$100K to a project that builders quoted on \"the structure only.\"",
  },
  {
    icon: FiHelpCircle,
    title: "Builders can't quote accurately without your details.",
    desc: "Without lot dimensions, zoning constraints, and a clear scope, every quote you get is a rough guess. Comparing quotes becomes impossible.",
  },
];

const RiskCallouts = () => {
  return (
    <section className="container mx-auto px-4 sm:px-6 py-14 sm:py-20 max-w-5xl">
      <div className="text-center mb-10 sm:mb-14">
        <p className="text-[#2F5D50] font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3 uppercase">
          What homeowners get wrong
        </p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary leading-snug">
          The 3 things that derail most ADU projects
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
        {risks.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white border border-gray-200 rounded-xl p-6 sm:p-7">
            <div className="w-11 h-11 rounded-lg bg-[#2F5D50]/10 text-[#2F5D50] flex items-center justify-center mb-4">
              <Icon className="text-xl" />
            </div>
            <h3 className="font-semibold text-primary text-base sm:text-lg leading-snug mb-2">
              {title}
            </h3>
            <p className="text-secondary text-sm leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default RiskCallouts;
