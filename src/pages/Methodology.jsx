import { Link } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiHelpCircle, FiShield } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";
import { useContentText } from "../lib/content";
import { METHODOLOGY_LEVELS_META } from "../lib/contentRegistry/methodology";

const ICONS = { FiCheck, FiHelpCircle, FiAlertTriangle };
const SOURCE_COUNT = 5;
const NOT_DOING_COUNT = 6;

const LevelRow = ({ meta, i }) => {
  const Icon = ICONS[meta.iconName];
  const label = useContentText(`methodology.level.${i}.label`);
  const when = useContentText(`methodology.level.${i}.when`);
  const example0 = useContentText(`methodology.level.${i}.example.0`);
  const example1 = useContentText(`methodology.level.${i}.example.1`);
  const example2 = useContentText(`methodology.level.${i}.example.2`);
  const examples = [example0, example1, example2];

  return (
    <div className="grid sm:grid-cols-12 gap-4 sm:gap-7 py-5 border-t border-stroke first:border-t-0 first:pt-0">
      <div className="sm:col-span-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${meta.pillClass}`}>
          <Icon className="text-xs" /> {label}
        </span>
      </div>
      <div className="sm:col-span-9">
        <p className="text-paper text-base sm:text-lg mb-3">{when}</p>
        <ul className="space-y-1.5">
          {examples.map((e, j) => (
            <li key={j} className="flex items-start gap-2 text-paper-dim text-sm">
              <span className="text-paper-dim/60 mt-1 shrink-0">·</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const SourceCard = ({ i }) => {
  const name = useContentText(`methodology.source.${i}.name`);
  const cadence = useContentText(`methodology.source.${i}.cadence`);
  const coverage = useContentText(`methodology.source.${i}.coverage`);
  return (
    <div className="bg-canvas p-5">
      <p className="text-paper text-sm font-medium mb-1">{name}</p>
      <p className="text-paper-dim text-xs mb-1">{cadence}</p>
      <p className="text-paper-dim/60 text-xs">{coverage}</p>
    </div>
  );
};

const NotDoingItem = ({ i }) => {
  const line = useContentText(`methodology.notdoing.item.${i}`);
  return (
    <li className="flex items-start gap-3 text-paper-dim text-sm sm:text-base">
      <span className="text-stroke mt-1 shrink-0">×</span>
      <span>{line}</span>
    </li>
  );
};

const Methodology = () => {
  const heroRef = useReveal(0);

  const heroBadge = useContentText("methodology.hero.badge");
  const heroHeadingPre = useContentText("methodology.hero.heading_pre");
  const heroHeadingEmphasis = useContentText("methodology.hero.heading_emphasis");
  const heroBody = useContentText("methodology.hero.body");

  const levelsEyebrow = useContentText("methodology.levels.eyebrow");
  const levelsHeading = useContentText("methodology.levels.heading");

  const pathEyebrow = useContentText("methodology.path.eyebrow");
  const pathHeading = useContentText("methodology.path.heading");
  const pathBody = useContentText("methodology.path.body");
  const pathExampleLabel = useContentText("methodology.path.example_label");
  const pathExampleRow = useContentText("methodology.path.example_row");
  const pathExampleConfidence = useContentText("methodology.path.example_confidence");
  const pathExampleQuote = useContentText("methodology.path.example_quote");

  const sourcesEyebrow = useContentText("methodology.sources.eyebrow");
  const sourcesHeading = useContentText("methodology.sources.heading");
  const sourcesFootnote1 = useContentText("methodology.sources.footnote_1");
  const sourcesFootnote2 = useContentText("methodology.sources.footnote_2");

  const notDoingBadge = useContentText("methodology.notdoing.badge");
  const notDoingHeadingPre = useContentText("methodology.notdoing.heading_pre");
  const notDoingHeadingEmphasis = useContentText("methodology.notdoing.heading_emphasis");
  const notDoingBody = useContentText("methodology.notdoing.body");
  const notDoingFootnote = useContentText("methodology.notdoing.footnote");

  const ctaHeading = useContentText("methodology.cta.heading");
  const ctaBody = useContentText("methodology.cta.body");
  const ctaButton = useContentText("methodology.cta.button");

  return (
    <div className="bg-canvas">
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-10 sm:pb-12 border-b border-stroke">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/8 blur-3xl animate-drift-glow" />

        <div ref={heroRef} className="relative container mx-auto px-5 sm:px-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 mb-4 animate-fade-up">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">
              {heroBadge}
            </span>
          </div>
          <h1
            className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-3xl animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            {heroHeadingPre} <span className="italic">{heroHeadingEmphasis}</span>
          </h1>
          <p
            className="mt-5 text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            {heroBody}
          </p>
        </div>
      </section>

      <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-14 sm:py-20 space-y-6">

        {/* Confidence levels */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <p className="text-accent text-xs uppercase tracking-[0.2em] mb-5">{levelsEyebrow}</p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-9">
            {levelsHeading}
          </h2>
          <div className="space-y-7">
            {METHODOLOGY_LEVELS_META.map((meta, i) => <LevelRow key={i} meta={meta} i={i} />)}
          </div>
        </section>

        {/* What raises a row */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <p className="text-accent text-xs uppercase tracking-[0.2em] mb-5">{pathEyebrow}</p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-5">
            {pathHeading}
          </h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-7 max-w-2xl">
            {pathBody}
          </p>
          <div className="bg-canvas border border-stroke rounded-2xl p-6">
            <p className="text-paper-dim text-[0.65rem] font-semibold tracking-[0.2em] uppercase mb-2">{pathExampleLabel}</p>
            <p className="text-paper text-sm sm:text-base mb-2">
              <span className="text-paper-dim">{pathExampleRow}</span>
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 mx-2 align-middle" />
              <span className="text-red-300 text-xs uppercase tracking-wider">{pathExampleConfidence}</span>
            </p>
            <p className="text-paper-dim text-sm leading-relaxed italic">
              "{pathExampleQuote}"
            </p>
          </div>
        </section>

        {/* Data sources + cadence */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <p className="text-accent text-xs uppercase tracking-[0.2em] mb-5">{sourcesEyebrow}</p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-7">
            {sourcesHeading}
          </h2>
          <div className="grid sm:grid-cols-2 gap-px bg-stroke rounded-2xl overflow-hidden">
            {Array.from({ length: SOURCE_COUNT }, (_, i) => <SourceCard key={i} i={i} />)}
          </div>
          <p className="text-paper-dim text-xs italic mt-6 leading-relaxed">
            {sourcesFootnote1}
          </p>
          <p className="text-paper-dim text-xs italic mt-3 leading-relaxed">
            {sourcesFootnote2}
          </p>
        </section>

        {/* What we don't do */}
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-12">
          <div className="flex items-center gap-2 text-accent text-xs uppercase tracking-[0.2em] mb-5">
            <FiShield /> {notDoingBadge}
          </div>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl tracking-tight mb-5">
            {notDoingHeadingPre} <span className="italic text-paper-dim">{notDoingHeadingEmphasis}</span>
          </h2>
          <p className="text-paper-dim text-base leading-relaxed mb-7 max-w-2xl">
            {notDoingBody}
          </p>
          <ul className="space-y-3">
            {Array.from({ length: NOT_DOING_COUNT }, (_, i) => <NotDoingItem key={i} i={i} />)}
          </ul>
          <p className="text-paper-dim text-xs italic mt-7 leading-relaxed max-w-2xl">
            {notDoingFootnote}
          </p>
        </section>

        {/* CTA */}
        <section className="bg-accent text-accent-fg rounded-3xl p-8 sm:p-12 text-center">
          <h2 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-4">
            {ctaHeading}
          </h2>
          <p className="text-accent-fg/80 text-base sm:text-lg max-w-xl mx-auto mb-7">
            {ctaBody}
          </p>
          <Link
            to="/"
            className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
          >
            {ctaButton} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </section>
      </div>
    </div>
  );
};

export default Methodology;
