import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = ["home.cta.heading", "home.cta.body", "home.cta.button"];

// Forest band to close: one line, one button to the packages.
const ClosingCta = () => {
  const ref = useReveal();
  const heading = useContentText("home.cta.heading");
  const body = useContentText("home.cta.body");
  const button = useContentText("home.cta.button");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Closing call to action">
      <section className="bg-accent text-white">
        <div ref={ref} className="container mx-auto px-5 sm:px-8 max-w-6xl section-y grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <p className="font-primary font-extrabold tracking-[-0.025em] text-3xl sm:text-4xl leading-[1.05] mb-2">{heading}</p>
            <p className="text-white/75 text-base">{body}</p>
          </div>
          <div className="lg:col-span-7 lg:justify-self-end">
            <Link
              to="/unlock"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-forest-deep text-white font-semibold text-sm hover:bg-paper hover:text-white transition-colors press"
            >
              {button} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default ClosingCta;
