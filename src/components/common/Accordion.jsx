import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";

const AccordionItem = ({ q, a, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-2xl border transition-colors ${open ? "border-accent bg-surface-1-solid" : "border-stroke bg-canvas"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer"
      >
        <span className={`font-display text-base sm:text-lg ${open ? "text-paper" : "text-paper"}`}>{q}</span>
        <FiChevronDown className={`text-paper-dim transition-transform ${open ? "rotate-180 text-accent" : ""}`} />
      </button>
      {open && a && (
        <div className="px-6 pb-6 text-sm text-paper-dim leading-relaxed">{a}</div>
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
