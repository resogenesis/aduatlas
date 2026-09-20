import { FiCheck, FiDollarSign, FiHome, FiLayers, FiTrendingUp } from "react-icons/fi";
import { useContentImage, useContentText } from "../../lib/content";
import { HERO_CARD_ITEMS_COUNT, HERO_CHECKS_COUNT } from "../../lib/contentRegistry/home";
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
  "home.hero.card.eyebrow",
  "home.hero.card.title",
  ...Array.from({ length: HERO_CARD_ITEMS_COUNT }, (_, i) => `home.hero.card.item.${i}`),
  "home.hero.image",
];

const CARD_ICONS = [FiLayers, FiDollarSign, FiTrendingUp];

const Lines = ({ text }) =>
  text.split("\n").map((line, i, arr) => (
    <span key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </span>
  ));

// Photo-first hero: the property photo runs edge to edge; the content panel
// sits on top of it and carries down into the next section, so the address
// box is the first thing a visitor can act on.
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
  const cardEyebrow = useContentText("home.hero.card.eyebrow");
  const cardTitle = useContentText("home.hero.card.title");
  const cardItems = [
    useContentText("home.hero.card.item.0"),
    useContentText("home.hero.card.item.1"),
    useContentText("home.hero.card.item.2"),
  ];
  const image = useContentImage("home.hero.image");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Hero">
      <section className="bg-surface-1-solid">
        <div className="relative h-[64vh] min-h-[500px] max-h-[720px] overflow-hidden">
          <img src={image.src} alt={image.alt} className="absolute inset-0 w-full h-full object-cover object-[55%_60%] -scale-x-100" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,32,27,0.18)_0%,rgba(23,32,27,0)_35%,rgba(23,32,27,0.25)_100%)]" />

          <div className="container mx-auto px-5 sm:px-8 relative h-full">
            <div className="hidden lg:block absolute right-8 top-10 bg-white/75 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_24px_60px_-24px_rgba(23,32,27,0.45)] p-6 w-[19.5rem] animate-fade-up">
              <p className="text-accent text-[0.65rem] font-semibold tracking-[0.24em] uppercase mb-2">{cardEyebrow}</p>
              <p className="font-display font-medium text-paper text-xl leading-snug mb-3">{cardTitle}</p>
              <ul className="divide-y divide-paper/10">
                {cardItems.map((item, i) => {
                  const Icon = CARD_ICONS[i] || FiHome;
                  return (
                    <li key={i} className="flex items-center gap-3 py-2.5 text-sm font-medium text-paper">
                      <span className="w-8 h-8 rounded-lg bg-white/85 text-accent inline-flex items-center justify-center shrink-0">
                        <Icon className="text-[0.95rem]" aria-hidden />
                      </span>
                      {item}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-5 sm:px-8 relative -mt-40 sm:-mt-48 lg:-mt-64 pb-14 lg:pb-20">
          <div className="bg-canvas rounded-[1.75rem] shadow-[0_40px_80px_-40px_rgba(23,32,27,0.45)] p-7 sm:p-10 lg:p-12 max-w-2xl animate-fade-up">
            <p className="text-accent text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-5">{eyebrow}</p>
            <h1 className="font-display font-medium text-paper text-[2.75rem] sm:text-6xl lg:text-[3.75rem] leading-[0.98] mb-5">
              <Lines text={heading} />
            </h1>
            <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-xl mb-8">{body}</p>
            <AddressIntake cta={cta} placeholder={placeholder} className="max-w-2xl" />
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-paper-dim">
              <span className="inline-flex items-center gap-2">
                <FiCheck className="text-accent" aria-hidden /> {reassurance}
              </span>
              <span className="hidden sm:inline-flex items-center gap-x-3">
                {checks.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-3 whitespace-nowrap">
                    {i > 0 && (
                      <span className="text-stroke" aria-hidden>
                        ·
                      </span>
                    )}
                    {c}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Hero;
