import PageHeader from "../components/common/PageHeader";
import PublicStubFooter from "../components/gates/PublicStubFooter";

const stateNames = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

const ChooseState = () => {
  return (
    <div>
      <PageHeader
        title="ADU Regulations Where You Live"
        subtitle="Only a handful of states have written ADU rules into state law. For most homeowners, what you can build is decided by your city, county, ZIP, and HOA."
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-4xl">
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8 text-center">
          ADU rules in the U.S. mostly live at the local level. A small number of states have a statewide ADU baseline; the rest leave it to your city, county, and HOA. Two homes ten miles apart can have completely different setbacks, size caps, and impact fees. Don't trust generic answers.
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-10">
          <p className="text-paper font-semibold mb-2 text-center">Browse by state</p>
          <p className="text-paper-dim text-sm text-center mb-5">
            Inside each state, the real rules live at the city, county, and ZIP level.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 text-paper-dim text-sm">
            {stateNames.map((s) => (
              <div key={s} className="flex items-start gap-2">
                <span className="text-accent shrink-0 mt-0.5">·</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-paper-dim text-base sm:text-lg leading-relaxed text-center">
          The detailed breakdown (which states have a baseline, where city rules diverge, and which authority controls what) is inside the ADU Course, with your specific ZIP code's rules pulled into your Property Feasibility Study.
        </p>
      </section>

      <PublicStubFooter chapterName="Regulations · Chapter 4" />
    </div>
  );
};

export default ChooseState;
