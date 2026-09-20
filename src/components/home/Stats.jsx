import { FiMap } from "react-icons/fi";
import { useReveal } from "../../hooks/useReveal";
import { useContentText } from "../../lib/content";
import { STATS_COUNT } from "../../lib/contentRegistry/home";
import { AdminEditableSection } from "../../lib/adminEditBridge";

const EDIT_KEYS = [
  "home.stats.eyebrow",
  "home.stats.heading",
  ...Array.from({ length: STATS_COUNT }, (_, i) => [`home.stats.item.${i}.value`, `home.stats.item.${i}.label`]).flat(),
  "home.stats.map_label",
];

const Stat = ({ i }) => {
  const value = useContentText(`home.stats.item.${i}.value`);
  const label = useContentText(`home.stats.item.${i}.label`);
  return (
    <li className="px-6 py-4 lg:py-0 lg:border-l border-stroke text-center lg:text-left">
      <p className="font-primary font-extrabold text-paper text-3xl sm:text-4xl tracking-tight leading-none mb-1.5">{value}</p>
      <p className="text-paper-dim text-sm">{label}</p>
    </li>
  );
};

const Stats = () => {
  const ref = useReveal();
  const eyebrow = useContentText("home.stats.eyebrow");
  const heading = useContentText("home.stats.heading");
  const mapLabel = useContentText("home.stats.map_label");
  const [h1, h2] = heading.split("\n");
  const [m1, m2] = mapLabel.split("\n");

  return (
    <AdminEditableSection keys={EDIT_KEYS} label="Stats band">
      <section className="bg-canvas">
        <div ref={ref} className="container mx-auto px-5 sm:px-8 py-12 lg:py-16 grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-4">
            <p className="text-paper-dim text-[0.7rem] font-semibold tracking-[0.28em] uppercase mb-3">{eyebrow}</p>
            <h2 className="font-primary font-extrabold text-paper text-3xl sm:text-[2.4rem] leading-[1.05] tracking-[-0.025em]">
              {h1}
              {h2 && (
                <>
                  <br />
                  {h2}
                </>
              )}
            </h2>
          </div>
          <ul className="lg:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-y-6 items-center">
            {Array.from({ length: STATS_COUNT }, (_, i) => (
              <Stat key={i} i={i} />
            ))}
            <li className="px-6 py-4 lg:py-0 lg:border-l border-stroke flex items-center justify-center lg:justify-start gap-3">
              <FiMap className="text-accent text-3xl shrink-0" aria-hidden />
              <p className="font-semibold text-paper text-base leading-tight">
                {m1}
                {m2 && (
                  <>
                    <br />
                    {m2}
                  </>
                )}
              </p>
            </li>
          </ul>
        </div>
      </section>
    </AdminEditableSection>
  );
};

export default Stats;
