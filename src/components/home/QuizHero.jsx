import { Link } from "react-router-dom";
import { FiArrowRight, FiClock, FiShield } from "react-icons/fi";
import heroImage from "../../assets/home/hero_image.png";

const QuizHero = () => {
  return (
    <section
      className="relative bg-no-repeat bg-cover bg-center pt-24 sm:pt-32 lg:pt-40 pb-20 sm:pb-28 lg:pb-32"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative container mx-auto px-4 sm:px-6 max-w-4xl text-center text-white">
        <p className="text-white/80 font-semibold tracking-[0.25em] text-xs sm:text-sm mb-5 uppercase">
          The 2-Minute ADU Reality Check
        </p>

        <h1 className="font-bold text-3xl sm:text-5xl lg:text-6xl leading-tight drop-shadow-lg mb-5">
          Can you actually build an ADU<br className="hidden sm:block" /> on your property?
        </h1>

        <p className="text-base sm:text-lg lg:text-xl text-white/90 max-w-2xl mx-auto mb-8 drop-shadow">
          Find out before you spend $500 on a survey or talk to a single builder. Get your personalized ADU Readiness Score in under two minutes.
        </p>

        <Link
          to="/quiz"
          className="inline-flex items-center gap-3 px-8 sm:px-10 py-4 sm:py-5 rounded-xl bg-white text-[#0F3D33] text-lg sm:text-xl font-bold hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200"
        >
          Start Your ADU Plan <FiArrowRight />
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-7 text-xs sm:text-sm text-white/80">
          <span className="flex items-center gap-1.5"><FiClock /> ~2 minutes</span>
          <span className="flex items-center gap-1.5"><FiShield /> No signup required</span>
          <span className="hidden sm:inline">·</span>
          <span>Personalized to your ZIP code</span>
        </div>
      </div>
    </section>
  );
};

export default QuizHero;
