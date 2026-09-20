import { Link } from "react-router-dom";
import { FiArrowRight, FiMapPin, FiTool, FiUserCheck } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { BUILDER_POINTS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.builders.eyebrow",
  "home.builders.heading",
  "home.builders.body",
  "home.builders.cta",
  ...Array.from({ length: BUILDER_POINTS_COUNT }, (_, i) => [`home.builders.point.${i}.title`, `home.builders.point.${i}.desc`]).flat(),
];
const ICONS = [FiMapPin, FiTool, FiUserCheck];

const Point = ({ i }) => {
  const ref = useReveal(120 + i * 90);
  const title = useContentText(`home.builders.point.${i}.title`);
  const desc = useContentText(`home.builders.point.${i}.desc`);
  const Icon = ICONS[i];
  return (
    <li ref={ref} className="flex items-start gap-4">
      <span className="w-11 h-11 rounded-xl bg-canvas border border-stroke text-accent inline-flex items-center justify-center shrink-0 text-lg">
        <Icon aria-hidden />
      </span>
      <div>
        <h3 className="font-semibold text-paper text-base leading-tight mb-1">{title}</h3>
        <p className="text-paper-dim text-sm leading-relaxed">{desc}</p>
      </div>
    </li>
  );
};

const BuilderTeaser = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.builders.eyebrow");
  const heading = useContentText("home.builders.heading");
  const body = useContentText("home.builders.body");
  const cta = useContentText("home.builders.cta");
  const [h1, h2] = heading.split("\n");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Find a builder">
      <section className="bg-surface-1-solid border-y border-stroke">
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-20 grid lg:grid-cols-12 gap-10 items-center">
          <div ref={ref} className="lg:col-span-5">
            <p className="text-paper-dim text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-4">{eyebrow}</p>
            <h2 className="font-primary font-extrabold text-paper text-3xl sm:text-4xl lg:text-[2.6rem] leading-[1.05] tracking-[-0.025em] mb-4">
              {h1}
              {h2 && (
                <>
                  <br />
                  {h2}
                </>
              )}
            </h2>
            <p className="text-paper-dim text-base leading-relaxed mb-8">{body}</p>
            <Link
              to="/builders"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
            >
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <ul className="lg:col-span-6 lg:col-start-7 space-y-6">
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
