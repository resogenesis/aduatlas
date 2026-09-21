import { FiAlertTriangle, FiDollarSign, FiFileText } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { PROBLEMS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

// The reason ADUAtlas exists, in three concrete mistakes. Dark band so it
// reads as a pause between the doors above and the possibilities below.
const ICONS = [FiFileText, FiDollarSign, FiAlertTriangle];
const EDIT_KEYS = ["home.problems.heading", "home.problems.body", ...Array.from({ length: PROBLEMS_COUNT }, (_, i) => [`home.problems.item.${i}.title`, `home.problems.item.${i}.desc`]).flat()];

const Item = ({ i }) => {
  const ref = useReveal(120 + i * 90);
  const title = useContentText(`home.problems.item.${i}.title`);
  const desc = useContentText(`home.problems.item.${i}.desc`);
  const Icon = ICONS[i];
  return (
    <li ref={ref} className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <span className="w-11 h-11 rounded-xl bg-white/10 text-gold inline-flex items-center justify-center text-xl mb-5">
        <Icon aria-hidden />
      </span>
      <h3 className="font-display text-white text-xl leading-tight mb-2">{title}</h3>
      <p className="text-white/70 text-sm leading-relaxed">{desc}</p>
    </li>
  );
};

const Problems = () => {
  const ref = useReveal();
  const heading = useContentText("home.problems.heading");
  const body = useContentText("home.problems.body");
  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Where projects go wrong">
      <section className="bg-forest-deep text-white">
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
          <div ref={ref} className="max-w-2xl mb-10">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-[2.6rem] leading-[1.05] mb-4">{heading}</h2>
            <p className="text-white/75 text-base sm:text-lg leading-relaxed">{body}</p>
          </div>
          <ul className="grid md:grid-cols-3 gap-5">
            {Array.from({ length: PROBLEMS_COUNT }, (_, i) => (
              <Item key={i} i={i} />
            ))}
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Problems;
