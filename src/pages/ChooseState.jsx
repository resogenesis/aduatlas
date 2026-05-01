import PageHeader from "../components/common/PageHeader";
import PublicStubFooter from "../components/funnel/PublicStubFooter";
import heroImg from "../assets/home/hero_image.png";

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
        title="ADU Regulations by State"
        subtitle="Every state is different. Every city inside that state is different again. Knowing which rules apply to your specific lot is half the battle."
        bg={heroImg}
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-4xl">
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-8 text-center">
          ADU rules in the U.S. layer state code on top of city zoning on top of HOA restrictions. State A might mandate ADUs while City B inside it adds setback rules and impact fees that change the math entirely. Don't trust generic answers from one source.
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-10">
          <p className="text-paper font-semibold mb-5 text-center">All 50 states covered:</p>
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
          The state-by-state breakdown (what each state mandates, where city rules diverge, and which authority controls what) is inside the ADU system, with your specific ZIP code's rules pulled into your Feasibility Study.
        </p>
      </section>

      <PublicStubFooter chapterName="Regulations · Chapter 4" />
    </div>
  );
};

export default ChooseState;
