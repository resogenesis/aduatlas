import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentImage, useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = ["home.mission.eyebrow", "home.mission.heading", "home.mission.body", "home.mission.cta", "home.mission.image"];

const Mission = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.mission.eyebrow");
  const heading = useContentText("home.mission.heading");
  const body = useContentText("home.mission.body");
  const cta = useContentText("home.mission.cta");
  const image = useContentImage("home.mission.image");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Mission band">
      <section className="relative overflow-hidden text-white">
        <img src={image.src} alt={image.alt} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(31,68,50,0.92)_0%,rgba(31,68,50,0.78)_55%,rgba(31,68,50,0.6)_100%)]" />
        <div ref={ref} className="container mx-auto px-5 sm:px-8 py-16 lg:py-20 relative grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8">
            <p className="text-white/70 text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-4">{eyebrow}</p>
            <h2 className="font-primary font-extrabold text-3xl sm:text-4xl lg:text-[2.6rem] leading-[1.05] tracking-[-0.025em] mb-4">{heading}</h2>
            <p className="text-white/85 text-base leading-relaxed max-w-2xl">{body}</p>
          </div>
          <div className="lg:col-span-4 lg:justify-self-end">
            <Link
              to="/about"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-forest-deep font-semibold text-sm hover:bg-mist transition-colors"
            >
              {cta} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Mission;
