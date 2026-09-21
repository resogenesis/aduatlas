import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiHome, FiMap, FiUsers } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { STAGES_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

// Four doors, one per stage of the journey. Each routes to the place on the
// site that serves that stage, so a visitor self-selects instead of reading.
const STAGES = [
  { Icon: FiBookOpen, to: "/course-outline" },
  { Icon: FiHome, to: "/property" },
  { Icon: FiMap, to: "/unlock?tier=report" },
  { Icon: FiUsers, to: "/find-a-builder" },
];
const EDIT_KEYS = ["home.stages.heading", ...Array.from({ length: STAGES_COUNT }, (_, i) => [`home.stages.item.${i}.title`, `home.stages.item.${i}.desc`]).flat()];

const Tile = ({ i }) => {
  const ref = useReveal(i * 80);
  const title = useContentText(`home.stages.item.${i}.title`);
  const desc = useContentText(`home.stages.item.${i}.desc`);
  const { Icon, to } = STAGES[i];
  return (
    <li ref={ref}>
      <Link to={to} className="lift press group h-full flex flex-col bg-canvas border border-stroke rounded-2xl p-6 hover:border-accent">
        <span className="w-11 h-11 rounded-xl bg-surface-1-solid text-accent inline-flex items-center justify-center text-xl mb-5">
          <Icon aria-hidden />
        </span>
        <span className="font-display text-paper text-lg leading-tight mb-1.5">{title}</span>
        <span className="text-paper-dim text-sm leading-relaxed flex-1">{desc}</span>
        <span className="mt-5 inline-flex items-center gap-1 text-accent text-sm font-medium">
          Start here <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </span>
      </Link>
    </li>
  );
};

const Stages = () => {
  const ref = useReveal();
  const heading = useContentText("home.stages.heading");
  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Where are you">
      <section className="bg-canvas">
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
          <h2 ref={ref} className="font-display text-paper text-3xl sm:text-4xl leading-[1.05] mb-8 text-center">
            {heading}
          </h2>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
            {Array.from({ length: STAGES_COUNT }, (_, i) => (
              <Tile key={i} i={i} />
            ))}
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Stages;
