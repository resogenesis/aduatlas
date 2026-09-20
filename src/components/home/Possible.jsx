import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentImage, useContentText } from "../../lib/content";
import { POSSIBLE_CARDS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.possible.eyebrow",
  "home.possible.heading",
  "home.possible.body",
  "home.possible.cta",
  ...Array.from({ length: POSSIBLE_CARDS_COUNT }, (_, i) => [
    `home.possible.card.${i}.eyebrow`,
    `home.possible.card.${i}.title`,
    `home.possible.card.${i}.desc`,
    `home.possible.card.${i}.image`,
  ]).flat(),
];

const Card = ({ i }) => {
  const ref = useReveal(120 + i * 100);
  const eyebrow = useContentText(`home.possible.card.${i}.eyebrow`);
  const title = useContentText(`home.possible.card.${i}.title`);
  const desc = useContentText(`home.possible.card.${i}.desc`);
  const image = useContentImage(`home.possible.card.${i}.image`);
  const [l1, l2] = title.split("\n");
  return (
    <article ref={ref} className="bg-canvas rounded-2xl border border-stroke overflow-hidden shadow-[0_18px_40px_-28px_rgba(23,32,27,0.35)]">
      <div className="aspect-[5/4] overflow-hidden">
        <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
      </div>
      <div className="p-5">
        <p className="text-paper-dim text-[0.65rem] font-semibold tracking-[0.24em] uppercase mb-2">{eyebrow}</p>
        <h3 className="font-semibold text-paper text-lg leading-tight mb-2">
          {l1}
          {l2 && (
            <>
              <br />
              {l2}
            </>
          )}
        </h3>
        <p className="text-paper-dim text-sm leading-relaxed">{desc}</p>
      </div>
    </article>
  );
};

// Faint contour lines behind the copy, echoing a site plan.
const Contours = () => (
  <svg className="absolute inset-y-0 left-0 w-[34rem] h-full text-stroke pointer-events-none" viewBox="0 0 600 600" fill="none" aria-hidden>
    {[0, 1, 2, 3, 4].map((k) => (
      <path
        key={k}
        d={`M-50 ${380 + k * 40} C 120 ${300 + k * 30}, 260 ${480 + k * 25}, 420 ${360 + k * 35} S 620 ${300 + k * 30}, 700 ${420 + k * 30}`}
        stroke="currentColor"
        strokeWidth="1"
      />
    ))}
  </svg>
);

const Possible = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.possible.eyebrow");
  const heading = useContentText("home.possible.heading");
  const body = useContentText("home.possible.body");
  const cta = useContentText("home.possible.cta");
  const [h1, h2] = heading.split("\n");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="What's possible">
      <section className="bg-surface-1-solid relative overflow-hidden">
        <Contours />
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 items-center relative">
          <div ref={ref} className="lg:col-span-4">
            <p className="text-paper-dim text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-4">{eyebrow}</p>
            <h2 className="font-primary font-extrabold text-paper text-3xl sm:text-4xl lg:text-[2.6rem] leading-[1.05] tracking-[-0.025em] mb-5">
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
              to="/property"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
            >
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-3 gap-4 lg:gap-5">
            {Array.from({ length: POSSIBLE_CARDS_COUNT }, (_, i) => (
              <Card key={i} i={i} />
            ))}
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Possible;
