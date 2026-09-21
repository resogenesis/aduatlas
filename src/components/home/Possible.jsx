import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentImage, useContentText } from "../../lib/content";
import { POSSIBLE_CARDS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.possible.heading",
  "home.possible.body",
  "home.possible.cta",
  ...Array.from({ length: POSSIBLE_CARDS_COUNT }, (_, i) => [
    `home.possible.card.${i}.title`,
    `home.possible.card.${i}.desc`,
    `home.possible.card.${i}.image`,
  ]).flat(),
];

// Editorial rows instead of cards: a square photo, a title and a
// line of copy, separated by hairlines.
const Row = ({ i }) => {
  const ref = useReveal(120 + i * 100);
  const title = useContentText(`home.possible.card.${i}.title`).replace("\n", " ");
  const desc = useContentText(`home.possible.card.${i}.desc`);
  const image = useContentImage(`home.possible.card.${i}.image`);
  return (
    <li ref={ref} className="grid grid-cols-[6rem_1fr] sm:grid-cols-[8rem_1fr] gap-5 sm:gap-7 items-center py-6 border-t border-stroke last:border-b">
      <div className="aspect-square rounded-2xl overflow-hidden">
        <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
      </div>
      <div>
        <h3 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-2xl leading-tight mb-1.5">{title}</h3>
        <p className="text-paper-dim text-sm leading-relaxed">{desc}</p>
      </div>
    </li>
  );
};

const Possible = () => {
  const ref = useReveal();
  const heading = useContentText("home.possible.heading").replace("\n", " ");
  const body = useContentText("home.possible.body");
  const cta = useContentText("home.possible.cta");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="What's possible">
      <section className="bg-surface-1-solid">
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl section-y grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div ref={ref} className="lg:col-span-5">
            <h2 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-4xl sm:text-5xl leading-[1.02] mb-5">{heading}</h2>
            <p className="text-paper-dim text-base leading-relaxed mb-8 max-w-md">{body}</p>
            <Link
              to="/property"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
            >
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <ul className="lg:col-span-7">
            {Array.from({ length: POSSIBLE_CARDS_COUNT }, (_, i) => (
              <Row key={i} i={i} />
            ))}
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Possible;
