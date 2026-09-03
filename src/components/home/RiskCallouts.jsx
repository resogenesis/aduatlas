import { FiMap, FiHome, FiDollarSign, FiCompass, FiClipboard, FiUsers } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";

// Icons + item order stay code-owned; title/desc text is admin-editable
// (home.riskcallouts.item.{i}.title / .desc in the content registry).
const ICONS = [FiMap, FiHome, FiDollarSign, FiCompass, FiClipboard, FiUsers];

const ItemRow = ({ i }) => {
  const ref = useReveal(i * 80);
  const Icon = ICONS[i];
  const title = useContentText(`home.riskcallouts.item.${i}.title`);
  const desc = useContentText(`home.riskcallouts.item.${i}.desc`);
  return (
    <div
      ref={ref}
      className="group flex gap-5 sm:gap-7 py-6 sm:py-7 border-t border-stroke last:border-b transition-colors hover:bg-surface-1-solid/40"
    >
      <span
        aria-hidden
        className="text-paper-dim text-3xl sm:text-4xl shrink-0 w-10 sm:w-12 group-hover:text-accent transition-colors mt-1"
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <h3 className="font-display font-medium text-paper text-lg sm:text-xl lg:text-2xl leading-snug">
          {title}
        </h3>
        <p className="text-paper-dim text-base leading-relaxed mt-1.5 max-w-2xl">
          {desc}
        </p>
      </div>
    </div>
  );
};

const RiskCallouts = () => {
  const headRef = useReveal(0);
  const closeRef = useReveal(120);
  const eyebrow = useContentText("home.riskcallouts.eyebrow");
  const headingPre = useContentText("home.riskcallouts.heading_pre");
  const headingEmphasis = useContentText("home.riskcallouts.heading_emphasis");
  const intro = useContentText("home.riskcallouts.intro");
  const closing = useContentText("home.riskcallouts.closing");

  return (
    <section className="bg-canvas py-24 sm:py-32">
      <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
        <div ref={headRef} className="mb-12 sm:mb-16 max-w-3xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            {eyebrow}
          </p>
          <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            {headingPre} <span className="italic">{headingEmphasis}</span>
          </h2>
          <p className="mt-7 text-paper-dim text-base sm:text-lg leading-relaxed">
            {intro.split("\n").map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        </div>

        <div className="space-y-px">
          {ICONS.map((_, i) => <ItemRow key={i} i={i} />)}
        </div>

        <p ref={closeRef} className="mt-12 sm:mt-14 text-paper text-lg sm:text-xl font-display leading-snug max-w-2xl">
          {closing}
        </p>
      </div>
    </section>
  );
};

export default RiskCallouts;
