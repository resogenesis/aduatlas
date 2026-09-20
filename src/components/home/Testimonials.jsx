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

// Quotes as plain editorial columns: serif italic text, a hairline on the
// left, name and place beneath. No cards.
const Quote = ({ i }) => {
  const ref = useReveal(i * 100);
  const quote = useContentText(`home.testimonials.item.${i}.quote`);
  const name = useContentText(`home.testimonials.item.${i}.name`);
  const place = useContentText(`home.testimonials.item.${i}.place`);
  return (
    <li ref={ref} className="border-l border-stroke pl-6 flex flex-col">
      <p className="font-display italic text-paper text-xl leading-snug flex-1 mb-6">“{quote}”</p>
      <p className="text-paper text-sm font-semibold leading-tight">{name}</p>
      <p className="text-paper-dim text-xs">{place}</p>
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
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-24">
          <div ref={ref} className="flex flex-wrap items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-accent text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-4">{eyebrow}</p>
              <h2 className="font-display font-medium text-paper text-4xl sm:text-5xl leading-[1.02]">{heading}</h2>
            </div>
            <Link to="/about" className="group inline-flex items-center gap-2 text-sm font-medium text-paper-dim hover:text-paper transition-colors">
              {link} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <ul className="grid md:grid-cols-3 gap-10">
            {Array.from({ length: TESTIMONIALS_COUNT }, (_, i) => (
              <Quote key={i} i={i} />
            ))}
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Testimonials;
