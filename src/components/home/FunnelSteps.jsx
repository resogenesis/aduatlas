import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { FUNNEL_STEPS_META } from "../../lib/contentRegistry/home";

// Every StepCard calls the same fixed number of hooks (title/lede/intro + 7
// bullet slots) regardless of this step's actual bullet count — unused slots
// simply have no registry entry and resolve to "" — so hook call order never
// varies per the rules of hooks.
const StepCard = ({ meta, i }) => {
  const ref = useReveal(i * 120);
  const title = useContentText(`home.funnelsteps.step.${i}.title`);
  const lede = useContentText(`home.funnelsteps.step.${i}.lede`);
  const intro = useContentText(`home.funnelsteps.step.${i}.intro`);
  const allBullets = [
    useContentText(`home.funnelsteps.step.${i}.bullet.0`),
    useContentText(`home.funnelsteps.step.${i}.bullet.1`),
    useContentText(`home.funnelsteps.step.${i}.bullet.2`),
    useContentText(`home.funnelsteps.step.${i}.bullet.3`),
    useContentText(`home.funnelsteps.step.${i}.bullet.4`),
    useContentText(`home.funnelsteps.step.${i}.bullet.5`),
    useContentText(`home.funnelsteps.step.${i}.bullet.6`),
  ];
  const bullets = allBullets.slice(0, meta.bulletCount);
  return (
    <div
      ref={ref}
      className="bg-surface-1-solid border border-stroke rounded-2xl p-7 sm:p-8 relative group hover:border-accent/40 transition-all duration-300"
    >
      <span className="font-display text-paper-dim text-3xl mb-4 block group-hover:text-accent transition-colors">
        {meta.n}
      </span>
      <h3 className="font-display text-paper text-xl sm:text-2xl leading-snug mb-2">{title}</h3>
      {lede && (
        <p className="text-paper-dim text-sm sm:text-base leading-relaxed mb-4">{lede}</p>
      )}
      {intro && (
        <p className="text-paper text-sm font-medium mb-2">{intro}</p>
      )}
      <ul className="space-y-2 mb-4">
        {bullets.map((b, j) => (
          <li key={j} className="flex gap-2.5 text-paper-dim text-sm sm:text-base leading-snug">
            <FiCheck className="text-accent shrink-0 mt-1" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const FunnelSteps = () => {
  const headRef = useReveal(0);
  const ctaRef = useReveal(360);
  const heading = useContentText("home.funnelsteps.heading");
  const ctaPrimary = useContentText("home.funnelsteps.cta_primary");
  const ctaSecondary = useContentText("home.funnelsteps.cta_secondary");
  const pricingNote = useContentText("home.funnelsteps.pricing_note");

  return (
    <section className="bg-canvas py-24 sm:py-32 border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl">
        <div ref={headRef} className="mb-14 sm:mb-20 max-w-2xl">
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight">
            {heading}
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 sm:gap-6 mb-14 items-start">
          {FUNNEL_STEPS_META.map((meta, i) => <StepCard key={meta.n} meta={meta} i={i} />)}
        </div>

        <div ref={ctaRef} className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Link
            to="/unlock"
            className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
          >
            {ctaPrimary} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/course-outline"
            className="group inline-flex items-center gap-1.5 text-paper hover:text-accent text-sm font-medium transition-colors"
          >
            {ctaSecondary} <FiArrowRight className="text-xs group-hover:translate-x-1 transition-transform" />
          </Link>
          <span className="text-paper-dim text-sm">
            {pricingNote}
          </span>
        </div>
      </div>
    </section>
  );
};

export default FunnelSteps;
