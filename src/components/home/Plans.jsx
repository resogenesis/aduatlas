import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { PLANS_COUNT, PLAN_BULLETS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.plans.eyebrow",
  "home.plans.heading",
  "home.plans.body",
  "home.plans.cta",
  "home.plans.featured_label",
  "home.plans.footnote",
  ...Array.from({ length: PLANS_COUNT }, (_, i) => [
    `home.plans.item.${i}.name`,
    `home.plans.item.${i}.price`,
    `home.plans.item.${i}.tagline`,
    ...Array.from({ length: PLAN_BULLETS_COUNT }, (_, j) => `home.plans.item.${i}.bullet.${j}`),
  ]).flat(),
];

const FEATURED_INDEX = 1; // Platinum: the property-analysis plan is the core offer.
const PLAN_TIER_PARAM = ["roadmap", "report", "concierge"];

const PlanCard = ({ i, featuredLabel }) => {
  const ref = useReveal(i * 100);
  const name = useContentText(`home.plans.item.${i}.name`);
  const price = useContentText(`home.plans.item.${i}.price`);
  const tagline = useContentText(`home.plans.item.${i}.tagline`);
  const bullets = [
    useContentText(`home.plans.item.${i}.bullet.0`),
    useContentText(`home.plans.item.${i}.bullet.1`),
    useContentText(`home.plans.item.${i}.bullet.2`),
    useContentText(`home.plans.item.${i}.bullet.3`),
  ];
  const featured = i === FEATURED_INDEX;
  return (
    <li
      ref={ref}
      className={`relative rounded-2xl border p-6 sm:p-7 flex flex-col bg-canvas ${
        featured ? "border-accent shadow-[0_24px_50px_-30px_rgba(46,94,68,0.45)]" : "border-stroke"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-accent text-accent-fg text-[0.65rem] font-semibold tracking-[0.18em] uppercase">
          {featuredLabel}
        </span>
      )}
      <p className="text-paper-dim text-[0.7rem] font-semibold tracking-[0.24em] uppercase mb-3">{name}</p>
      <p className="font-primary font-extrabold text-paper text-4xl tracking-tight leading-none mb-1.5">{price}</p>
      <p className="text-paper-dim text-sm mb-6">{tagline}</p>
      <ul className="space-y-2.5 flex-1">
        {bullets.map((b, j) => (
          <li key={j} className="flex items-start gap-2.5 text-sm text-paper leading-snug">
            <FiCheck className="text-accent mt-0.5 shrink-0" aria-hidden /> {b}
          </li>
        ))}
      </ul>
      <Link
        to={`/unlock?tier=${PLAN_TIER_PARAM[i]}`}
        className={`mt-7 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${
          featured ? "bg-accent text-accent-fg hover:bg-accent-dim" : "border border-stroke text-paper hover:bg-surface-1-solid"
        }`}
      >
        Choose {name}
      </Link>
    </li>
  );
};

const Plans = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.plans.eyebrow");
  const heading = useContentText("home.plans.heading");
  const body = useContentText("home.plans.body");
  const cta = useContentText("home.plans.cta");
  const featuredLabel = useContentText("home.plans.featured_label");
  const footnote = useContentText("home.plans.footnote");
  const [h1, h2] = heading.split("\n");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Plans">
      <section className="bg-canvas">
        <div className="container mx-auto px-5 sm:px-8 py-16 lg:py-24">
          <div ref={ref} className="max-w-2xl mb-10 lg:mb-12">
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
            <p className="text-paper-dim text-base leading-relaxed">{body}</p>
          </div>
          <ul className="grid md:grid-cols-3 gap-5 lg:gap-6 items-stretch">
            {Array.from({ length: PLANS_COUNT }, (_, i) => (
              <PlanCard key={i} i={i} featuredLabel={featuredLabel} />
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-paper-dim text-xs sm:text-sm">{footnote}</p>
            <Link to="/unlock" className="group inline-flex items-center gap-2 text-sm font-medium text-paper hover:text-accent transition-colors">
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Plans;
