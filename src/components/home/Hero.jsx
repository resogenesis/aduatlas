import { FiCheck } from "react-icons/fi";
import { useContentImage, useContentText } from "../../lib/content";
import { HERO_CHECKS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";
import AddressIntake from "./AddressIntake";

const EDIT_KEYS = [
  "home.hero.eyebrow",
  "home.hero.heading",
  "home.hero.body",
  "home.hero.cta",
  "home.hero.placeholder",
  "home.hero.reassurance",
  ...Array.from({ length: HERO_CHECKS_COUNT }, (_, i) => `home.hero.check.${i}`),
  "home.hero.image",
];

const Lines = ({ text }) =>
  text.split("\n").map((line, i, arr) => (
    <span key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </span>
  ));

const Hero = () => {
  const eyebrow = useContentText("home.hero.eyebrow");
  const heading = useContentText("home.hero.heading");
  const body = useContentText("home.hero.body");
  const cta = useContentText("home.hero.cta");
  const placeholder = useContentText("home.hero.placeholder");
  const reassurance = useContentText("home.hero.reassurance");
  const checks = [
    useContentText("home.hero.check.0"),
    useContentText("home.hero.check.1"),
    useContentText("home.hero.check.2"),
    useContentText("home.hero.check.3"),
  ];
  const image = useContentImage("home.hero.image");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Hero">
      <section className="bg-surface-1-solid">
        <div className="container mx-auto px-5 sm:px-8 pt-10 pb-14 lg:pt-14 lg:pb-20 grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Copy */}
          <div className="lg:col-span-5 animate-fade-up">
            <p className="text-accent text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-5">{eyebrow}</p>
            <h1 className="font-primary font-extrabold text-paper text-[2.75rem] sm:text-6xl lg:text-[4.25rem] leading-[0.98] tracking-[-0.03em] mb-6">
              <Lines text={heading} />
            </h1>
            <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-md mb-8">{body}</p>
            <AddressIntake cta={cta} placeholder={placeholder} className="max-w-lg" />
            <p className="mt-3 inline-flex items-center gap-2 text-xs sm:text-sm text-paper-dim">
              <FiCheck className="text-accent" aria-hidden /> {reassurance}
            </p>
            <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-paper-dim tracking-wide">
              {checks.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-4 whitespace-nowrap">
                  {i > 0 && <span className="text-stroke" aria-hidden>·</span>}
                  {c}
                </span>
              ))}
            </p>
          </div>

          {/* Photo */}
          <div className="lg:col-span-7 relative animate-fade-up lg:-mr-8 xl:-mr-[calc((100vw-1280px)/2+2rem)]" style={{ animationDelay: "120ms" }}>
            <div className="rounded-[2rem] lg:rounded-r-none overflow-hidden aspect-[3/2] lg:aspect-auto lg:h-[34rem] xl:h-[38rem] shadow-[0_30px_60px_-30px_rgba(23,32,27,0.35)]">
              <img src={image.src} alt={image.alt} className="w-full h-full object-cover object-[55%_center] -scale-x-100" />
            </div>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Hero;
