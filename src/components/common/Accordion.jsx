import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";

const AccordionItem = ({ q, a, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-lg border ${open ? "border-[#2F5D50] bg-[#2F5D50]" : "border-gray-200 bg-white"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left font-medium text-sm sm:text-base cursor-pointer ${open ? "text-white" : "text-gray-800"}`}
      >
        <span>{q}</span>
        <FiChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && a && (
        <div className="px-5 pb-5 text-sm text-white/90 leading-relaxed">{a}</div>
      )}
    </div>
  );
};

const Accordion = ({ items = [] }) => (
  <div className="flex flex-col gap-3">
    {items.map((it, i) => (
      <AccordionItem key={i} q={it.q} a={it.a} defaultOpen={i === 0} />
    ))}
  </div>
);

export default Accordion;
