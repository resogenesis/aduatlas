import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiClipboard, FiUsers } from "react-icons/fi";
import { useContentText } from "../lib/content";
import { HOW_TO_ADU_PILLARS_COUNT, HOW_TO_ADU_STEPS_COUNT } from "../lib/contentRegistry/howToAdu";

// Icons + step numbers stay code-owned; title/desc text is admin-editable.
const PILLAR_ICONS = [FiBookOpen, FiClipboard, FiUsers];
const STEP_N = ["01", "02", "03", "04", "05"];

const Pillar = ({ i }) => {
  const Icon = PILLAR_ICONS[i];
  const title = useContentText(`howtoadu.pillar.${i}.title`);
  const desc = useContentText(`howtoadu.pillar.${i}.desc`);
  return (
    <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent/40 transition-colors">
      <span className="text-accent text-2xl block mb-4" aria-hidden>
        <Icon />
      </span>
      <h3 className="font-display text-paper text-lg sm:text-xl leading-snug mb-2">{title}</h3>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed">{desc}</p>
    </div>
  );
};

const Step = ({ i }) => {
  const title = useContentText(`howtoadu.step.${i}.title`);
  const desc = useContentText(`howtoadu.step.${i}.desc`);
  return (
    <div className="grid grid-cols-12 gap-3 sm:gap-7 py-6 sm:py-7 border-t border-stroke last:border-b">
      <div className="col-span-12 sm:col-span-2">
        <span className="font-display text-paper-dim text-2xl sm:text-3xl tabular-nums">
          {STEP_N[i]}
        </span>
      </div>
      <div className="col-span-12 sm:col-span-10">
        <h3 className="font-display font-medium text-paper text-lg sm:text-xl lg:text-2xl leading-snug mb-2">
          {title}
        </h3>
        <p className="text-paper-dim text-base leading-relaxed max-w-2xl">{desc}</p>
      </div>
    </div>
  );
};

const HowToAdu = () => {
  const heroEyebrow = useContentText("howtoadu.hero.eyebrow");
  const heroHeadingPre = useContentText("howtoadu.hero.heading_pre");
  const heroHeadingEmphasis = useContentText("howtoadu.hero.heading_emphasis");
  const heroBodyPre = useContentText("howtoadu.hero.body_pre");
  const heroBodyEmphasis = useContentText("howtoadu.hero.body_emphasis");
  const heroLinkPillars = useContentText("howtoadu.hero.link_pillars");
  const heroLinkSteps = useContentText("howtoadu.hero.link_steps");
  const pillarsEyebrow = useContentText("howtoadu.pillars.eyebrow");
  const pillarsHeading = useContentText("howtoadu.pillars.heading");
  const pillarsBody = useContentText("howtoadu.pillars.body");
  const stepsEyebrow = useContentText("howtoadu.steps.eyebrow");
  const stepsHeading = useContentText("howtoadu.steps.heading");
  const closerHeading = useContentText("howtoadu.closer.heading");
  const closerBody = useContentText("howtoadu.closer.body");
  const closerCtaPrimary = useContentText("howtoadu.closer.cta_primary");
  const closerCtaSecondary = useContentText("howtoadu.closer.cta_secondary");

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-canvas pt-24 sm:pt-28 pb-10 sm:pb-12 border-b border-stroke">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/8 blur-3xl animate-drift-glow" />

        <div className="relative container mx-auto px-5 sm:px-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 mb-4 animate-fade-up" style={{ animationDelay: "0ms" }}>
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">
              {heroEyebrow}
            </span>
          </div>

          <h1
            className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            {heroHeadingPre} <span className="italic">{heroHeadingEmphasis}</span>
          </h1>

          <p
            className="mt-4 sm:mt-5 text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            {heroBodyPre}{" "}
            <span className="text-paper">{heroBodyEmphasis}</span>
          </p>

          <div
            className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm animate-fade-up"
            style={{ animationDelay: "380ms" }}
          >
            <a href="#pillars" className="inline-flex items-center gap-1.5 text-paper hover:text-accent transition-colors">
              {heroLinkPillars} <FiArrowRight className="text-xs" />
            </a>
            <span className="text-paper-dim/40">·</span>
            <a href="#steps" className="inline-flex items-center gap-1.5 text-paper-dim hover:text-paper transition-colors">
              {heroLinkSteps}
            </a>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="pillars" className="bg-canvas py-16 sm:py-20 border-t border-stroke scroll-mt-20">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            {pillarsEyebrow}
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-snug tracking-tight max-w-3xl">
            {pillarsHeading}
          </h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mt-5 max-w-2xl">
            {pillarsBody}
          </p>

          <div className="grid md:grid-cols-3 gap-4 sm:gap-5 mt-10 sm:mt-12">
            {Array.from({ length: HOW_TO_ADU_PILLARS_COUNT }, (_, i) => <Pillar key={i} i={i} />)}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section id="steps" className="bg-canvas py-16 sm:py-24 border-t border-stroke scroll-mt-20">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            {stepsEyebrow}
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-snug tracking-tight max-w-2xl mb-10 sm:mb-12">
            {stepsHeading}
          </h2>

          <div className="space-y-px">
            {Array.from({ length: HOW_TO_ADU_STEPS_COUNT }, (_, i) => <Step key={i} i={i} />)}
          </div>
        </div>
      </section>

      {/* Closer */}
      <section className="bg-canvas py-16 sm:py-24 border-t border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-3xl text-center">
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-snug tracking-tight mb-5">
            {closerHeading}
          </h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-9">
            {closerBody}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/unlock"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              {closerCtaPrimary}
              <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/course-outline"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-stroke text-paper font-medium hover:border-paper-dim transition"
            >
              {closerCtaSecondary}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HowToAdu;
