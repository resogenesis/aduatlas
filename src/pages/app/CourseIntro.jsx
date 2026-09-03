import { Link } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiClock } from "react-icons/fi";
import Sections from "../../components/course/Sections";
import { useContentBlocks } from "../../lib/content";

// Course-level introduction — the welcome that frames the whole course.
// Not a module chapter: it carries no completion state and sits outside the
// progress math. Authored from ADUAtlas's own course-introduction script.
const CourseIntro = () => {
  const sections = useContentBlocks("course.intro");
  return (
  <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
    <Link to="/course" className="inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
      <FiArrowLeft /> Back to course
    </Link>

    <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
      Start here
    </p>
    <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
      Welcome to ADUAtlas.
    </h1>
    <div className="flex items-center gap-2 text-paper-dim text-sm mb-12">
      <FiClock /> ~6 min
    </div>

    <Sections sections={sections} />

    <div className="border-t border-stroke pt-8 mt-14 flex justify-end">
      <Link
        to="/course/m1c1"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
      >
        Begin Module 1 <FiArrowRight />
      </Link>
    </div>
  </div>
  );
};

export default CourseIntro;
