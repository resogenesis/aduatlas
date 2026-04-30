import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import AddressIntake from "./AddressIntake";

const QuizHero = () => {
  return (
    <section className="relative overflow-hidden bg-canvas pt-28 sm:pt-32 lg:pt-40 pb-20 sm:pb-24 lg:pb-32">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-accent/5 blur-3xl" />

      <div className="relative container mx-auto px-5 sm:px-8 max-w-5xl">
        <div className="inline-flex items-center gap-2 mb-7 sm:mb-8">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
          <span className="text-paper-dim text-xs sm:text-sm font-medium tracking-[0.2em] uppercase">
            Pre-construction intelligence for homeowners
          </span>
        </div>

        <h1 className="font-display font-medium text-paper text-[2.6rem] sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[1.02] tracking-tight max-w-4xl">
          Find out what you can build <span className="italic">on your property.</span>
        </h1>

        <p className="mt-7 sm:mt-9 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed">
          Get a real answer on feasibility, cost, and next steps — before talking to a builder, ordering a $500 survey, or drawing a single line.
        </p>

        <div className="mt-9 sm:mt-12">
          <AddressIntake size="lg" />
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
          <span className="text-paper-dim">No signup required</span>
          <span className="text-paper-dim/40">·</span>
          <Link to="/quiz" className="text-paper hover:text-accent transition-colors inline-flex items-center gap-1.5">
            New to ADUs? Start here <FiArrowRight className="text-xs" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default QuizHero;
