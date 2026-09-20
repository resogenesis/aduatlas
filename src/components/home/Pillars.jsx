import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { PILLARS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = Array.from({ length: PILLARS_COUNT }, (_, i) => [`home.pillars.item.${i}.title`, `home.pillars.item.${i}.desc`]).flat();

// The four pillars as a numbered journey: a hairline runs across the top,
// each step hangs from it with a serif numeral.
const Step = ({ i }) => {
  const ref = useReveal(i * 90);
  const title = useContentText(`home.pillars.item.${i}.title`).replace("\n", " ");
  const desc = useContentText(`home.pillars.item.${i}.desc`);
  return (
    <li ref={ref} className="relative pt-8">
      <span className="absolute top-0 left-0 w-2.5 h-2.5 -translate-y-1/2 rounded-full bg-accent" aria-hidden />
      <p className="font-display text-accent text-3xl leading-none mb-4">{String(i + 1).padStart(2, "0")}</p>
      <h3 className="font-semibold text-paper text-lg leading-tight mb-2">{title}</h3>
      <p className="text-paper-dim text-sm leading-relaxed max-w-[16rem]">{desc}</p>
    </li>
  );
};

const Pillars = () => (
  <AdminEditableSection keys={EDIT_KEYS} label="How it works">
    <section className="bg-canvas">
      <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-24">
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-12 border-t border-stroke">
          {Array.from({ length: PILLARS_COUNT }, (_, i) => (
            <Step key={i} i={i} />
          ))}
        </ol>
      </div>
    </section>
  </AdminEditableSection>
);

export default Pillars;
