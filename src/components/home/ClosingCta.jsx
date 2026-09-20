import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { AdminEditableSection } from "../../lib/adminEditBridge";
import AddressIntake from "./AddressIntake";

const EDIT_KEYS = ["home.cta.heading", "home.cta.body", "home.cta.button", "home.hero.placeholder"];

// Forest band to close: one line, one address box.
const ClosingCta = () => {
  const ref = useReveal();
  const heading = useContentText("home.cta.heading");
  const body = useContentText("home.cta.body");
  const button = useContentText("home.cta.button");
  const placeholder = useContentText("home.hero.placeholder");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Closing call to action">
      <section className="bg-accent text-white">
        <div ref={ref} className="container mx-auto px-5 sm:px-8 py-16 lg:py-20 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5">
            <p className="font-primary font-extrabold tracking-[-0.025em] text-3xl sm:text-4xl leading-[1.05] mb-2">{heading}</p>
            <p className="text-white/75 text-base">{body}</p>
          </div>
          <div className="lg:col-span-7">
            <AddressIntake cta={button} placeholder={placeholder} buttonClassName="bg-forest-deep text-white hover:bg-paper hover:text-white" />
          </div>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default ClosingCta;
