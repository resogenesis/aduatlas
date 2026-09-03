import PageHeader from "../components/common/PageHeader";
import PublicStubFooter from "../components/gates/PublicStubFooter";
import { useContentText } from "../lib/content";
import { STATE_NAMES_COUNT } from "../lib/contentRegistry/chooseState";

// One component per list item so its hook is called at a stable place per
// item (not inside the .map() callback below) — same pattern as
// RiskCallouts.jsx's ItemRow.
const StateName = ({ i }) => {
  const name = useContentText(`choosestate.state.${i}`);
  return (
    <div className="flex items-start gap-2">
      <span className="text-accent shrink-0 mt-0.5">·</span>
      <span>{name}</span>
    </div>
  );
};

const ChooseState = () => {
  const title = useContentText("choosestate.hero.title");
  const subtitle = useContentText("choosestate.hero.subtitle");
  const intro = useContentText("choosestate.intro");
  const listHeading = useContentText("choosestate.list_heading");
  const listSubheading = useContentText("choosestate.list_subheading");
  const closing = useContentText("choosestate.closing");

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-4xl">
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8 text-center">
          {intro}
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-10">
          <p className="text-paper font-semibold mb-2 text-center">{listHeading}</p>
          <p className="text-paper-dim text-sm text-center mb-5">
            {listSubheading}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 text-paper-dim text-sm">
            {Array.from({ length: STATE_NAMES_COUNT }, (_, i) => <StateName key={i} i={i} />)}
          </div>
        </div>

        <p className="text-paper-dim text-base sm:text-lg leading-relaxed text-center">
          {closing}
        </p>
      </section>

      <PublicStubFooter chapterName="Regulations · Chapter 4" />
    </div>
  );
};

export default ChooseState;
