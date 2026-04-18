import { FiCheck } from "react-icons/fi";

const items = [
  "A clear, step-by-step guide to the ADU process",
  "Detailed breakdowns of ADU types and structures",
  "Local zoning regulations by city and ZIP code",
  "A low-cost feasibility study tailored to your property",
];

const WeProvide = () => {
  return (
    <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-semibold text-primary mb-6 text-center">We provide</h2>
        <ul className="grid sm:grid-cols-2 gap-4 mb-8">
          {items.map((text) => (
            <li key={text} className="flex items-start gap-3 bg-[#F4F7F6] rounded-xl p-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#2F5D50] text-white flex items-center justify-center">
                <FiCheck />
              </span>
              <span className="text-secondary text-sm sm:text-base leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>
        <div className="bg-[#2F5D50] text-white rounded-2xl px-6 py-6 sm:px-8 sm:py-8 text-center">
          <p className="text-base sm:text-lg leading-relaxed">
            <span className="font-semibold">The result:</span> You enter conversations with your city and builders informed, prepared, and confident — saving time, money, and costly mistakes.
          </p>
        </div>
      </div>
    </section>
  );
};

export default WeProvide;
