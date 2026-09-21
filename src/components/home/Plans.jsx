import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { PLANS_COUNT, PLAN_BULLETS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
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
  const dim = featured ? "text-white/70" : "text-paper-dim";
  const ink = featured ? "text-white" : "text-paper";
  return (
    <li
      ref={ref}
      className={`lift relative rounded-[1.5rem] p-7 sm:p-8 flex flex-col ${ featured ?"bg-forest-deep text-white shadow-[0_40px_80px_-40px_rgba(31,68,50,0.7)] lg:-my-4":"bg-canvas border border-stroke"}`}
    >
      <div className="flex items-center justify-between mb-6">
        <p className={`text-base font-semibold ${ink}`}>{name}</p>
        {featured && <span className="px-2.5 py-1 rounded-full bg-gold/90 text-forest-deep text-xs font-semibold">{featuredLabel}</span>}
      </div>
      <p className={`font-primary font-extrabold tracking-[-0.025em] text-5xl leading-none mb-2 ${ink}`}>{price}</p>
      <p className={`text-sm mb-7 ${dim}`}>{tagline}</p>
      <ul className="space-y-3 flex-1">
        {bullets.map((b, j) => (
          <li key={j} className={`flex items-start gap-2.5 text-sm leading-snug ${ink}`}>
            <FiCheck className={`mt-0.5 shrink-0 ${featured ?"text-gold":"text-accent"}`} aria-hidden /> {b}
          </li>
        ))}
      </ul>
      <Link
        to={`/unlock?tier=${PLAN_TIER_PARAM[i]}`}
        className={`mt-8 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${ featured ?"bg-white text-forest-deep hover:bg-mist":"border border-stroke text-paper hover:bg-surface-1-solid"}`}
      >
        Choose {name}
      </Link>
    </li>
  );
};

const Plans = () => {
  const ref = useReveal();
  const heading = useContentText("home.plans.heading").replace("\n", " ");
  const body = useContentText("home.plans.body");
  const cta = useContentText("home.plans.cta");
  const featuredLabel = useContentText("home.plans.featured_label");
  const footnote = useContentText("home.plans.footnote");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Plans">
      <section className="bg-canvas">
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
          <div ref={ref} className="grid lg:grid-cols-12 gap-6 items-end mb-12 lg:mb-16">
            <div className="lg:col-span-7">
              <h2 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-4xl sm:text-5xl leading-[1.02]">{heading}</h2>
            </div>
            <p className="lg:col-span-5 text-paper-dim text-base leading-relaxed">{body}</p>
          </div>
          <ul className="grid md:grid-cols-3 gap-5 lg:gap-6 items-stretch lg:py-4">
            {Array.from({ length: PLANS_COUNT }, (_, i) => (
              <PlanCard key={i} i={i} featuredLabel={featuredLabel} />
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-stroke pt-6">
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
