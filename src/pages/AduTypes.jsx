import PageHeader from "../components/common/PageHeader";
import PublicStubFooter from "../components/gates/PublicStubFooter";
import heroImg from "../assets/home/hero_image.png";
import { useContentText } from "../lib/content";
import { ADU_TYPES_COUNT } from "../lib/contentRegistry/aduTypes";

// One component per list item so its hook is called at a stable place per
// item (not inside the .map() callback below) — same pattern as
// RiskCallouts.jsx's ItemRow.
const TypeName = ({ i }) => {
  const name = useContentText(`adutypes.type.${i}`);
  return (
    <div className="flex items-start gap-2">
      <span className="text-accent shrink-0 mt-0.5">·</span>
      <span>{name}</span>
    </div>
  );
};

const AduTypes = () => {
  const title = useContentText("adutypes.hero.title");
  const subtitle = useContentText("adutypes.hero.subtitle");
  const intro = useContentText("adutypes.intro");
  const listHeading = useContentText("adutypes.list_heading");
  const closing = useContentText("adutypes.closing");

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        bg={heroImg}
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-4xl">
        <div className="text-center mb-10">
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            {intro}
          </p>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-10">
          <p className="text-paper font-semibold mb-5 text-center">{listHeading}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-paper-dim text-sm">
            {Array.from({ length: ADU_TYPES_COUNT }, (_, i) => <TypeName key={i} i={i} />)}
          </div>
        </div>

        <p className="text-paper-dim text-base sm:text-lg leading-relaxed text-center">
          {closing}
        </p>
      </section>

      <PublicStubFooter chapterName="Chapter 2" />
    </div>
  );
};

export default AduTypes;
