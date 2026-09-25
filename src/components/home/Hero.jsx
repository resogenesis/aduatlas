import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import { useContentImage, useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.hero.heading",
  "home.hero.body",
  "home.hero.cta",
  "home.hero.reassurance",
  "home.hero.image",
];

// Hand-drawn gold underline for the second headline line.
const Underline = () => (
  <svg viewBox="0 0 320 14" className="absolute left-0 -bottom-2 w-full h-[0.32em] text-gold" aria-hidden preserveAspectRatio="none">
    <path d="M3 10 C 60 3, 140 2, 200 6 S 290 12, 317 5" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

// Faint topographic contours behind the copy.
const Contours = () => (
  <svg className="absolute -left-24 top-0 h-full w-[46rem] text-paper pointer-events-none" viewBox="0 0 700 600" fill="none" aria-hidden>
    {[0, 1, 2, 3, 4, 5].map((k) => (
      <path
        key={k}
        d={`M-40 ${120 + k * 70} C 150 ${60 + k * 60}, 300 ${220 + k * 55}, 460 ${110 + k * 65} S 700 ${60 + k * 60}, 760 ${180 + k * 60}`}
        stroke="currentColor"
        strokeOpacity="0.05"
        strokeWidth="1"
      />
    ))}
  </svg>
);

// Hero: heading, one line of copy, one button to the packages. Phase 1 has no
// public property-address step; the journey starts at the package choice.
const Hero = () => {
  const heading = useContentText("home.hero.heading");
  const body = useContentText("home.hero.body");
  const cta = useContentText("home.hero.cta");
  const reassurance = useContentText("home.hero.reassurance");
  const image = useContentImage("home.hero.image");
  const [line1, line2] = heading.split("\n");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Hero">
      <section className="bg-surface-1-solid relative overflow-hidden">
        <Contours />
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl pt-10 pb-14 sm:pt-14 sm:pb-16 lg:pt-16 lg:pb-20 grid lg:grid-cols-12 gap-10 lg:gap-10 items-center relative">
          <div className="lg:col-span-6 animate-fade-up">
            <h1 className="font-primary font-extrabold text-paper text-[2.75rem] sm:text-6xl lg:text-[4.75rem] xl:text-[5.5rem] leading-[0.96] tracking-[-0.035em] mb-7">
              {line1}
              {line2 && (
                <>
                  <br />
                  <span className="relative inline-block">
                    {line2}
                    <Underline />
                  </span>
                </>
              )}
            </h1>
            <p className="text-paper-dim text-lg sm:text-xl leading-relaxed max-w-lg mb-9">{body}</p>
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors press"
            >
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <p className="mt-4 flex items-center gap-2 text-sm sm:text-base text-paper-dim">
              <FiCheck className="text-accent" aria-hidden /> {reassurance}
            </p>
          </div>

          <div className="lg:col-span-6 relative animate-fade-up lg:-mr-8 xl:-mr-[calc((100vw-1280px)/2+1rem)]" style={{ animationDelay: "120ms" }}>
            <div className="relative rounded-[1.75rem] overflow-hidden aspect-[3/2] lg:aspect-auto lg:h-[32rem] xl:h-[34rem] shadow-[0_30px_60px_-30px_rgba(23,32,27,0.35)]">
              <img src={image.src} alt={image.alt} className="w-full h-full object-cover object-[55%_center] -scale-x-100" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-forest-deep/40 to-transparent" />
            </div>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Hero;
