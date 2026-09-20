import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { BUILDER_POINTS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.builders.heading",
  "home.builders.body",
  "home.builders.cta",
  ...Array.from({ length: BUILDER_POINTS_COUNT }, (_, i) => [`home.builders.point.${i}.title`, `home.builders.point.${i}.desc`]).flat(),
];

const Point = ({ i }) => {
  const ref = useReveal(120 + i * 90);
  const title = useContentText(`home.builders.point.${i}.title`);
  const desc = useContentText(`home.builders.point.${i}.desc`);
  return (
    <li ref={ref} className="grid grid-cols-[2.5rem_1fr] gap-4 py-5 border-t border-white/15 last:border-b">
      <span className="font-primary font-extrabold text-gold text-lg leading-none pt-0.5">{String(i + 1).padStart(2, "0")}</span>
      <div>
        <h3 className="font-semibold text-white text-base leading-tight mb-1">{title}</h3>
        <p className="text-white/70 text-sm leading-relaxed">{desc}</p>
      </div>
    </li>
  );
};

// Deep-green band: the builder promise, with the three points as a numbered
// list on the right.
const BuilderTeaser = () => {
  const ref = useReveal();
  const heading = useContentText("home.builders.heading").replace("\n", " ");
  const body = useContentText("home.builders.body");
  const cta = useContentText("home.builders.cta");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Find a builder">
      <section className="bg-forest-deep text-white">
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-12 items-center">
          <div ref={ref} className="lg:col-span-5">
            <h2 className="font-primary font-extrabold tracking-[-0.025em] text-4xl sm:text-5xl leading-[1.02] mb-5">{heading}</h2>
            <p className="text-white/75 text-base leading-relaxed mb-8 max-w-md">{body}</p>
            <Link
              to="/builders"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-forest-deep font-semibold text-sm hover:bg-mist transition-colors"
            >
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <ul className="lg:col-span-6 lg:col-start-7">
            {Array.from({ length: BUILDER_POINTS_COUNT }, (_, i) => (
              <Point key={i} i={i} />
            ))}
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default BuilderTeaser;
