import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = ["home.mission.eyebrow", "home.mission.heading", "home.mission.body", "home.mission.cta"];

// A quiet, centered statement. No photo: the page already carries one large
// image in the hero and the deep-green builder band provides contrast.
const Mission = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.mission.eyebrow");
  const heading = useContentText("home.mission.heading");
  const body = useContentText("home.mission.body");
  const cta = useContentText("home.mission.cta");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Mission">
      <section className="bg-surface-1-solid">
        <div ref={ref} className="container mx-auto px-5 sm:px-8 py-16 lg:py-24 text-center max-w-3xl">
          <p className="text-accent text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-5">{eyebrow}</p>
          <h2 className="font-primary font-extrabold tracking-[-0.025em] text-paper text-4xl sm:text-5xl leading-[1.02] mb-5">{heading}</h2>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8">{body}</p>
          <Link to="/about" className="group inline-flex items-center gap-2 text-sm font-semibold text-paper hover:text-accent transition-colors">
            {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Mission;
