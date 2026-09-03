import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";
import { useContentText, paragraphs } from "../lib/content";
import { ABOUT_STATS_COUNT, ABOUT_CHAPTERS_COUNT } from "../lib/contentRegistry/about";

// Chapter numbers (01-05) are code-owned display labels, not content.
const CHAPTER_N = ["01", "02", "03", "04", "05"];

const Stat = ({ i }) => {
  const ref = useReveal(i * 60);
  const n = useContentText(`about.stat.${i}.n`);
  const label = useContentText(`about.stat.${i}.label`);
  return (
    <div ref={ref} className="px-5 sm:px-7 py-7 bg-surface-1-solid">
      <p className="font-display text-paper text-3xl sm:text-4xl mb-2">{n}</p>
      <p className="text-paper-dim text-xs uppercase tracking-[0.15em] leading-relaxed">{label}</p>
    </div>
  );
};

const Chapter = ({ i, isLast }) => {
  const ref = useReveal(0);
  const eyebrow = useContentText(`about.chapter.${i}.eyebrow`);
  const title = useContentText(`about.chapter.${i}.title`);
  const body = useContentText(`about.chapter.${i}.body`);
  const pullQuote = useContentText(`about.pullquote.${i}`);
  return (
    <article ref={ref} className="grid lg:grid-cols-12 gap-6 lg:gap-12 py-12 sm:py-16 border-t border-stroke">
      <div className="lg:col-span-4 lg:sticky lg:top-32 lg:self-start">
        <span className="font-display text-accent text-5xl sm:text-6xl block mb-3">{CHAPTER_N[i]}</span>
        <p className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">{eyebrow}</p>
      </div>
      <div className="lg:col-span-8">
        <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-[1.1] tracking-tight mb-6">
          {title}
        </h2>
        <div className="space-y-5 text-paper-dim text-base sm:text-lg leading-relaxed">
          {paragraphs(body).map((p, j) => <p key={j}>{p}</p>)}
        </div>
        {!isLast && pullQuote && (
          <p className="font-display italic text-accent text-2xl sm:text-3xl mt-10 leading-snug">
            {pullQuote}
          </p>
        )}
      </div>
    </article>
  );
};

const About = () => {
  const heroRef = useReveal(0);
  const closingRef = useReveal(0);
  const heroEyebrow = useContentText("about.hero.eyebrow");
  const heroHeadingPre = useContentText("about.hero.heading_pre");
  const heroHeadingEmphasis = useContentText("about.hero.heading_emphasis");
  const heroBody1 = useContentText("about.hero.body1");
  const heroBody2 = useContentText("about.hero.body2");
  const closingEyebrow = useContentText("about.closing.eyebrow");
  const closingHeading = useContentText("about.closing.heading");
  const closingBody = useContentText("about.closing.body");
  const closingCtaPrimary = useContentText("about.closing.cta_primary");
  const closingCtaSecondary = useContentText("about.closing.cta_secondary");

  return (
    <div className="bg-canvas">
      {/* Editorial hero */}
      <section className="relative overflow-hidden pt-32 sm:pt-40 lg:pt-48 pb-16 sm:pb-20">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-accent/10 blur-3xl animate-drift-glow" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-accent/5 blur-3xl animate-drift-glow" style={{ animationDelay: "-7s" }} />

        <div ref={heroRef} className="relative container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5 animate-fade-up" style={{ animationDelay: "0ms" }}>
            {heroEyebrow}
          </p>
          <h1
            className="font-display font-medium text-paper text-[2.6rem] sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[1.02] tracking-tight max-w-4xl animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            {heroHeadingPre} <span className="italic text-paper-dim">{heroHeadingEmphasis}</span>
          </h1>
          <p
            className="mt-7 sm:mt-9 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "260ms" }}
          >
            {heroBody1}
          </p>
          <p
            className="mt-5 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "340ms" }}
          >
            {heroBody2}
          </p>
        </div>
      </section>

      {/* Stat strip */}
      <section className="container mx-auto px-5 sm:px-8 max-w-5xl pb-16">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-stroke rounded-2xl overflow-hidden">
          {Array.from({ length: ABOUT_STATS_COUNT }, (_, i) => <Stat key={i} i={i} />)}
        </div>
      </section>

      {/* Chapters */}
      <section className="container mx-auto px-5 sm:px-8 max-w-5xl">
        {Array.from({ length: ABOUT_CHAPTERS_COUNT }, (_, i) => (
          <Chapter key={i} i={i} isLast={i === ABOUT_CHAPTERS_COUNT - 1} />
        ))}
      </section>

      {/* Closing card */}
      <section className="container mx-auto px-5 sm:px-8 max-w-4xl py-20 sm:py-28">
        <div ref={closingRef} className="bg-accent text-accent-fg rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-canvas/10 blur-3xl" />
          </div>
          <p className="relative text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-5">
            {closingEyebrow}
          </p>
          <h2 className="relative font-display font-medium text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            {closingHeading}
          </h2>
          <p className="relative text-accent-fg/80 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed italic">
            {closingBody}
          </p>
          <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
            >
              {closingCtaPrimary} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/unlock"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-accent-fg/20 text-accent-fg font-medium hover:border-accent-fg/60 transition"
            >
              {closingCtaSecondary}
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default About;
