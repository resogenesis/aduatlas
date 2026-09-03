import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiPlayCircle, FiFileText, FiHelpCircle, FiImage } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";
import { useContentText } from "../lib/content";
import { COURSE_OUTLINE_MODULES_META } from "../lib/contentRegistry/courseOutline";

// Icons + item order stay code-owned; every text leaf is admin-editable via
// the courseoutline.* keys in src/lib/contentRegistry/courseOutline.js.
const INCLUDE_ICONS = [FiPlayCircle, FiFileText, FiHelpCircle, FiImage];
const MAX_TOPICS = 3;

const IncludeItem = ({ i }) => {
  const Icon = INCLUDE_ICONS[i];
  const label = useContentText(`courseoutline.include.${i}.label`);
  return (
    <div className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6 flex items-start gap-3">
      <span className="text-accent text-xl mt-0.5 shrink-0" aria-hidden>
        <Icon />
      </span>
      <p className="text-paper text-sm sm:text-base leading-snug">{label}</p>
    </div>
  );
};

// Every ModuleCard calls the same fixed set of hooks (title/desc/tag/note +
// MAX_TOPICS topic slots) regardless of this module's actual field set —
// unused slots have no registry entry and resolve to "", so hook call order
// never varies per the rules of hooks.
const ModuleCard = ({ meta, i }) => {
  const ref = useReveal(i * 50);
  const title = useContentText(`courseoutline.module.${i}.title`);
  const tag = useContentText(`courseoutline.module.${i}.tag`);
  const desc = useContentText(`courseoutline.module.${i}.desc`);
  const note = useContentText(`courseoutline.module.${i}.note`);
  const allTopics = [
    useContentText(`courseoutline.module.${i}.topic.0`),
    useContentText(`courseoutline.module.${i}.topic.1`),
    useContentText(`courseoutline.module.${i}.topic.2`),
  ];
  const topics = allTopics.slice(0, meta.topicCount);

  return (
    <div
      ref={ref}
      className="group bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="font-display text-paper-dim text-2xl sm:text-3xl tabular-nums group-hover:text-accent transition-colors">
          {meta.n}
        </span>
        {meta.hasTag && (
          <span className="text-[10px] sm:text-xs font-medium tracking-wider uppercase text-accent border border-accent/40 rounded-full px-2.5 py-1">
            {tag}
          </span>
        )}
      </div>
      <h3 className="font-display text-paper text-lg sm:text-xl leading-snug mb-2">{title}</h3>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed">{desc}</p>
      {topics.length > 0 && (
        <ul className="mt-4 space-y-2">
          {topics.map((t, j) => (
            <li key={j} className="flex items-start gap-2 text-paper-dim/90 text-sm leading-relaxed">
              <FiCheck className="shrink-0 mt-0.5 text-accent" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {meta.hasNote && (
        <p className="mt-4 text-sm italic text-accent/90 border-l-2 border-accent/40 pl-3">
          {note}
        </p>
      )}
    </div>
  );
};

const CourseOutline = () => {
  const headRef = useReveal(0);
  const stripRef = useReveal(120);
  const ideaRef = useReveal(120);
  const ctaRef = useReveal(180);

  const heroEyebrow = useContentText("courseoutline.hero.eyebrow");
  const heroHeading = useContentText("courseoutline.hero.heading");
  const heroBody = useContentText("courseoutline.hero.body");

  const strip0Label = useContentText("courseoutline.strip.0.label");
  const strip0Value = useContentText("courseoutline.strip.0.value");
  const strip0Desc = useContentText("courseoutline.strip.0.desc");
  const strip1Label = useContentText("courseoutline.strip.1.label");
  const strip1Value = useContentText("courseoutline.strip.1.value");
  const strip1Desc = useContentText("courseoutline.strip.1.desc");
  const strip2Label = useContentText("courseoutline.strip.2.label");
  const strip2Value = useContentText("courseoutline.strip.2.value");
  const strip2Desc = useContentText("courseoutline.strip.2.desc");

  const includesEyebrow = useContentText("courseoutline.includes.eyebrow");
  const includesHeading = useContentText("courseoutline.includes.heading");
  const includesNote = useContentText("courseoutline.includes.note");

  const modulesEyebrow = useContentText("courseoutline.modules.eyebrow");
  const modulesHeading = useContentText("courseoutline.modules.heading");
  const modulesFootnote = useContentText("courseoutline.modules.footnote");

  const ideaEyebrow = useContentText("courseoutline.idea.eyebrow");
  const ideaBodyPre = useContentText("courseoutline.idea.body_pre");
  const ideaBodyEmphasis = useContentText("courseoutline.idea.body_emphasis");
  const ideaBodyPost = useContentText("courseoutline.idea.body_post");
  const ctaButton = useContentText("courseoutline.cta.button");
  const ctaNote = useContentText("courseoutline.cta.note");

  return (
    <div className="w-full bg-canvas">
      {/* HERO */}
      <section className="pt-28 sm:pt-32 lg:pt-40 pb-14 sm:pb-20 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <div ref={headRef}>
            <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
              {heroEyebrow}
            </p>
            <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-3xl">
              {heroHeading}
            </h1>
            <p className="mt-6 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed">
              {heroBody}
            </p>
          </div>

          {/* Price + access strip */}
          <div
            ref={stripRef}
            className="mt-10 sm:mt-12 grid sm:grid-cols-3 gap-px bg-stroke border border-stroke rounded-2xl overflow-hidden"
          >
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">{strip0Label}</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">{strip0Value}</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                {strip0Desc}
              </p>
            </div>
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">{strip1Label}</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">{strip1Value}</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                {strip1Desc}
              </p>
            </div>
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">{strip2Label}</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">{strip2Value}</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                {strip2Desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT EACH MODULE INCLUDES */}
      <section className="py-16 sm:py-20 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            {includesEyebrow}
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-10 max-w-2xl">
            {includesHeading}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {INCLUDE_ICONS.map((_, i) => <IncludeItem key={i} i={i} />)}
          </div>
          <p className="text-paper-dim text-sm mt-6">
            {includesNote}
          </p>
        </div>
      </section>

      {/* MODULE LIST */}
      <section className="py-16 sm:py-24 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            {modulesEyebrow}
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-10 max-w-2xl">
            {modulesHeading}
          </h2>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
            {COURSE_OUTLINE_MODULES_META.map((meta, i) => <ModuleCard key={meta.n} meta={meta} i={i} />)}
          </div>

          <p className="text-paper-dim text-sm mt-8">
            {modulesFootnote}
          </p>
        </div>
      </section>

      {/* CORE IDEA + CTA */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <div
            ref={ideaRef}
            className="bg-surface-1-solid border border-stroke rounded-2xl p-7 sm:p-10"
          >
            <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
              {ideaEyebrow}
            </p>
            <p className="font-display text-paper text-2xl sm:text-3xl leading-snug tracking-tight max-w-3xl">
              {ideaBodyPre} <span className="italic">{ideaBodyEmphasis}</span> {ideaBodyPost}
            </p>
          </div>

          <div ref={ctaRef} className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {ctaButton}
              <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-paper-dim text-sm inline-flex items-center gap-2">
              <FiCheck className="text-accent" />
              {ctaNote}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CourseOutline;
