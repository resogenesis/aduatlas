import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiMap, FiUsers } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import SitePlanArt from "../components/common/SitePlanArt";
import CostsArt from "../components/common/CostsArt";
import JourneyTrail from "../components/common/JourneyTrail";
import { TRAIL } from "../lib/journeyTrail";
import { useContentImage, useContentText } from "../lib/content";
import { HOW_PILLARS_COUNT, HOW_STEPS_COUNT } from "../lib/contentRegistry/howToAdu";
import { AdminEditableSection } from "../lib/adminEditBridge";

// How It Works (Phase 1 scope §2): the journey in five steps, each with a
// picture, alternating sides. Steps 3 and 4 use drawn illustrations so the
// page never promises a photo of a deliverable that does not exist yet.

const PILLAR_ICONS = [FiBookOpen, FiMap, FiUsers];
const StepIcon = ({ i }) => {
  const Icon = TRAIL[i].Icon;
  return <Icon aria-hidden />;
};
const STEP_LINKS = ["/property", "/course-outline", "/unlock?tier=report", "/course-outline", "/find-a-builder"];
const STEP_LINK_LABELS = ["Check my property", "See the course", "See Platinum", "See the course", "About builders"];

const StepImage = ({ i }) => {
  const image = useContentImage(`howtoadu.step.${i}.image`);
  if (i === 2) return <div className="rounded-3xl border border-stroke overflow-hidden shadow-[0_30px_60px_-40px_rgba(23,32,27,0.35)]"><SitePlanArt /></div>;
  if (i === 3) return <CostsArt className="max-w-md mx-auto lg:mx-0" />;
  return (
    <div className="rounded-3xl overflow-hidden aspect-[4/3] shadow-[0_30px_60px_-40px_rgba(23,32,27,0.35)]">
      <img src={image.src} alt={image.alt} className="w-full h-full object-cover" />
    </div>
  );
};

const Step = ({ i }) => {
  const title = useContentText(`howtoadu.step.${i}.title`);
  const desc = useContentText(`howtoadu.step.${i}.desc`);
  const flip = i % 2 === 1;
  const keys = [`howtoadu.step.${i}.title`, `howtoadu.step.${i}.desc`, ...(i === 2 || i === 3 ? [] : [`howtoadu.step.${i}.image`])];
  return (
    <AdminEditableSection keys={keys} label={`Step ${i + 1}`}>
      <li id={`step-${TRAIL[i].id}`} className="grid lg:grid-cols-12 gap-8 lg:gap-14 items-center py-12 lg:py-16 border-t border-stroke first:border-t-0 scroll-mt-24">
        <div className={`lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
          <p className="inline-flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-full bg-accent text-accent-fg inline-flex items-center justify-center text-lg">
              <StepIcon i={i} />
            </span>
            <span className="text-paper-dim text-sm">Step {i + 1} of {HOW_STEPS_COUNT}</span>
          </p>
          <h2 className="font-display text-paper text-3xl sm:text-4xl leading-[1.05] mb-4">{title}</h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-6">{desc}</p>
          <Link to={STEP_LINKS[i]} className="group inline-flex items-center gap-2 text-accent font-medium">
            {STEP_LINK_LABELS[i]} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        <div className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
          <StepImage i={i} />
        </div>
      </li>
    </AdminEditableSection>
  );
};

const Pillar = ({ i }) => {
  const Icon = PILLAR_ICONS[i];
  const title = useContentText(`howtoadu.pillar.${i}.title`);
  const desc = useContentText(`howtoadu.pillar.${i}.desc`);
  return (
    <li className="lift bg-canvas border border-stroke rounded-3xl p-7">
      <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent inline-flex items-center justify-center text-xl mb-5">
        <Icon aria-hidden />
      </span>
      <h3 className="font-display text-paper text-xl mb-2">{title}</h3>
      <p className="text-paper-dim text-sm leading-relaxed">{desc}</p>
    </li>
  );
};

const HowToAdu = () => {
  const title = useContentText("howtoadu.header.title");
  const body = useContentText("howtoadu.header.body");
  const pillarsHeading = useContentText("howtoadu.pillars.heading");
  const closerHeading = useContentText("howtoadu.closer.heading");
  const closerBody = useContentText("howtoadu.closer.body");
  const ctaPrimary = useContentText("howtoadu.closer.cta_primary");
  const ctaSecondary = useContentText("howtoadu.closer.cta_secondary");

  return (
    <div className="w-full bg-canvas">
      <AdminEditableSection keys={["howtoadu.header.title", "howtoadu.header.body"]} label="Header">
        <PageHeader title={title} subtitle={body}>
          <JourneyTrail />
        </PageHeader>
      </AdminEditableSection>

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl py-6 lg:py-10">
        <ol>
          {Array.from({ length: HOW_STEPS_COUNT }, (_, i) => (
            <Step key={i} i={i} />
          ))}
        </ol>
      </section>

      <AdminEditableSection keys={["howtoadu.pillars.heading", ...Array.from({ length: HOW_PILLARS_COUNT }, (_, i) => [`howtoadu.pillar.${i}.title`, `howtoadu.pillar.${i}.desc`]).flat()]} label="What you get">
        <section className="bg-surface-1-solid border-y border-stroke">
          <div className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
            <h2 className="font-display text-paper text-3xl sm:text-4xl leading-[1.05] mb-8">{pillarsHeading}</h2>
            <ul className="grid md:grid-cols-3 gap-5">
              {Array.from({ length: HOW_PILLARS_COUNT }, (_, i) => (
                <Pillar key={i} i={i} />
              ))}
            </ul>
          </div>
        </section>
      </AdminEditableSection>

      <AdminEditableSection keys={["howtoadu.closer.heading", "howtoadu.closer.body", "howtoadu.closer.cta_primary", "howtoadu.closer.cta_secondary"]} label="Closer">
        <section className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
          <div className="bg-forest-deep text-white rounded-3xl p-8 sm:p-12 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7">
              <h2 className="font-display text-3xl sm:text-4xl leading-[1.05] mb-3">{closerHeading}</h2>
              <p className="text-white/80 text-base sm:text-lg leading-relaxed">{closerBody}</p>
            </div>
            <div className="lg:col-span-5 lg:justify-self-end flex flex-wrap gap-3">
              <Link to="/property" className="press inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-forest-deep font-semibold text-sm hover:bg-mist transition-colors">
                {ctaPrimary} <FiArrowRight />
              </Link>
              <Link to="/unlock" className="press inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/30 text-white font-medium text-sm hover:bg-white/10 transition-colors">
                {ctaSecondary}
              </Link>
            </div>
          </div>
        </section>
      </AdminEditableSection>
    </div>
  );
};

export default HowToAdu;
