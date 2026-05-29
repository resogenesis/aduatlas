import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiPlayCircle, FiFileText, FiHelpCircle, FiImage } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";

const chapterIncludes = [
  { Icon: FiPlayCircle, label: "1-minute overview video" },
  { Icon: FiFileText, label: "PDF lesson" },
  { Icon: FiHelpCircle, label: "Short quiz" },
  { Icon: FiImage, label: "Selected chapters include photos and videos" },
];

const chapters = [
  {
    n: "01",
    title: "ADU Basics",
    desc: "Who, what, when, where, why, and how. Includes a brief history of ADUs.",
  },
  {
    n: "02",
    title: "The 10-Step ADU Process",
    desc: "Learn → Explore → Plan → Build.",
  },
  {
    n: "03",
    title: "Understanding ADU Regulations",
    desc: "City, county, ZIP-level, and HOA regulations that impact your project.",
  },
  {
    n: "04",
    title: "Can My Property Support an ADU?",
    desc: "The lot and backyard characteristics that matter.",
    tag: "Extensive ADU photos and videos",
  },
  {
    n: "05",
    title: "Explore 25+ ADU Types",
    desc: "ADU styles, construction methods, and price-versus-value comparisons.",
  },
  {
    n: "06",
    title: "Pre-Site Preparation",
    desc: "What to evaluate on your property before moving forward.",
  },
  {
    n: "07",
    title: "Budgeting, Permits & Timelines",
    desc: "Pre-site costs, permits, project timelines, construction, and finish costs.",
  },
  {
    n: "08",
    title: "Builder Preparation",
    desc: "Be ready to answer builder questions and ask the right questions of your own.",
  },
];

const ChapterCard = ({ c, i }) => {
  const ref = useReveal(i * 60);
  return (
    <div
      ref={ref}
      className="group bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="font-display text-paper-dim text-2xl sm:text-3xl tabular-nums group-hover:text-accent transition-colors">
          {c.n}
        </span>
        {c.tag && (
          <span className="text-[10px] sm:text-xs font-medium tracking-wider uppercase text-accent border border-accent/40 rounded-full px-2.5 py-1">
            {c.tag}
          </span>
        )}
      </div>
      <h3 className="font-display text-paper text-lg sm:text-xl leading-snug mb-2">{c.title}</h3>
      <p className="text-paper-dim text-sm sm:text-base leading-relaxed">{c.desc}</p>
    </div>
  );
};

const CourseOutline = () => {
  const headRef = useReveal(0);
  const stripRef = useReveal(120);
  const ctaRef = useReveal(180);

  return (
    <div className="w-full bg-canvas">
      {/* HERO */}
      <section className="pt-28 sm:pt-32 lg:pt-40 pb-14 sm:pb-20 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <div ref={headRef}>
            <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
              ADUAtlas ADU Course
            </p>
            <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-3xl">
              Course outline.
            </h1>
            <p className="mt-6 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed">
              Designed for homeowners in the pre construction planning phase, nationwide.
            </p>
          </div>

          {/* Price + access strip */}
          <div
            ref={stripRef}
            className="mt-10 sm:mt-12 grid sm:grid-cols-3 gap-px bg-stroke border border-stroke rounded-2xl overflow-hidden"
          >
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Course fee</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">$99</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                Applied as a credit toward the $399 Property Feasibility Study.
              </p>
            </div>
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Access</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">Forever</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                Yours to keep. Renew the latest information any year for $99.
              </p>
            </div>
            <div className="bg-surface-1-solid p-6 sm:p-7">
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Length</p>
              <p className="font-display text-paper text-3xl sm:text-4xl">10 chapters</p>
              <p className="text-paper-dim text-sm mt-2 leading-snug">
                Each ends with a short quiz so you know what you actually retained.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT EACH CHAPTER INCLUDES */}
      <section className="py-16 sm:py-20 border-b border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Each chapter includes
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-10 max-w-2xl">
            Short, structured, and built for retention.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {chapterIncludes.map(({ Icon, label }) => (
              <div
                key={label}
                className="bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6 flex items-start gap-3"
              >
                <span className="text-accent text-xl mt-0.5 shrink-0" aria-hidden>
                  <Icon />
                </span>
                <p className="text-paper text-sm sm:text-base leading-snug">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-paper-dim text-sm mt-6">
            Chapter 4 includes extensive ADU photos and videos.
          </p>
        </div>
      </section>

      {/* CHAPTER LIST */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Chapters
          </p>
          <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-snug tracking-tight mb-10 max-w-2xl">
            What you'll learn.
          </h2>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
            {chapters.map((c, i) => <ChapterCard key={c.n} c={c} i={i} />)}
          </div>

          <p className="text-paper-dim text-sm mt-8">
            Chapters 9–10 finalizing. Your access never expires. Renew any year for $99 to refresh with the latest regulations, types, and costs.
          </p>

          {/* CTA */}
          <div ref={ctaRef} className="mt-14 sm:mt-16 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              Start the ADU Course — $99
              <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-paper-dim text-sm inline-flex items-center gap-2">
              <FiCheck className="text-accent" />
              Credit toward your $399 Property Feasibility Study
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CourseOutline;
