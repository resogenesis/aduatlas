import { FaLeaf } from "react-icons/fa6";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";
import AddressIntake from "./AddressIntake";

const EDIT_KEYS = ["home.cta.heading", "home.cta.body", "home.cta.button", "home.hero.placeholder"];

const ClosingCta = () => {
  const ref = useReveal();
  const heading = useContentText("home.cta.heading");
  const body = useContentText("home.cta.body");
  const button = useContentText("home.cta.button");
  const placeholder = useContentText("home.hero.placeholder");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Closing call to action">
      <section className="bg-canvas">
        <div className="container mx-auto px-5 sm:px-8 pb-16 lg:pb-20">
          <div ref={ref} className="bg-surface-2 rounded-3xl px-6 sm:px-10 py-8 grid lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 flex items-center gap-4">
              <span className="text-accent text-3xl shrink-0" aria-hidden>
                <FaLeaf />
              </span>
              <div>
                <p className="font-semibold text-paper text-xl leading-tight">{heading}</p>
                <p className="text-paper-dim text-sm mt-1">{body}</p>
              </div>
            </div>
            <div className="lg:col-span-7">
              <AddressIntake size="sm" cta={button} placeholder={placeholder} />
            </div>
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default ClosingCta;
