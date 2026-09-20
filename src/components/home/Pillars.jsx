import { FiBookOpen, FiFileText, FiHome, FiUsers } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { PILLARS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = Array.from({ length: PILLARS_COUNT }, (_, i) => [`home.pillars.item.${i}.title`, `home.pillars.item.${i}.desc`]).flat();
const ICONS = [FiBookOpen, FiFileText, FiUsers, FiHome];

const Pillar = ({ i }) => {
  const ref = useReveal(i * 90);
  const title = useContentText(`home.pillars.item.${i}.title`);
  const desc = useContentText(`home.pillars.item.${i}.desc`);
  const Icon = ICONS[i];
  const [l1, l2] = title.split("\n");
  return (
    <li ref={ref} className="flex items-start gap-4 px-2 sm:px-6 py-6 lg:py-2 lg:border-l lg:first:border-l-0 border-stroke">
      <span className="text-accent text-3xl shrink-0 mt-0.5" aria-hidden>
        <Icon />
      </span>
      <div>
        <h3 className="font-semibold text-paper text-base leading-tight mb-1.5">
          {l1}
          {l2 && (
            <>
              <br />
              {l2}
            </>
          )}
        </h3>
        <p className="text-paper-dim text-sm leading-relaxed">{desc}</p>
      </div>
    </li>
  );
};

const Pillars = () => (
  <AdminEditableSection keys={EDIT_KEYS} label="Four pillars">
    <section className="bg-canvas border-b border-stroke">
      <ul className="container mx-auto px-5 sm:px-8 py-6 lg:py-12 grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-stroke">
        {Array.from({ length: PILLARS_COUNT }, (_, i) => (
          <Pillar key={i} i={i} />
        ))}
      </ul>
    </section>
  </AdminEditableSection>
);

export default Pillars;
