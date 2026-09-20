import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { TESTIMONIALS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.testimonials.eyebrow",
  "home.testimonials.heading",
  "home.testimonials.link",
  ...Array.from({ length: TESTIMONIALS_COUNT }, (_, i) => [
    `home.testimonials.item.${i}.quote`,
    `home.testimonials.item.${i}.name`,
    `home.testimonials.item.${i}.place`,
  ]).flat(),
];

const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const Card = ({ i }) => {
  const ref = useReveal(i * 100);
  const quote = useContentText(`home.testimonials.item.${i}.quote`);
  const name = useContentText(`home.testimonials.item.${i}.name`);
  const place = useContentText(`home.testimonials.item.${i}.place`);
  return (
    <li ref={ref} className="bg-canvas rounded-2xl border border-stroke p-6 flex flex-col shadow-[0_18px_40px_-30px_rgba(23,32,27,0.3)]">
      <span className="text-accent text-3xl leading-none font-display" aria-hidden>
        “
      </span>
      <p className="text-paper text-sm sm:text-base leading-relaxed flex-1 mt-1 mb-6">{quote}</p>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-surface-1-solid text-accent font-semibold text-sm inline-flex items-center justify-center">
          {initials(name)}
        </span>
        <div>
          <p className="text-paper text-sm font-semibold leading-tight">{name}</p>
          <p className="text-paper-dim text-xs">{place}</p>
        </div>
      </div>
    </li>
  );
};

const Testimonials = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.testimonials.eyebrow");
  const heading = useContentText("home.testimonials.heading");
  const link = useContentText("home.testimonials.link");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Testimonials">
      <section className="bg-canvas">
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-20">
          <div ref={ref} className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-paper-dim text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-3">{eyebrow}</p>
              <h2 className="font-primary font-extrabold text-paper text-3xl sm:text-[2.4rem] leading-[1.05] tracking-[-0.025em]">{heading}</h2>
            </div>
            <Link to="/about" className="group inline-flex items-center gap-2 text-sm font-medium text-paper-dim hover:text-paper underline underline-offset-4 decoration-stroke">
              {link} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <ul className="grid md:grid-cols-3 gap-5">
            {Array.from({ length: TESTIMONIALS_COUNT }, (_, i) => (
              <Card key={i} i={i} />
            ))}
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Testimonials;
