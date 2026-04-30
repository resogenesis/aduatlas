import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";

const intake = [
  "Location (ZIP code)",
  "Purpose — how will you use the ADU",
  "Lot size & existing structure (sq ft)",
  "Budget (site prep + structure)",
  "ADU type, size, and sq ft",
  "Timeline",
  "Access to the space",
];

const AduCTA = () => {
  return (
    <section className="bg-canvas py-20 sm:py-28 border-t border-stroke">
      <div className="container mx-auto px-5 sm:px-8 max-w-6xl">

        <div className="relative bg-surface-1-solid border border-stroke rounded-3xl overflow-hidden">
          {/* ambient accent glow */}
          <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-accent/8 blur-3xl" />

          <div className="relative grid lg:grid-cols-12 gap-10 lg:gap-12 p-8 sm:p-12 lg:p-16">

            {/* LEFT: copy */}
            <div className="lg:col-span-7">
              <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-5">
                Before you call a builder
              </p>
              <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight mb-5">
                Every builder will ask <span className="italic text-paper-dim">these seven things.</span>
              </h2>
              <p className="text-paper-dim text-base leading-relaxed max-w-lg mb-8">
                Show up with the answers and quotes are accurate the first time. Show up without them and every estimate you get is a guess.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/quiz"
                  className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
                >
                  Start the Reality Check <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/unlock"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-stroke text-paper font-medium hover:border-paper-dim transition"
                >
                  Unlock Paid Access
                </Link>
              </div>
            </div>

            {/* RIGHT: editorial intake list */}
            <div className="lg:col-span-5 lg:border-l lg:border-stroke lg:pl-12">
              <p className="text-paper text-xs uppercase tracking-[0.2em] mb-6">The seven questions</p>
              <ul className="space-y-px">
                {intake.map((item, i) => (
                  <li
                    key={item}
                    className="flex items-baseline gap-5 py-3 border-b border-stroke last:border-b-0"
                  >
                    <span className="font-display text-paper-dim text-sm tabular-nums shrink-0 w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-paper text-sm sm:text-base">{item}</span>
                  </li>
                ))}
              </ul>

              <p className="text-paper-dim text-xs italic leading-relaxed mt-6">
                Paid Access unlocks your personalized Feasibility Study & Site Plan that answers all seven for your specific lot.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AduCTA;
